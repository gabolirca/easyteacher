import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Debe coincidir con registrar-advertencia.
const MAX_ADVERTENCIAS = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function barajar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorización" }, 401);

    const { token } = await req.json();
    if (!token) return json({ error: "Falta el token del examen" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente "como el alumno" — RLS decide solo si de verdad puede ver este examen
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Sesión inválida" }, 401);

    const { data: examen, error: examenError } = await callerClient
      .from("examenes")
      .select("id, titulo, duracion_min, fecha_apertura, fecha_cierre, estado, grupo_id")
      .eq("link_token", token)
      .eq("estado", "abierto")
      .maybeSingle();

    if (examenError || !examen) {
      return json({ error: "Este examen no existe, no está abierto, o no perteneces al grupo" }, 404);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ¿Ya existe un intento de este alumno para este examen?
    let { data: intento } = await admin
      .from("intentos")
      .select("*")
      .eq("examen_id", examen.id)
      .eq("alumno_id", user.id)
      .maybeSingle();

    // Si el examen ya cerró por fecha, no se puede empezar uno nuevo. A un
    // alumno que YA estaba en curso sí se le deja terminar y entregar lo que
    // tenía (no lo dejamos a medias), pero nadie nuevo puede entrar ni
    // reabrirlo después de la hora límite.
    const ahora = new Date();
    if (examen.fecha_cierre && ahora > new Date(examen.fecha_cierre) && (!intento || intento.estado !== "en_curso")) {
      return json({ error: "Este examen ya cerró, la hora límite pasó." }, 403);
    }

    if (examen.fecha_apertura && ahora < new Date(examen.fecha_apertura)) {
      return json({ error: "Este examen todavía no abre." }, 403);
    }

    if (!intento) {
      const { data: nuevoIntento, error: crearError } = await admin
        .from("intentos")
        .insert({ examen_id: examen.id, alumno_id: user.id, estado: "en_curso" })
        .select()
        .single();
      if (crearError) return json({ error: crearError.message }, 500);
      intento = nuevoIntento;
    }

    if (intento.estado === "entregado") return json({ estado: "entregado" });
    if (intento.estado === "bloqueado") {
      return json({
        estado: "bloqueado",
        motivo: intento.motivo_bloqueo,
        advertencias: intento.advertencias ?? 0,
      });
    }

    // en_curso: armar preguntas sin respuestas correctas
    const { data: preguntas, error: preguntasError } = await admin
      .from("preguntas")
      .select("*, opciones(*)")
      .eq("examen_id", examen.id)
      .order("orden", { ascending: true });

    if (preguntasError) return json({ error: preguntasError.message }, 500);

    const mapeo = { ...(intento.mapeo_relacionar || {}) };
    let mapeoCambio = false;

    const preguntasSanitizadas = (preguntas || []).map((p: any) => {
      const base = { id: p.id, tipo: p.tipo, texto: p.texto, imagen_url: p.imagen_url, puntos: p.puntos };

      if (p.tipo === "opcion_multiple" || p.tipo === "verdadero_falso") {
        const opciones = (p.opciones || [])
          .sort((a: any, b: any) => a.orden - b.orden)
          .map((o: any) => ({ id: o.id, texto: o.texto }));
        return { ...base, opciones };
      }

      if (p.tipo === "completar") {
        const numBlancos = (p.contenido_json?.plantilla?.match(/___/g) || []).length;
        return { ...base, plantilla: p.contenido_json?.plantilla || "", num_blancos: numBlancos };
      }

      if (p.tipo === "relacionar") {
        const pares = p.contenido_json?.pares || [];
        const izquierda = pares.map((par: any, i: number) => ({ id: i, texto: par.izquierda }));

        let mapaPregunta = mapeo[p.id];
        if (!mapaPregunta) {
          // Genera ids opacos (no revelan el índice correcto) y los baraja
          const derechaConIndice = pares.map((par: any, i: number) => ({
            opaqueId: crypto.randomUUID(),
            trueIndex: i,
            texto: par.derecha,
          }));
          mapaPregunta = {};
          derechaConIndice.forEach((d: any) => { mapaPregunta[d.opaqueId] = d.trueIndex; });
          mapeo[p.id] = mapaPregunta;
          mapeoCambio = true;
          const derecha = barajar(derechaConIndice).map((d: any) => ({ id: d.opaqueId, texto: d.texto }));
          return { ...base, izquierda, derecha };
        } else {
          // Reconstruye el orden barajado ya guardado (para que no cambie si recarga la página)
          const derecha = barajar(
            Object.entries(mapaPregunta).map(([opaqueId, trueIndex]: [string, any]) => ({
              id: opaqueId,
              texto: pares[trueIndex]?.derecha,
            }))
          );
          return { ...base, izquierda, derecha };
        }
      }

      return base;
    });

    if (mapeoCambio) {
      await admin.from("intentos").update({ mapeo_relacionar: mapeo }).eq("id", intento.id);
    }

    return json({
      estado: "en_curso",
      intento_id: intento.id,
      // El cronómetro se ancla a esta fecha del servidor, no al reloj del
      // celular: si el alumno recarga la página no se le regala tiempo nuevo,
      // y si le cambia la hora al dispositivo tampoco gana nada.
      intento_inicio: intento.fecha_inicio,
      advertencias: intento.advertencias ?? 0,
      max_advertencias: MAX_ADVERTENCIAS,
      servidor_ahora: ahora.toISOString(),
      examen: { titulo: examen.titulo, duracion_min: examen.duracion_min, fecha_cierre: examen.fecha_cierre },
      preguntas: preguntasSanitizadas,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

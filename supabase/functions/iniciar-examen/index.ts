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

// Barajado ESTABLE: la semilla sale del id del intento, asi que a cada alumno
// le toca un orden distinto pero siempre el MISMO si recarga la pagina. No se
// guarda nada en la base: se vuelve a calcular igual cada vez.
function semilla(txt: string): number {
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function azarDe(sem: number) {
  let e = sem;
  return () => {
    e |= 0; e = (e + 0x6D2B79F5) | 0;
    let t = Math.imul(e ^ (e >>> 15), 1 | e);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajarCon<T>(arr: T[], sem: number): T[] {
  const a = [...arr];
  const azar = azarDe(sem);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
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
      .select("id, titulo, duracion_min, fecha_apertura, fecha_cierre, estado, grupo_id, barajar_preguntas, barajar_opciones")
      .eq("link_token", token)
      .eq("estado", "abierto")
      .maybeSingle();

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Quien esta usando la app en este telefono. Se manda siempre que algo
    // falla: el caso mas comun es que el telefono traiga la sesion de otra
    // cuenta (otro maestro, otra prueba) y el alumno no tenga forma de verlo.
    const { data: quienEs } = await admin
      .from("alumnos").select("nombre, matricula").eq("id", user.id).maybeSingle();
    const sesionDe = quienEs
      ? { nombre: quienEs.nombre, matricula: quienEs.matricula }
      : { nombre: "", matricula: "" };

    if (examenError || !examen) {
      // El de arriba pasa por RLS, asi que un fallo puede ser tres cosas muy
      // distintas. Antes las tres decian lo mismo y no habia como saber cual
      // era, ni desde el telefono ni desde los registros.
      const { data: real } = await admin
        .from("examenes").select("id, titulo, estado, grupo_id, grupos(nombre)")
        .eq("link_token", token).maybeSingle();

      if (!real) {
        return json({
          error: "Este link no corresponde a ningún examen. Pídele a tu maestro que te lo vuelva a mandar.",
          motivo: "link_desconocido", sesion_de: sesionDe,
        }, 404);
      }

      if (real.estado !== "abierto") {
        const comoEsta = real.estado === "borrador"
          ? "Tu maestro todavía no publica este examen."
          : "Este examen ya está cerrado.";
        return json({
          error: `${comoEsta} No es problema de tu conexión.`,
          motivo: "no_publicado", estado_examen: real.estado, sesion_de: sesionDe,
        }, 409);
      }

      // El examen existe y esta abierto: entonces es que esta cuenta no
      // pertenece a ese grupo.
      const grupo = (real as any).grupos?.nombre || "otro grupo";
      return json({
        error: `Este examen es del grupo ${grupo} y la cuenta con la que entraste no está en ese grupo.`,
        motivo: "otro_grupo", grupo, sesion_de: sesionDe,
      }, 403);
    }

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

    const { data: perfilAlumno } = await admin
      .from("alumnos").select("nombre, matricula").eq("id", user.id).maybeSingle();

    const mapeo = { ...(intento.mapeo_relacionar || {}) };
    let mapeoCambio = false;

    const preguntasSanitizadas = (preguntas || []).map((p: any) => {
      const base = { id: p.id, tipo: p.tipo, texto: p.texto, imagen_url: p.imagen_url, puntos: p.puntos,
                     pide_procedimiento: !!p.pide_procedimiento };

      if (p.tipo === "opcion_multiple" || p.tipo === "verdadero_falso") {
        let opciones = (p.opciones || [])
          .sort((a: any, b: any) => a.orden - b.orden)
          .map((o: any) => ({ id: o.id, texto: o.texto }));
        // Verdadero/falso se deja en paz: barajarlo solo confunde.
        if (examen.barajar_opciones && p.tipo === "opcion_multiple") {
          opciones = barajarCon(opciones, semilla(intento.id + p.id));
        }
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

    const preguntasFinales = examen.barajar_preguntas
      ? barajarCon(preguntasSanitizadas, semilla(intento.id))
      : preguntasSanitizadas;

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
      preguntas: preguntasFinales,
      // Para la marca de agua de la pantalla del examen.
      alumno: { nombre: perfilAlumno?.nombre || "", matricula: perfilAlumno?.matricula || "" },
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

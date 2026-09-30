import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// La logica de calificacion vive aparte porque scripts/recalificar.mjs
// usa exactamente la misma: una sola fuente, sin copias que se separen.
import { puntosDePregunta } from "../_compartido/calificar.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_EVENTOS = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Salidas que el dispositivo detecto sin poder avisar al servidor en su
// momento. Se mandan al entregar. `conto` viene del cliente: es false solo
// cuando la salida coincidio con un cambio de conectividad (la alerta de wifi
// del sistema tapando el navegador), y true cuando fue una salida real que
// simplemente no se pudo reportar por falta de red.
function sanearEventos(entrada: unknown) {
  if (!Array.isArray(entrada)) return [];
  return entrada.slice(-MAX_EVENTOS).map((e: any) => ({
    ts: typeof e?.ts === "string" ? e.ts.slice(0, 40) : new Date().toISOString(),
    tipo: typeof e?.tipo === "string" ? e.tipo.slice(0, 40) : "desconocido",
    online: false,
    conto: e?.conto === true,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorización" }, 401);

    const { intento_id, respuestas, motivo_bloqueo, eventos_pendientes, advertencias_locales,
            procedimientos } = await req.json();
    if (!intento_id || typeof respuestas !== "object") {
      return json({ error: "Faltan datos (intento_id o respuestas)" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Sesión inválida" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: intento, error: intentoError } = await admin
      .from("intentos")
      .select("*")
      .eq("id", intento_id)
      .maybeSingle();

    if (intentoError || !intento) return json({ error: "Intento no encontrado" }, 404);
    if (intento.alumno_id !== user.id) return json({ error: "Este intento no te pertenece" }, 403);

    // Idempotente: si ya se entregó o bloqueó, no se vuelve a calificar.
    // Esto es lo que hace seguro que el navegador reintente cuando la red
    // se cae justo al entregar: aunque el primer envío sí haya llegado y solo
    // se haya perdido la respuesta, el reintento contesta "ok" sin duplicar.
    if (intento.estado !== "en_curso") {
      return json({ ok: true, estado: intento.estado, ya_estaba: true });
    }

    const { data: preguntas, error: preguntasError } = await admin
      .from("preguntas")
      .select("*, opciones(*)")
      .eq("examen_id", intento.examen_id);

    if (preguntasError) return json({ error: preguntasError.message }, 500);

    let totalPuntos = 0;
    let puntosObtenidos = 0;
    const filasRespuestas = [];

    for (const p of preguntas || []) {
      totalPuntos += Number(p.puntos) || 0;
      const respuestaAlumno = respuestas[p.id];
      const puntos = puntosDePregunta(p, respuestaAlumno, intento.mapeo_relacionar || {});

      puntosObtenidos += puntos;
      // El dibujo del procedimiento no se califica: solo se guarda para que el
      // maestro pueda verlo. Se acota el tamanio por si llega algo raro.
      let dibujo: string | null = null;
      if (p.pide_procedimiento && procedimientos && typeof procedimientos === "object") {
        const d = procedimientos[p.id];
        if (typeof d === "string" && d.startsWith("data:image/png;base64,") && d.length <= 400_000) {
          dibujo = d;
        }
      }

      filasRespuestas.push({
        intento_id,
        pregunta_id: p.id,
        respuesta_json: respuestaAlumno ?? null,
        puntos_obtenidos: Math.round(puntos * 100) / 100,
        procedimiento: dibujo,
      });
    }

    if (filasRespuestas.length > 0) {
      const { error: insertError } = await admin.from("respuestas").insert(filasRespuestas);
      if (insertError) return json({ error: insertError.message }, 500);
    }

    const calificacion = totalPuntos > 0 ? Math.round((puntosObtenidos / totalPuntos) * 1000) / 10 : 0;
    const nuevoEstado = motivo_bloqueo ? "bloqueado" : "entregado";

    // Vacía la bitácora que el dispositivo juntó mientras no había red.
    const previos = Array.isArray(intento.eventos_salida) ? intento.eventos_salida : [];
    const eventos = [...previos, ...sanearEventos(eventos_pendientes)].slice(-MAX_EVENTOS);

    // El contador que llevó el dispositivo sin conexión se reconcilia aquí.
    // Se toma el mayor de los dos: el alumno no gana nada recargando (el del
    // servidor sobrevive) ni quedandose sin red (el local sube igual).
    const advertenciasFinal = Math.max(
      Number(intento.advertencias) || 0,
      Number(advertencias_locales) || 0,
    );

    const { error: updateError } = await admin
      .from("intentos")
      .update({
        estado: nuevoEstado,
        calificacion,
        fecha_fin: new Date().toISOString(),
        motivo_bloqueo: motivo_bloqueo || null,
        eventos_salida: eventos,
        advertencias: advertenciasFinal,
      })
      .eq("id", intento_id)
      .eq("estado", "en_curso");

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true, estado: nuevoEstado, advertencias: advertenciasFinal });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

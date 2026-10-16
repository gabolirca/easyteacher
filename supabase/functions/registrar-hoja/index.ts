import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// La misma cuenta que al entregar en linea y al recalificar.
import { puntosDePregunta } from "../_compartido/calificar.js";

// Guarda lo que el maestro confirmo de una hoja de respuestas.
//
// Entrada:
//   examen_id, alumno_id
//   marcas:          { pregunta_id: opcion_id | null }   (opcion multiple y V/F)
//   puntos_manuales: { pregunta_id: numero }              (las que dicen "a mano")
//   reemplazar:      true para sobrescribir un intento que ya existe
//
// La calificacion la hace el servidor, no el navegador: el telefono solo dice
// que burbuja estaba rellena.
//
// Candados: solo el maestro duenio del grupo del examen, y solo para un
// alumno inscrito en ese grupo.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const AUTOMATICAS = ["opcion_multiple", "verdadero_falso"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorización" }, 401);

    const { examen_id, alumno_id, marcas, puntos_manuales, reemplazar } = await req.json();
    if (!examen_id || !alumno_id || typeof marcas !== "object" || marcas === null) {
      return json({ error: "Faltan datos (examen, alumno o respuestas)" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Sesión inválida" }, 401);

    const admin = createClient(url, serviceKey);

    const { data: examen } = await admin
      .from("examenes").select("id, grupo_id, grupos(profesor_id)").eq("id", examen_id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    if (!examen || (examen as any).grupos?.profesor_id !== user.id) {
      return json({ error: "Este examen no es de uno de tus grupos" }, 403);
    }

    const { data: inscrito } = await admin
      .from("grupo_alumnos").select("alumno_id")
      .eq("grupo_id", examen.grupo_id).eq("alumno_id", alumno_id).maybeSingle();
    if (!inscrito) return json({ error: "Ese alumno no está inscrito en el grupo del examen" }, 400);

    const { data: preguntas, error: errPreg } = await admin
      .from("preguntas").select("*, opciones(*)").eq("examen_id", examen_id);
    if (errPreg) return json({ error: errPreg.message }, 500);
    if (!preguntas?.length) return json({ error: "El examen no tiene preguntas" }, 400);

    const { data: previo } = await admin
      .from("intentos").select("id, origen, estado, calificacion")
      .eq("examen_id", examen_id).eq("alumno_id", alumno_id).maybeSingle();
    if (previo && !reemplazar) {
      return json({
        error: previo.origen === "hoja"
          ? "Ya habías guardado la hoja de este alumno."
          : "Este alumno ya contestó el examen en línea.",
        ya_existe: true,
        origen: previo.origen,
        calificacion: previo.calificacion,
      }, 409);
    }

    let total = 0;
    let obtenidos = 0;
    const filas = [];
    for (const p of preguntas) {
      const vale = Number(p.puntos) || 0;
      total += vale;
      let respuesta = null;
      let puntos = 0;
      if (AUTOMATICAS.includes(p.tipo)) {
        const elegida = marcas[p.id] ?? null;
        // Solo se acepta una opcion que de verdad sea de esa pregunta.
        respuesta = (p.opciones || []).some((o: { id: string }) => o.id === elegida) ? elegida : null;
        puntos = puntosDePregunta(p, respuesta, {});
      } else {
        const manual = Number((puntos_manuales || {})[p.id]);
        puntos = Number.isFinite(manual) ? Math.min(vale, Math.max(0, manual)) : 0;
      }
      puntos = Math.round(puntos * 100) / 100;
      obtenidos += puntos;
      filas.push({ pregunta_id: p.id, respuesta_json: respuesta, puntos_obtenidos: puntos });
    }

    const calificacion = total > 0 ? Math.round((obtenidos / total) * 1000) / 10 : 0;
    const ahora = new Date().toISOString();

    let intentoId: string;
    if (previo) {
      const { error: errBorrar } = await admin.from("respuestas").delete().eq("intento_id", previo.id);
      if (errBorrar) return json({ error: errBorrar.message }, 500);
      const { error } = await admin.from("intentos").update({
        estado: "entregado", calificacion, origen: "hoja", capturado_por: user.id,
        fecha_fin: ahora, motivo_bloqueo: null,
      }).eq("id", previo.id);
      if (error) return json({ error: error.message }, 500);
      intentoId = previo.id;
    } else {
      const { data, error } = await admin.from("intentos").insert({
        examen_id, alumno_id, estado: "entregado", calificacion, origen: "hoja",
        capturado_por: user.id, fecha_inicio: ahora, fecha_fin: ahora,
      }).select("id").single();
      if (error) return json({ error: error.message }, 500);
      intentoId = data.id;
    }

    const { error: errResp } = await admin.from("respuestas")
      .insert(filas.map((f) => ({ ...f, intento_id: intentoId })));
    if (errResp) return json({ error: errResp.message }, 500);

    return json({ ok: true, intento_id: intentoId, calificacion, obtenidos, total });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

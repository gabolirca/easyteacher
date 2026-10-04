import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// Misma logica que enviar-respuestas y scripts/recalificar.mjs: un solo
// archivo, para que el boton, el script y la entrega nunca califiquen distinto.
import { puntosDePregunta } from "../_compartido/calificar.js";

// Vuelve a calificar los intentos ya entregados de un examen.
//
// Para que sirve: el maestro se equivoca en la clave (marco la opcion que no
// era, olvido aceptar una respuesta) y la corrige DESPUES de que los alumnos
// ya contestaron. Los intentos viejos conservan la calificacion de ese dia;
// este boton los vuelve a pasar por la clave corregida.
//
// Dos pasos, igual que el script:
//   { examen_id }                -> solo calcula y dice que cambiaria
//   { examen_id, aplicar: true } -> ademas lo guarda
//
// Candado: solo el maestro duenio del grupo del examen. Se comprueba leyendo
// el examen con el token del que llama (la RLS decide), no con la llave de
// servicio.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorización" }, 401);

    const { examen_id, aplicar } = await req.json();
    if (!examen_id) return json({ error: "Falta el examen" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Sesión inválida" }, 401);

    const admin = createClient(url, serviceKey);

    const { data: perfil } = await admin.from("profesores").select("id").eq("id", user.id).maybeSingle();
    if (!perfil) return json({ error: "Solo el maestro puede recalificar" }, 403);

    const { data: examen } = await admin
      .from("examenes").select("id, titulo, grupos(profesor_id)").eq("id", examen_id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    if (!examen || (examen as any).grupos?.profesor_id !== user.id) {
      return json({ error: "Este examen no es de uno de tus grupos" }, 403);
    }

    const { data: preguntas, error: errPreg } = await admin
      .from("preguntas").select("*, opciones(*)").eq("examen_id", examen_id);
    if (errPreg) return json({ error: errPreg.message }, 500);

    const totalPuntos = (preguntas || []).reduce((s, p) => s + (Number(p.puntos) || 0), 0);
    if (totalPuntos <= 0) return json({ error: "El examen no tiene puntos: no hay nada que recalcular." }, 400);

    const { data: intentos, error: errInt } = await admin
      .from("intentos")
      .select("id, alumno_id, calificacion, mapeo_relacionar, alumnos(nombre)")
      .eq("examen_id", examen_id)
      .in("estado", ["entregado", "bloqueado"]);
    if (errInt) return json({ error: errInt.message }, 500);

    const ids = (intentos || []).map((i) => i.id);
    const respuestas: Record<string, unknown>[] = [];
    // Todas las respuestas de una vez, de mil en mil.
    for (let desde = 0; ids.length; desde += 1000) {
      const { data, error } = await admin
        .from("respuestas")
        .select("id, intento_id, pregunta_id, respuesta_json, puntos_obtenidos")
        .in("intento_id", ids)
        .order("id", { ascending: true })
        .range(desde, desde + 999);
      if (error) return json({ error: error.message }, 500);
      respuestas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    // deno-lint-ignore no-explicit-any
    const porIntento = new Map<string, Map<string, any>>();
    // deno-lint-ignore no-explicit-any
    for (const r of respuestas as any[]) {
      if (!porIntento.has(r.intento_id)) porIntento.set(r.intento_id, new Map());
      porIntento.get(r.intento_id)!.set(r.pregunta_id, r);
    }

    const cambios = [];
    for (const intento of intentos || []) {
      const guardadas = porIntento.get(intento.id) || new Map();
      let obtenidos = 0;
      const arreglos = [];

      for (const p of preguntas || []) {
        const guardada = guardadas.get(p.id);
        const nuevos = Math.round(
          puntosDePregunta(p, guardada?.respuesta_json ?? null, intento.mapeo_relacionar || {}) * 100) / 100;
        obtenidos += nuevos;
        const antes = Number(guardada?.puntos_obtenidos ?? 0);
        if (guardada && Math.abs(antes - nuevos) > 0.005) {
          arreglos.push({ id: guardada.id, orden: p.orden, antes, nuevos });
        }
      }

      const nuevaCalif = Math.round((obtenidos / totalPuntos) * 1000) / 10;
      const califAntes = Number(intento.calificacion ?? 0);
      if (!arreglos.length && Math.abs(califAntes - nuevaCalif) <= 0.05) continue;

      cambios.push({
        intento_id: intento.id,
        // deno-lint-ignore no-explicit-any
        nombre: (intento as any).alumnos?.nombre ?? "",
        antes: califAntes,
        despues: nuevaCalif,
        preguntas: arreglos.map((a) => ({ numero: (Number(a.orden) || 0) + 1, antes: a.antes, despues: a.nuevos })),
        _arreglos: arreglos,
      });
    }

    if (aplicar) {
      for (const c of cambios) {
        for (const a of c._arreglos) {
          const { error } = await admin.from("respuestas").update({ puntos_obtenidos: a.nuevos }).eq("id", a.id);
          if (error) return json({ error: `No se pudo guardar una respuesta: ${error.message}` }, 500);
        }
        const { error } = await admin.from("intentos").update({ calificacion: c.despues }).eq("id", c.intento_id);
        if (error) return json({ error: `No se pudo guardar un intento: ${error.message}` }, 500);
      }
    }

    return json({
      ok: true,
      aplicado: Boolean(aplicar),
      revisados: (intentos || []).length,
      cambios: cambios.map(({ _arreglos, ...resto }) => resto),
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

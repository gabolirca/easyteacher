import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Cierra la actividad y convierte en puntos la lista definitiva del maestro.
//
// El maestro trabaja con interruptores en su pantalla, sin mandar nada al
// servidor mientras da clase (asi funciona con la red del colegio caida).
// Al cerrar manda UNA sola vez la lista de quienes participaron:
//
//   { actividad_id, aprobados: [alumno_id, ...] }
//
// Esa lista es la autoridad: quien esta, cobra puntos; quien no, queda
// rechazado aunque hubiera reclamado. Si no se manda `aprobados`, se cae al
// comportamiento automatico (aprobar los reclamos pendientes, y con
// inicio_marcado='todos' sumar ademas a los presentes sin fila).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorizacion" }, 401);

    const { actividad_id, aprobados } = await req.json();
    if (!actividad_id) return json({ error: "Falta actividad_id" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: "Sesion invalida" }, 401);

    const admin = createClient(url, serviceKey);

    const { data: act } = await admin
      .from("actividades_sesion")
      .select("id, nombre, valor, inicio_marcado, sesiones(id, grupo_id, fecha)")
      .eq("id", actividad_id).maybeSingle();
    if (!act) return json({ error: "Esta actividad no existe" }, 404);

    const sesion: any = act.sesiones;
    const { data: grupo } = await admin
      .from("grupos").select("id, profesor_id").eq("id", sesion.grupo_id).maybeSingle();
    if (!grupo || grupo.profesor_id !== user.id) {
      return json({ error: "Esta actividad no es tuya" }, 403);
    }

    const valor = Number(act.valor) || 0;
    const ahora = new Date().toISOString();

    // Solo alumnos realmente inscritos en el grupo. Nunca se confia en la
    // lista del cliente sin filtrarla.
    const { data: inscritos } = await admin
      .from("grupo_alumnos").select("alumno_id").eq("grupo_id", sesion.grupo_id);
    const delGrupo = new Set((inscritos || []).map((r: any) => r.alumno_id));

    let listaFinal: string[] | null = null;

    if (Array.isArray(aprobados)) {
      listaFinal = [...new Set(aprobados.filter((id: any) => delGrupo.has(id)))];
    } else {
      // Modo automatico: los reclamos pendientes, mas los presentes si la
      // actividad se creo con 'todos'.
      const { data: filas } = await admin
        .from("participaciones_sesion").select("alumno_id, estado").eq("actividad_id", actividad_id);
      const conjunto = new Set(
        (filas || []).filter((f: any) => f.estado === "pendiente").map((f: any) => f.alumno_id),
      );
      if (act.inicio_marcado === "todos") {
        const { data: presentes } = await admin
          .from("asistencias").select("alumno_id")
          .eq("grupo_id", sesion.grupo_id).eq("fecha", sesion.fecha)
          .in("estado", ["presente", "retardo"]);
        (presentes || []).forEach((p: any) => conjunto.add(p.alumno_id));
      }
      listaFinal = [...conjunto].filter((id) => delGrupo.has(id));
    }

    if (listaFinal.length > 0) {
      const filas = listaFinal.map((alumno_id) => ({
        actividad_id, alumno_id, puntos: valor, estado: "aprobada",
        origen: "maestro", registrado_por: user.id, resuelto_en: ahora,
      }));
      const { error } = await admin
        .from("participaciones_sesion")
        .upsert(filas, { onConflict: "actividad_id,alumno_id" });
      if (error) return json({ error: error.message }, 500);
    }

    // Todo lo que no quedo en la lista se rechaza: si un alumno reclamo y el
    // maestro lo quito, no cobra.
    let rechazo = admin.from("participaciones_sesion")
      .update({ estado: "rechazada", puntos: 0, resuelto_en: ahora, registrado_por: user.id })
      .eq("actividad_id", actividad_id).neq("estado", "rechazada");
    if (listaFinal.length > 0) {
      rechazo = rechazo.not("alumno_id", "in", `(${listaFinal.join(",")})`);
    }
    const { error: errRechazo } = await rechazo;
    if (errRechazo) return json({ error: errRechazo.message }, 500);

    const { error: errCerrar } = await admin
      .from("actividades_sesion").update({ abierta: false }).eq("id", actividad_id);
    if (errCerrar) return json({ error: errCerrar.message }, 500);

    return json({
      ok: true,
      actividad: act.nombre,
      valor,
      con_puntos: listaFinal.length,
      puntos_generados: listaFinal.length * valor,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// El alumno dice "yo hice esta actividad". Aqui NO se le dan puntos: la fila
// nace 'pendiente' con puntos 0, y solo el maestro la convierte en puntos al
// cerrar la actividad. El alumno nunca manda el valor ni el estado.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorización" }, 401);

    const { actividad_id } = await req.json();
    if (!actividad_id) return json({ error: "Falta actividad_id" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "Sesión inválida" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: actividad } = await admin
      .from("actividades_sesion")
      .select("id, nombre, abierta, sesion_id, sesiones(id, grupo_id, fecha, estado)")
      .eq("id", actividad_id)
      .maybeSingle();

    if (!actividad) return json({ error: "Esta actividad no existe" }, 404);

    const sesion: any = actividad.sesiones;
    if (!sesion || sesion.estado !== "activa") {
      return json({ error: "Esta clase ya terminó" }, 403);
    }
    if (!actividad.abierta) {
      return json({ error: "Tu maestro ya cerró esta actividad" }, 403);
    }

    // Tiene que pertenecer al grupo...
    const { data: inscrito } = await admin
      .from("grupo_alumnos")
      .select("alumno_id")
      .eq("grupo_id", sesion.grupo_id)
      .eq("alumno_id", user.id)
      .maybeSingle();

    if (!inscrito) return json({ error: "No perteneces a este grupo" }, 403);

    // ...y estar presente en el salon. Sin presencia registrada no hay reclamo:
    // esto es lo que impide reclamar puntos desde la casa.
    const { data: asistencia } = await admin
      .from("asistencias")
      .select("id, estado")
      .eq("grupo_id", sesion.grupo_id)
      .eq("alumno_id", user.id)
      .eq("fecha", sesion.fecha)
      .maybeSingle();

    if (!asistencia || asistencia.estado === "falta") {
      return json({ error: "Primero escanea el QR de la clase para registrar tu presencia" }, 403);
    }

    const { error: insertError } = await admin
      .from("participaciones_sesion")
      .insert({
        actividad_id,
        alumno_id: user.id,
        puntos: 0,
        estado: "pendiente",
        origen: "alumno",
      });

    // 23505 = ya habia reclamado. Se responde ok para que reintentar tras un
    // corte de red no marque error al alumno.
    if (insertError && insertError.code !== "23505") {
      return json({ error: insertError.message }, 500);
    }

    return json({
      ok: true,
      actividad: actividad.nombre,
      estado: "pendiente",
      ya_estaba: insertError?.code === "23505",
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

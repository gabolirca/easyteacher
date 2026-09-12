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

// Egresar libera la matricula y el correo del alumno, sin borrar nada: su id
// no cambia, asi que calificaciones, asistencias y participaciones siguen
// ligadas a el. Solo se marca como inactivo.
//
// Candados: solo lo egresa su maestro duenio, y solo si ya no esta en ningun
// grupo activo (aunque ese grupo fuera de otro profesor).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorizacion" }, 401);

    const { alumno_ids, ciclo } = await req.json();
    if (!Array.isArray(alumno_ids) || alumno_ids.length === 0) {
      return json({ error: "Se requiere una lista de alumnos" }, 400);
    }
    if (!ciclo || String(ciclo).trim().length < 4) {
      return json({ error: "Indica el ciclo escolar de egreso" }, 400);
    }
    const cicloLimpio = String(ciclo).trim().slice(0, 40);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Sesion invalida" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: perfil } = await admin.from("profesores").select("id").eq("id", user.id).maybeSingle();
    if (!perfil) return json({ error: "Solo un profesor puede egresar alumnos" }, 403);

    const resultados = [];

    for (const alumnoId of alumno_ids.slice(0, 200)) {
      const { data: alumno } = await admin
        .from("alumnos").select("id, nombre, matricula, activo, profesor_id, correo_login")
        .eq("id", alumnoId).maybeSingle();

      if (!alumno) { resultados.push({ alumnoId, ok: false, error: "No existe" }); continue; }
      if (!alumno.activo) {
        resultados.push({ alumnoId, nombre: alumno.nombre, ok: false, error: "Ya estaba egresado" });
        continue;
      }
      if (alumno.profesor_id !== user.id) {
        resultados.push({ alumnoId, nombre: alumno.nombre, ok: false, error: "Este alumno no es tuyo" });
        continue;
      }

      const { data: inscripciones } = await admin
        .from("grupo_alumnos").select("grupos(id, nombre, archivado, profesor_id)")
        .eq("alumno_id", alumnoId);
      const grupos = (inscripciones || []).map((i: any) => i.grupos).filter(Boolean);
      const activos = grupos.filter((g: any) => !g.archivado);

      if (activos.length > 0) {
        const propios = activos.filter((g: any) => g.profesor_id === user.id).map((g: any) => g.nombre);
        const ajenos = activos.length - propios.length;
        let detalle = propios.length ? `sigue en ${propios.join(", ")}` : "";
        if (ajenos > 0) detalle += `${detalle ? " y " : ""}en ${ajenos} grupo(s) de otro maestro`;
        resultados.push({ alumnoId, nombre: alumno.nombre, ok: false,
          error: `No se puede egresar: ${detalle}. Archiva o quitalo de esos grupos primero.` });
        continue;
      }

      // Liberar el correo de login para que otra persona pueda usarlo.
      const { data: authUser } = await admin.auth.admin.getUserById(alumnoId);
      const correoViejo = authUser?.user?.email || alumno.correo_login || "";
      let correoNuevo = correoViejo;
      if (correoViejo) {
        const [local, dominio] = correoViejo.split("@");
        const sufijo = cicloLimpio.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
        correoNuevo = `${local}.egresado-${sufijo}@${dominio || "alumnos.easyteacher.app"}`;
        const { error } = await admin.auth.admin.updateUserById(alumnoId, { email: correoNuevo });
        if (error) {
          resultados.push({ alumnoId, nombre: alumno.nombre, ok: false,
            error: `No se pudo liberar el correo: ${error.message}` });
          continue;
        }
      }

      const { error: errMarcar } = await admin.from("alumnos").update({
        activo: false, ciclo_egreso: cicloLimpio,
        fecha_egreso: new Date().toISOString(), correo_login: correoNuevo,
      }).eq("id", alumnoId);

      if (errMarcar) {
        resultados.push({ alumnoId, nombre: alumno.nombre, ok: false, error: errMarcar.message });
        continue;
      }

      resultados.push({ alumnoId, nombre: alumno.nombre, ok: true, matricula_liberada: alumno.matricula });
    }

    return json({
      resultados,
      egresados: resultados.filter((r: any) => r.ok).length,
      fallidos: resultados.filter((r: any) => !r.ok).length,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

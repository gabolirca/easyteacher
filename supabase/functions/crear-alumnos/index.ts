import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOMINIO = "alumnos.easyteacher.app";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Al egresar, el correo se renombra a  local.egresado-<ciclo>@dominio  para
// liberar el original. Al reinscribir hay que deshacer eso o el alumno se
// queda sin poder entrar.
function correoSinEgreso(correo: string) {
  const [local, dominio] = (correo || "").split("@");
  if (!local || !dominio) return "";
  return `${local.replace(/\.egresado-[^@]*$/i, "")}@${dominio}`;
}

function normalizarNombre(n: string) {
  return (n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorizacion" }, 401);

    const { grupo_id, alumnos } = await req.json();
    if (!grupo_id || !Array.isArray(alumnos) || alumnos.length === 0) {
      return json({ error: "Se requiere grupo_id y una lista de alumnos" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Sesion invalida" }, 401);

    // RLS confirma que el grupo es de quien llama.
    const { data: grupo } = await caller.from("grupos").select("id").eq("id", grupo_id).maybeSingle();
    if (!grupo) return json({ error: "No tienes permiso sobre ese grupo, o no existe" }, 403);

    const admin = createClient(url, serviceKey);
    const resultados = [];

    for (const alumno of alumnos) {
      const { nombre, matricula, correo, genero, alumno_id } = alumno;

      // ---- Camino 1: el maestro lo eligio del buscador ----
      // Viene el id exacto, asi que no hay que adivinar nada por matricula.
      // Sirve para volver a inscribir a alguien que ya tuvo en otro grupo o
      // en otro ciclo, conservando su historial y su misma cuenta.
      if (alumno_id) {
        const { data: suyo } = await admin
          .from("alumnos").select("id, nombre, matricula, activo, correo_login")
          .eq("id", alumno_id).eq("profesor_id", user.id).maybeSingle();

        if (!suyo) {
          resultados.push({ matricula, ok: false, error: "Ese alumno no esta en tu lista" });
          continue;
        }

        const { data: yaInscrito } = await admin.from("grupo_alumnos")
          .select("grupo_id").eq("grupo_id", grupo_id).eq("alumno_id", suyo.id).maybeSingle();
        if (yaInscrito) {
          resultados.push({ matricula: suyo.matricula, ok: false,
            error: `${suyo.nombre} ya esta inscrito en este grupo` });
          continue;
        }

        let correoDevuelto = "";
        if (!suyo.activo) {
          // Al egresar se libero la matricula: hay que ver que nadie mas la
          // haya tomado mientras tanto.
          if (suyo.matricula) {
            const { data: ocupada } = await admin.from("alumnos")
              .select("id, nombre").eq("profesor_id", user.id)
              .eq("matricula", suyo.matricula).eq("activo", true).maybeSingle();
            if (ocupada) {
              resultados.push({ matricula: suyo.matricula, ok: false,
                error: `No se puede reinscribir a ${suyo.nombre}: su matricula ${suyo.matricula} ahora la tiene "${ocupada.nombre}". Cambiale el numero a alguno de los dos.` });
              continue;
            }
          }

          // Devolverle su correo de entrada, si sigue libre.
          const { data: authUser } = await admin.auth.admin.getUserById(suyo.id);
          const actual = authUser?.user?.email || suyo.correo_login || "";
          const original = correoSinEgreso(actual);
          if (original && original !== actual) {
            const { error } = await admin.auth.admin.updateUserById(suyo.id, { email: original });
            correoDevuelto = error ? actual : original;
          } else {
            correoDevuelto = actual;
          }

          const { error: errReactivar } = await admin.from("alumnos").update({
            activo: true, ciclo_egreso: null, fecha_egreso: null,
            correo_login: correoDevuelto || suyo.correo_login,
          }).eq("id", suyo.id);
          if (errReactivar) {
            resultados.push({ matricula: suyo.matricula, ok: false, error: errReactivar.message });
            continue;
          }
        }

        const { error: errInscribir } = await admin
          .from("grupo_alumnos").insert({ grupo_id, alumno_id: suyo.id });
        if (errInscribir) {
          resultados.push({ matricula: suyo.matricula, ok: false,
            error: `No se pudo inscribir: ${errInscribir.message}` });
          continue;
        }

        resultados.push({
          matricula: suyo.matricula, ok: true, alumno_id: suyo.id,
          reutilizado: true, reactivado: !suyo.activo,
          correo_login: correoDevuelto || undefined,
          aviso: !suyo.activo
            ? `${suyo.nombre} estaba egresado. Se reactivo y entra con ${correoDevuelto || suyo.correo_login}`
            : undefined,
        });
        continue;
      }

      // ---- Camino 2: alta por nombre + matricula (el de siempre) ----
      if (!nombre || !matricula) {
        resultados.push({ matricula, ok: false, error: "Falta nombre o matricula" });
        continue;
      }
      const mat = matricula.toString().trim();

      // La matricula es unica POR MAESTRO, no por sistema. Cada maestro lleva
      // su propia lista: no necesita saber que numero le puso otro profesor al
      // mismo alumno, ni coordinarse con nadie. Como efecto util, cada alumno
      // tiene credencial distinta por clase, asi que una contrasenia prestada
      // solo compromete esa materia.
      const { data: existente, error: errorBusqueda } = await admin
        .from("alumnos").select("id, nombre")
        .eq("matricula", mat).eq("profesor_id", user.id).eq("activo", true)
        .maybeSingle();

      if (errorBusqueda) {
        resultados.push({ matricula, ok: false, error: errorBusqueda.message });
        continue;
      }

      let alumnoId: string;
      let correoUsado = "";

      if (existente) {
        if (normalizarNombre(existente.nombre) !== normalizarNombre(nombre)) {
          resultados.push({ matricula, ok: false,
            error: `Ya tienes a "${existente.nombre}" con la matricula ${mat}. Usa otro numero, o si esa persona ya egreso, egresala desde Mis alumnos para liberarlo.` });
          continue;
        }
        alumnoId = existente.id;

        const { data: yaInscrito } = await admin.from("grupo_alumnos")
          .select("grupo_id").eq("grupo_id", grupo_id).eq("alumno_id", alumnoId).maybeSingle();
        if (yaInscrito) {
          resultados.push({ matricula, ok: false, error: `${existente.nombre} ya esta inscrito en este grupo` });
          continue;
        }
      } else {
        // Como dos maestros pueden usar el mismo numero, el correo puede estar
        // ocupado. Se prueba con sufijo hasta encontrar uno libre, y se guarda
        // cual quedo para que el maestro pueda darselo al alumno.
        const base = correo && correo.trim() !== ""
          ? correo.trim().toLowerCase().split("@")[0]
          : mat.toLowerCase().replace(/\s+/g, "");
        const dominio = correo && correo.includes("@") ? correo.trim().toLowerCase().split("@")[1] : DOMINIO;

        let creado = null;
        let ultimoError = "";
        for (let intento = 1; intento <= 20; intento++) {
          const candidato = intento === 1 ? `${base}@${dominio}` : `${base}.${intento}@${dominio}`;
          const { data: nuevo, error } = await admin.auth.admin.createUser({
            email: candidato,
            password: mat,
            email_confirm: true,
            user_metadata: { rol: "alumno", nombre, matricula: mat, genero: genero || null, creado_por: "profesor" },
          });
          if (!error && nuevo?.user) { creado = nuevo.user; correoUsado = candidato; break; }
          ultimoError = error?.message || "Error desconocido";
          if (!/already|registered|exists/i.test(ultimoError)) break;
        }

        if (!creado) {
          resultados.push({ matricula, ok: false, error: ultimoError });
          continue;
        }
        alumnoId = creado.id;
      }

      // Marcar al maestro como duenio y registrar con que correo entra.
      const parche: Record<string, unknown> = { profesor_id: user.id };
      if (correoUsado) parche.correo_login = correoUsado;
      await admin.from("alumnos").update(parche).eq("id", alumnoId);

      const { error: errorInscribir } = await admin
        .from("grupo_alumnos").insert({ grupo_id, alumno_id: alumnoId });
      if (errorInscribir) {
        resultados.push({ matricula, ok: false, error: `No se pudo inscribir: ${errorInscribir.message}` });
        continue;
      }

      resultados.push({
        matricula, ok: true, alumno_id: alumnoId,
        reutilizado: !!existente,
        correo_login: correoUsado || undefined,
        aviso: correoUsado && !correoUsado.startsWith(`${mat.toLowerCase()}@`)
          ? `Esa matricula ya estaba ocupada en el sistema. Este alumno entra con ${correoUsado}`
          : undefined,
      });
    }

    return json({ resultados });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

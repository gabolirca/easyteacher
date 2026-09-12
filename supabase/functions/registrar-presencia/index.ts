import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// El QR se regenera cada VENTANA_SEG segundos. Se aceptan la ventana actual y
// una de margen a cada lado, para tolerar el desfase de reloj del telefono y
// el tiempo que tarda en escanear. Total: ~60 s de vida util por codigo.
// Una captura de pantalla mandada por WhatsApp caduca antes de servirle a
// nadie, que es justo lo que se quiere evitar.
const VENTANA_SEG = 20;
const MARGEN_VENTANAS = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function firmar(secreto: string, mensaje: string): Promise<string> {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey(
    "raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", llave, enc.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// Comparacion en tiempo constante: no filtra por cuanto tarda en fallar.
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Falta el token de autorización" }, 401);

    const { sesion_id, ventana, codigo } = await req.json();
    if (!sesion_id || ventana === undefined || !codigo) {
      return json({ error: "Código QR incompleto" }, 400);
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

    const { data: sesion } = await admin
      .from("sesiones")
      .select("id, grupo_id, fecha, estado")
      .eq("id", sesion_id)
      .maybeSingle();

    if (!sesion) return json({ error: "Esta sesión no existe" }, 404);
    if (sesion.estado !== "activa") return json({ error: "Esta clase ya terminó" }, 403);

    // El alumno tiene que estar inscrito en el grupo de la sesion.
    const { data: inscrito } = await admin
      .from("grupo_alumnos")
      .select("alumno_id")
      .eq("grupo_id", sesion.grupo_id)
      .eq("alumno_id", user.id)
      .maybeSingle();

    if (!inscrito) return json({ error: "No perteneces a este grupo" }, 403);

    // Validacion del QR rotativo.
    const { data: sec } = await admin
      .from("sesiones_secreto")
      .select("secreto")
      .eq("sesion_id", sesion_id)
      .maybeSingle();

    if (!sec) return json({ error: "Esta sesión no tiene código válido" }, 500);

    const ventanaActual = Math.floor(Date.now() / 1000 / VENTANA_SEG);
    const ventanaRecibida = Number(ventana);

    if (!Number.isFinite(ventanaRecibida) ||
        Math.abs(ventanaActual - ventanaRecibida) > MARGEN_VENTANAS) {
      return json({ error: "Este código ya expiró. Vuelve a escanear el QR de la pantalla." }, 403);
    }

    const esperado = await firmar(sec.secreto, `${sesion_id}.${ventanaRecibida}`);
    if (!igualSeguro(esperado, String(codigo))) {
      return json({ error: "Código QR inválido" }, 403);
    }

    // ------- Asistencia: una sola fuente de verdad -------
    // Si el profesor ya marco algo a mano, su criterio gana. El escaneo solo
    // sirve para pasar de 'falta' a 'presente' o para crear la fila si no habia.
    const { data: previa } = await admin
      .from("asistencias")
      .select("id, estado, sesion_id")
      .eq("grupo_id", sesion.grupo_id)
      .eq("alumno_id", user.id)
      .eq("fecha", sesion.fecha)
      .maybeSingle();

    if (!previa) {
      const { error } = await admin.from("asistencias").insert({
        grupo_id: sesion.grupo_id,
        alumno_id: user.id,
        fecha: sesion.fecha,
        estado: "presente",
        sesion_id,
        origen: "qr",
      });
      if (error) return json({ error: error.message }, 500);
    } else if (previa.estado === "falta") {
      await admin.from("asistencias")
        .update({ estado: "presente", sesion_id, origen: "qr" })
        .eq("id", previa.id);
    } else if (!previa.sesion_id) {
      // Ya estaba marcado presente/retardo/justificada: se respeta el estado,
      // solo se enlaza con la sesion.
      await admin.from("asistencias").update({ sesion_id }).eq("id", previa.id);
    }

    return json({ ok: true, sesion_id, grupo_id: sesion.grupo_id, fecha: sesion.fecha });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

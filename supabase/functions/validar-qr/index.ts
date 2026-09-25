import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Canjea el QR de la clase por un "pase de entrada".
//
// Por que existe: el QR vive 60 s a proposito, para que una captura de
// pantalla mandada por WhatsApp no le sirva a nadie. Pero el alumno que llega
// sin sesion iniciada tiene que teclear matricula y contrasena antes de que su
// telefono pueda mandar nada, y eso se lleva mas de 60 s. El 18/09 se
// rechazaron 85 de 89 intentos por esa razon.
//
// La solucion es separar las dos cosas. Esta funcion es PUBLICA (no pide
// sesion iniciada) y corre en cuanto el telefono abre el link: ahi el codigo
// todavia esta fresco. Si es valido devuelve un pase firmado que dura 10
// minutos, tiempo de sobra para iniciar sesion. Quien no escaneo la pantalla
// nunca obtiene un pase, asi que la proteccion sigue en pie.
//
// Se despliega SIN verificacion de JWT:
//   supabase functions deploy validar-qr --no-verify-jwt
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Deben coincidir con registrar-presencia.
const VENTANA_SEG = 20;
const MARGEN_VENTANAS = 1;
export const PASE_VIGENCIA_SEG = 600; // 10 min

// Los codigos HTTP van distintos a proposito: en los registros del servidor
// un 403 no se distingue de otro, y por eso no se podia saber si los rechazos
// eran codigos vencidos, firmas malas o clases ya cerradas.
//   409 = la clase ya no esta activa
//   410 = el codigo (o el pase) ya vencio
//   422 = la firma no cuadra: QR de otra clase, alterado o inventado
//   403 = el alumno no es de ese grupo
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function firmar(secreto: string, mensaje: string, largo = 16): Promise<string> {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey(
    "raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", llave, enc.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, largo);
}

function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { sesion_id, ventana, codigo } = await req.json();
    if (!sesion_id || ventana === undefined || !codigo) {
      return json({ error: "Código QR incompleto" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sesion } = await admin
      .from("sesiones").select("id, estado").eq("id", sesion_id).maybeSingle();

    if (!sesion) return json({ error: "Esta sesión no existe" }, 404);
    if (sesion.estado !== "activa") {
      return json({ error: "Esta clase ya terminó", motivo: "clase_cerrada" }, 409);
    }

    const { data: sec } = await admin
      .from("sesiones_secreto").select("secreto").eq("sesion_id", sesion_id).maybeSingle();
    if (!sec) return json({ error: "Esta sesión no tiene código válido" }, 500);

    const ventanaActual = Math.floor(Date.now() / 1000 / VENTANA_SEG);
    const ventanaRecibida = Number(ventana);
    if (!Number.isFinite(ventanaRecibida) ||
        Math.abs(ventanaActual - ventanaRecibida) > MARGEN_VENTANAS) {
      return json({ error: "Este código ya expiró. Vuelve a escanear el QR de la pantalla.", motivo: "expirado" }, 410);
    }

    const esperado = await firmar(sec.secreto, `${sesion_id}.${ventanaRecibida}`);
    if (!igualSeguro(esperado, String(codigo))) {
      return json({ error: "Código QR inválido", motivo: "firma_invalida" }, 422);
    }

    // El pase no se guarda en ningun lado: se verifica recalculando la firma.
    const expira = Math.floor(Date.now() / 1000) + PASE_VIGENCIA_SEG;
    const pase = await firmar(sec.secreto, `pase.${sesion_id}.${expira}`, 32);

    return json({ pase, expira, sesion_id });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

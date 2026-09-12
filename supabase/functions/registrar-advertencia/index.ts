import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cuantas advertencias se le dan al alumno ANTES de bloquear.
// 1 = sale una vez y se le avisa; si vuelve a salir, se bloquea y se entrega.
const MAX_ADVERTENCIAS = 1;

// Tope de eventos guardados en la bitacora, para que un alumno no pueda
// inflar la fila mandando miles de eventos.
const MAX_EVENTOS = 60;

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

    const body = await req.json();
    const intentoId = body?.intento_id;
    const tipo = typeof body?.tipo === "string" ? body.tipo.slice(0, 40) : "desconocido";
    if (!intentoId) return json({ error: "Falta intento_id" }, 400);

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
      .select("id, alumno_id, estado, advertencias, eventos_salida")
      .eq("id", intentoId)
      .maybeSingle();

    if (intentoError || !intento) return json({ error: "Intento no encontrado" }, 404);
    if (intento.alumno_id !== user.id) return json({ error: "Este intento no te pertenece" }, 403);

    // Si ya se entregó o bloqueó, no hay nada que contar.
    if (intento.estado !== "en_curso") {
      return json({
        ok: true,
        ya_terminado: true,
        estado: intento.estado,
        advertencias: intento.advertencias ?? 0,
        max_advertencias: MAX_ADVERTENCIAS,
        bloquear: intento.estado === "bloqueado",
      });
    }

    // Si el aviso llegó hasta aquí, es que SÍ había red en ese momento —
    // las salidas ocurridas sin conexión ni siquiera alcanzan a llamarse,
    // el cliente las guarda aparte y las manda al entregar, marcadas como
    // no contabilizadas. Por eso aquí siempre se cuenta.
    const advertencias = (intento.advertencias ?? 0) + 1;
    const bloquear = advertencias > MAX_ADVERTENCIAS;

    const previos = Array.isArray(intento.eventos_salida) ? intento.eventos_salida : [];
    const eventos = [
      ...previos,
      { ts: new Date().toISOString(), tipo, online: true, conto: true },
    ].slice(-MAX_EVENTOS);

    const { error: updateError } = await admin
      .from("intentos")
      .update({ advertencias, eventos_salida: eventos })
      .eq("id", intentoId)
      .eq("estado", "en_curso");

    if (updateError) return json({ error: updateError.message }, 500);

    return json({
      ok: true,
      advertencias,
      max_advertencias: MAX_ADVERTENCIAS,
      restantes: Math.max(0, MAX_ADVERTENCIAS - advertencias),
      bloquear,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

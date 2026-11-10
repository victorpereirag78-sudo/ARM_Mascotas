// Edge Function: mascotas-push-dispatch
// ---------------------------------------------------------------------
// Despacha la cola mascotas_push_cola de ARM Mascotas (recordatorios de
// la agenda, próximas vacunas y desparasitaciones, medicamentos y el
// botón "Enviar prueba") como Web Push (RFC 8291/8292).
//
// Usa los mismos teléfonos suscritos (vet_push_suscripciones) y las
// mismas claves VAPID (Vault `vet_push_vapid`, las crea vet-dispatch)
// que los avisos de ARM Veterinaria: una sola activación sirve para todo.
//
// La llama el cron `mascotas-push-dispatch` (sql/020) cada minuto, solo
// si hay algo pendiente. Se autentica con la clave compartida del Vault
// (`mascotas_push_dispatch_key`), por eso se despliega sin verificación
// de JWT.
// ---------------------------------------------------------------------
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const CONTACTO = "https://armsistemas.cl";

interface Sub { id: string; endpoint: string; p256dh: string; auth: string }
interface Aviso { id: string; titulo: string; cuerpo: string | null; url: string | null; subs: Sub[] | null }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "config" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: claveOk } = await admin.rpc("mascotas_sis_dispatch_key_ok", { p_key: req.headers.get("x-dispatch-key") ?? "" });
  if (claveOk !== true) return json({ error: "unauthorized" }, 401);

  // Las claves VAPID son las de ARM Veterinaria: las suscripciones están
  // atadas a esa clave pública. Si aún no existen, se espera a vet-dispatch.
  const { data: vapid } = await admin.rpc("vet_sis_vapid");
  if (!vapid) return json({ error: "sin_vapid" }, 503);
  const vapidKeys = await webpush.importVapidKeys(vapid as webpush.ExportedVapidKeys, { extractable: false });

  const { data: pend, error } = await admin.rpc("mascotas_sis_push_tomar", { p_limite: 100 });
  if (error) {
    console.error("RPC tomar:", error);
    return json({ error: "rpc" }, 500);
  }
  const lista = (pend ?? []) as Aviso[];
  if (lista.length === 0) return json({ ok: true, procesados: 0 });

  const app = await webpush.ApplicationServer.new({ contactInformation: CONTACTO, vapidKeys });
  const cuenta = { enviados: 0, fallidos: 0, omitidos: 0 };

  for (const a of lista) {
    const subs = a.subs ?? [];
    if (subs.length === 0) {
      await admin.rpc("mascotas_sis_push_marcar", { p_id: a.id, p_estado: "omitido", p_error: "Sin teléfonos suscritos" });
      cuenta.omitidos++;
      continue;
    }
    const payload = JSON.stringify({ title: a.titulo, body: a.cuerpo ?? "", url: a.url ?? "/app.html", tag: a.id });
    let alguno = false;
    let ultimoError: string | null = null;
    for (const s of subs) {
      try {
        await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(payload, { ttl: 86400, urgency: webpush.Urgency.Normal });
        alguno = true;
        await admin.rpc("vet_sis_push_resultado", { p_sub_id: s.id, p_ok: true, p_gone: false });
      } catch (err) {
        // 404/410: el navegador anuló la suscripción → se borra.
        const gone = err instanceof webpush.PushMessageError && (err.isGone() || err.response.status === 404);
        ultimoError = String(err).slice(0, 300);
        await admin.rpc("vet_sis_push_resultado", { p_sub_id: s.id, p_ok: false, p_gone: gone });
      }
    }
    await admin.rpc("mascotas_sis_push_marcar", { p_id: a.id, p_estado: alguno ? "enviado" : "fallido", p_error: alguno ? null : ultimoError });
    if (alguno) cuenta.enviados++; else cuenta.fallidos++;
  }
  return json({ ok: true, procesados: lista.length, ...cuenta });
});

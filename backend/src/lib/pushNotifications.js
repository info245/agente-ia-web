// Avisos en el móvil (Web Push). Cada dispositivo que activa los avisos en el CRM guarda su
// suscripción en app_settings con la clave push_subscriptions:<cuenta>.
// ponytail: lista completa por cuenta en un solo valor; si una cuenta pasa de decenas de
// dispositivos o hay escrituras simultáneas frecuentes, mover a una tabla push_subscriptions.
import webpush from "web-push";
import { supabase } from "./supabase.js";

const MAX_DEVICES_PER_ACCOUNT = 50;
const key = (accountId) => `push_subscriptions:${accountId}`;

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

function configured() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:info@t-mediaglobal.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

async function readSubscriptions(accountId) {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key(accountId)).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? data.value : [];
}

async function writeSubscriptions(accountId, list) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: key(accountId), value: list, account_id: accountId }, { onConflict: "key" });
  if (error) throw error;
}

export async function countSubscriptions(accountId) {
  return (await readSubscriptions(accountId)).length;
}

export function isValidSubscription(sub) {
  return Boolean(
    sub &&
      typeof sub.endpoint === "string" &&
      /^https:\/\//.test(sub.endpoint) &&
      typeof sub.keys?.p256dh === "string" &&
      typeof sub.keys?.auth === "string"
  );
}

export async function addSubscription(accountId, subscription, { userId = null, label = "" } = {}) {
  const list = (await readSubscriptions(accountId)).filter((s) => s.endpoint !== subscription.endpoint);
  list.push({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    user_id: userId,
    label: String(label || "").slice(0, 120),
    created_at: new Date().toISOString(),
  });
  await writeSubscriptions(accountId, list.slice(-MAX_DEVICES_PER_ACCOUNT));
}

export async function removeSubscription(accountId, endpoint) {
  const list = await readSubscriptions(accountId);
  const next = list.filter((s) => s.endpoint !== endpoint);
  if (next.length !== list.length) await writeSubscriptions(accountId, next);
}

// Nunca lanza: un aviso que falla no debe romper el alta de un lead.
export async function notifyAccount(accountId, { title, body = "", url = "/conversaciones" }) {
  try {
    if (!accountId || !configured()) return { sent: 0, skipped: true };
    const list = await readSubscriptions(accountId);
    if (!list.length) return { sent: 0 };
    const payload = JSON.stringify({ title: String(title).slice(0, 120), body: String(body).slice(0, 240), url });
    const gone = [];
    let sent = 0;
    await Promise.all(
      list.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
          sent += 1;
        } catch (error) {
          // 404/410: el dispositivo quitó el permiso o desinstaló la app.
          if ([404, 410].includes(error?.statusCode)) gone.push(sub.endpoint);
          else console.log("push send error", error?.statusCode || "", error?.message);
        }
      })
    );
    if (gone.length) await writeSubscriptions(accountId, list.filter((s) => !gone.includes(s.endpoint)));
    return { sent, removed: gone.length };
  } catch (error) {
    console.log("push notify error", error.message);
    return { sent: 0, error: error.message };
  }
}

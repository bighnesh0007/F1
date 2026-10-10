// Browser side of push notifications: asks permission, subscribes this device with the
// browser's push service and tells the server what to send (see server/src/push.js).
export type PushPrefs = { sessions: boolean; flags: boolean; driver: string | null };

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

let keyPromise: Promise<string | null> | null = null;
export function pushKey() {
  keyPromise ??= fetch("/api/push/key")
    .then((r) => (r.ok ? r.json() : { key: null }))
    .then((d) => d.key ?? null)
    .catch(() => null);
  return keyPromise;
}

function toBytes(base64: string) {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.register("/sw.js");
}

// Subscribes (asking permission if needed) and saves the preferences, or unsubscribes
// when nothing is switched on. Throws a readable error.
export async function syncPush(prefs: PushPrefs) {
  if (!pushSupported()) throw new Error("This browser can't receive notifications. On iPhone, add F1 Live to your home screen first.");
  const reg = await registration();
  const any = prefs.sessions || prefs.flags || Boolean(prefs.driver);
  let sub = await reg.pushManager.getSubscription();
  if (!any) {
    if (sub) {
      await fetch("/api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return;
  }
  const key = await pushKey();
  if (!key) throw new Error("Notifications aren't set up on this server yet.");
  if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") {
    throw new Error("Notifications are blocked. Allow them for this site in your browser settings.");
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }).catch((err) => {
    throw new Error(`Your browser couldn't sign up for notifications (${err?.message ?? "unknown error"}). Private windows usually can't.`);
  });
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), prefs }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't turn on notifications");
}

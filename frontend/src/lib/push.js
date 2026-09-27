import { api } from "./api";
import { base64urlToBuffer } from "./webauthn";

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function enablePush() {
  if (!isPushSupported()) throw new Error("Push wird von diesem Gerät nicht unterstützt.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Berechtigung wurde abgelehnt.");
  const reg = await navigator.serviceWorker.ready;
  const { data } = await api.get("/push/vapid-public-key");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64urlToBuffer(data.publicKey),
  });
  await api.post("/push/subscribe", { subscription: sub.toJSON() });
  return true;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await api.post("/push/unsubscribe");
}

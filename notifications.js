// =========================================================================
// Orbit — notifications.js
// Web Push: permission request, push subscription, notifyUser()
// Import this in index.html AFTER app.js
// =========================================================================

import { db, state } from "./app.js";
import {
  doc, getDoc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// ── Your VAPID public key (safe to expose client-side) ───────────────────
const VAPID_PUBLIC_KEY = "d-iV_OyNRNlxhMSK8soG9EJX42y0JXZuIdHvqZSb9GJn_yNmNUoeJ5n6N_6LujIa_yWz0iybdwpnTySf82TKXQ";

// ── Convert VAPID key to Uint8Array (required by browser push API) ───────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Register push subscription and save to Firestore ─────────────────────
export async function initPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!state.uid) return; // not logged in yet

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Save subscription object to Firestore under the user's doc
    await updateDoc(doc(db, "users", state.uid), {
      pushSubscription: JSON.parse(JSON.stringify(subscription)),
    });

    console.log("Orbit: push notifications enabled");
  } catch (err) {
    console.warn("Orbit: push setup failed", err);
  }
}

// ── Send a push notification to another user ─────────────────────────────
// Call this after events like: new message, new follower, new like
// Example: await notifyUser(recipientUid, "New message", "John: Hey!", "/#chats")
export async function notifyUser(toUid, title, body, url = "/") {
  if (!toUid || toUid === state.uid) return; // don't notify yourself
  try {
    // Fetch the recipient's push subscription from Firestore
    const snap = await getDoc(doc(db, "users", toUid));
    if (!snap.exists()) return;
    const subscription = snap.data().pushSubscription;
    if (!subscription) return; // user hasn't enabled notifications

    // Call the Vercel serverless function to send the push
    await fetch("/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, title, body, url }),
    });
  } catch (err) {
    console.warn("Orbit: notifyUser failed", err);
  }
}

// ── Auto-init once auth is ready ─────────────────────────────────────────
// Waits for the orbit:auth-ready event fired by app.js after login
document.addEventListener("orbit:auth-ready", () => {
  // Small delay to let the service worker finish activating
  setTimeout(initPushNotifications, 2000);
});

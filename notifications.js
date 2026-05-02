// =========================================================================
// Orbit — notifications.js
// Shows an "Enable notifications" banner after login.
// Browsers REQUIRE a user tap to show the permission prompt — it cannot
// pop up automatically. This file handles that correctly.
// =========================================================================

import { db, state } from "./app.js";
import {
  doc, getDoc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const VAPID_PUBLIC_KEY = "d-iV_OyNRNlxhMSK8soG9EJX42y0JXZuIdHvqZSb9GJn_yNmNUoeJ5n6N_6LujIa_yWz0iybdwpnTySf82TKXQ";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Subscribe and save to Firestore (called after user taps Allow) ────────
async function subscribe() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await updateDoc(doc(db, "users", state.uid), {
      pushSubscription: JSON.parse(JSON.stringify(sub)),
    });
    return true;
  } catch (err) {
    console.warn("Orbit: push subscribe failed", err);
    return false;
  }
}

// ── Show / hide the enable-notifications banner ───────────────────────────
function showNotifBanner() {
  const banner = document.getElementById("notifEnableBanner");
  if (banner) banner.classList.remove("hidden");
}
function hideNotifBanner() {
  const banner = document.getElementById("notifEnableBanner");
  if (banner) banner.classList.add("hidden");
}

// ── Handle the "Enable" button tap ───────────────────────────────────────
async function handleEnableClick() {
  const btn = document.getElementById("notifEnableBtn");
  if (btn) { btn.textContent = "Enabling…"; btn.disabled = true; }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    const ok = await subscribe();
    hideNotifBanner();
    if (ok) showToastMsg("Notifications enabled!");
  } else {
    hideNotifBanner();
    if (btn) { btn.textContent = "Enable"; btn.disabled = false; }
  }
}

function showToastMsg(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}

// ── Check whether to show the banner ─────────────────────────────────────
function checkAndShowBanner() {
  if (!("Notification" in window)) return;          // browser doesn't support it
  if (Notification.permission === "granted") return; // already enabled
  if (Notification.permission === "denied") return;  // user blocked it
  if (!state.uid) return;                            // not logged in

  // Show banner after a short delay so it doesn't clash with page load
  setTimeout(showNotifBanner, 3000);
}

// ── Wire up buttons ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const enableBtn  = document.getElementById("notifEnableBtn");
  const dismissBtn = document.getElementById("notifEnableDismiss");
  const bellBtn    = document.getElementById("notifBtn"); // existing bell in topbar

  enableBtn  && enableBtn.addEventListener("click",  handleEnableClick);
  dismissBtn && dismissBtn.addEventListener("click", () => {
    hideNotifBanner();
    localStorage.setItem("orbit:notif-dismissed", "1");
  });

  // Tapping the bell icon also opens the enable flow if not yet permitted
  if (bellBtn && Notification.permission !== "granted") {
    bellBtn.addEventListener("click", () => {
      if (Notification.permission === "default") showNotifBanner();
    });
  }
});

// ── Run once logged in ────────────────────────────────────────────────────
document.addEventListener("orbit:auth-ready", () => {
  if (localStorage.getItem("orbit:notif-dismissed")) return;
  checkAndShowBanner();
});

// ── Send a push notification to another user ─────────────────────────────
// Usage: await notifyUser(recipientUid, "New message 💬", "John: Hey!", "/#chats")
export async function notifyUser(toUid, title, body, url = "/") {
  if (!toUid || toUid === state.uid) return;
  try {
    const snap = await getDoc(doc(db, "users", toUid));
    if (!snap.exists()) return;
    const subscription = snap.data().pushSubscription;
    if (!subscription) return;

    await fetch("/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, title, body, url }),
    });
  } catch (err) {
    console.warn("Orbit: notifyUser failed", err);
  }
}

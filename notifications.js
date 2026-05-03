// =========================================================================
// Orbit — notifications.js
// Shows an "Enable notifications" banner after login.
// Browsers REQUIRE a user tap to show the permission prompt — it cannot
// pop up automatically. This file handles that correctly.
// =========================================================================

import { db, state } from "./app.js";
import {
  doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const VAPID_PUBLIC_KEY = "BGaoMxP4XdXet-NnerpGsMWijfdCNEvWIUXt0NShfLsfj1IUyeBiNWG9kYpxFShnjmACcIc2x0igUwbNwKqTKKo";

// Bump this version any time you change the VAPID key — it forces a re-subscribe
const SUBSCRIPTION_VERSION = "v2";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Subscribe and save to Firestore ──────────────────────────────────────
async function subscribe() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    showToastMsg("Push not supported on this browser");
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;

    // Always unsubscribe old subscription first so a fresh one is created
    // with the current VAPID key (old/invalid subscriptions cause silent failures)
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subData = JSON.parse(JSON.stringify(sub));
    await setDoc(doc(db, "users", state.uid), {
      pushSubscription: subData,
      pushSubVersion: SUBSCRIPTION_VERSION,
    }, { merge: true });

    // Remember locally that this device is up to date
    localStorage.setItem("orbit:sub-version", SUBSCRIPTION_VERSION);
    console.log("Orbit: subscription saved", subData.endpoint);
    return true;
  } catch (err) {
    console.error("Orbit: push subscribe failed", err);
    showToastMsg("Could not save notification settings: " + (err.message || err));
    return false;
  }
}

// ── Show / hide the enable-notifications banner ───────────────────────────
function showNotifBanner(msg) {
  const banner = document.getElementById("notifEnableBanner");
  if (!banner) return;
  // Optionally update the description text if a message is passed
  if (msg) {
    const span = banner.querySelector(".notif-enable-text span");
    if (span) span.textContent = msg;
  }
  banner.classList.remove("hidden");
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
    // Clear dismissed flag so banner can show again if needed later
    localStorage.removeItem("orbit:notif-dismissed");
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

// ── Check whether to show the first-time enable banner ───────────────────
function checkAndShowBanner() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") return;
  if (Notification.permission === "denied") return;
  if (!state.uid) return;
  setTimeout(() => showNotifBanner(), 3000);
}

// ── Check if the existing subscription is stale and needs refreshing ──────
async function checkForStaleSubscription() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!state.uid) return;

  try {
    const localVersion = localStorage.getItem("orbit:sub-version");

    // If local version matches current, check Firestore to make sure it's saved
    if (localVersion === SUBSCRIPTION_VERSION) {
      const snap = await getDoc(doc(db, "users", state.uid));
      const saved = snap.data()?.pushSubscription;
      const savedVersion = snap.data()?.pushSubVersion;
      // Subscription exists and is current — nothing to do
      if (saved && savedVersion === SUBSCRIPTION_VERSION) return;
    }

    // Stale or missing subscription — show re-subscribe prompt after short delay
    setTimeout(() => {
      showNotifBanner("Tap Refresh to keep getting notifications");
      const btn = document.getElementById("notifEnableBtn");
      if (btn) btn.textContent = "Refresh";
    }, 4000);
  } catch (err) {
    console.warn("Orbit: stale subscription check failed", err);
  }
}

// ── Wire up buttons ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const enableBtn  = document.getElementById("notifEnableBtn");
  const dismissBtn = document.getElementById("notifEnableDismiss");
  const bellBtn    = document.getElementById("notifBtn");

  enableBtn  && enableBtn.addEventListener("click",  handleEnableClick);
  dismissBtn && dismissBtn.addEventListener("click", () => {
    hideNotifBanner();
    localStorage.setItem("orbit:notif-dismissed", "1");
  });

  if (bellBtn && ("Notification" in window) && Notification.permission !== "granted") {
    bellBtn.addEventListener("click", () => {
      if (Notification.permission === "default") showNotifBanner();
    });
  }
});

// ── Run once logged in ────────────────────────────────────────────────────
document.addEventListener("orbit:auth-ready", () => {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") {
    // Not yet enabled — show the first-time banner unless dismissed
    if (!localStorage.getItem("orbit:notif-dismissed")) checkAndShowBanner();
  } else {
    // Already enabled — silently check if subscription is stale
    checkForStaleSubscription();
  }
});

// ── Send a push notification to another user ─────────────────────────────
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

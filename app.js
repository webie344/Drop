/* =============================================================
   Drop —One prompt. One photo. Once a day.
   -------------------------------------------------------------
   SETUP
   1. Create a Firebase project at console.firebase.google.com
      - Enable Email/Password sign-in (Authentication > Sign-in method)
      - Create a Firestore database (Firestore Database > Create database)
   2. Paste your Firebase web config below (CONFIG.firebase).
   3. Create a Cloudinary account (free tier is fine):
      - Settings > Upload > add an unsigned upload preset
      - Paste your cloud name + preset name below (CONFIG.cloudinary).
   4. Telegram notifications:
      - Put the bot's username (without @) below in CONFIG.telegram.botUsername.
      - Make sure telegram.js sits next to this file.
      - The bot script (bot/telegram-bot.js) runs separately and forwards
        Firestore notifications to Telegram automatically.
   5. Open index.html in a browser. Sign up. Then in the browser
      console run:  window.seedPrompts()
      to populate 30 days of prompts.
   ============================================================= */

const CONFIG = {
    firebase: {
        apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
},
    cloudinary: {
        cloudName: "ddtdqrh1b",
        uploadPreset: "profile-pictures"
    },
    telegram: {
        // Your bot's username from @BotFather (without the @).
        botUsername: "Drop121_bot"
    }
};

/* =============================================================
   IMPORTS — Firebase v10 modular SDK from gstatic CDN
   ============================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
    onSnapshot,
    orderBy,
    limit,
    arrayUnion,
    arrayRemove,
    increment,
    deleteField,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =============================================================
   FIREBASE INIT
   ============================================================= */

const fbApp = initializeApp(CONFIG.firebase);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

/* =============================================================
   30 UNIVERSAL PROMPTS (seeded into Firestore once)
   ============================================================= */

const PROMPTS = [
    "Show your view right now.",
    "What's on your screen?",
    "Your shoes today.",
    "Where you had lunch.",
    "Today's commute.",
    "Your desk right now.",
    "What you're listening to.",
    "Your hands right now.",
    "First thing you ate today.",
    "Show your bag.",
    "Your morning sky.",
    "What you're reading.",
    "Tonight's dinner.",
    "Your favorite mug.",
    "The view from your window.",
    "Where you're sitting.",
    "What's in your pocket.",
    "Today's outfit.",
    "Your watch / wrist.",
    "The last photo you took.",
    "Where you parked.",
    "Your evening light.",
    "Today's small win.",
    "What you're working on.",
    "What's nearby.",
    "Today's weather, your version.",
    "The corner of your room.",
    "Your reflection right now.",
    "Something you made today.",
    "What surprised you today."
];

/* =============================================================
   HELPERS — DOM, time, formatting
   ============================================================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Safe DOM helpers — log a clear warning instead of throwing when an
// element is missing from the HTML. This prevents a single missing node
// from killing renderCapture / setupCaptureControls and leaving the user
// stuck on a frozen screen.
function $safe(sel, where = "") {
    const el = document.querySelector(sel);
    if (!el) console.warn(`[drop] missing element ${sel}${where ? " in " + where : ""}`);
    return el;
}
function setHidden(sel, hidden, where = "") {
    const el = $safe(sel, where);
    if (el) el.hidden = hidden;
    return el;
}
function setText(sel, text, where = "") {
    const el = $safe(sel, where);
    if (el) el.textContent = text;
    return el;
}
function setVal(sel, val, where = "") {
    const el = $safe(sel, where);
    if (el) el.value = val;
    return el;
}
function setHTML(sel, html, where = "") {
    const el = $safe(sel, where);
    if (el) el.innerHTML = html;
    return el;
}

function todayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayKey(d);
}

function formatDateLong(d = new Date()) {
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/* =============================================================
   LIVELINESS HELPERS
   Floating reactions, confetti, themed weeks, pull-to-refresh,
   live counter, memories, drop-of-day, friend-just-dropped toast.
   ============================================================= */

const REACTION_EMOJI = {
    fire: "🔥", love: "❤️", laugh: "😂", wow: "😮", sad: "😢", clap: "👏"
};

// ----- 1. Floating reaction emoji -----
function spawnFloatingReaction(emoji, anchorEl) {
    if (!emoji) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight - 120;
    if (anchorEl && anchorEl.getBoundingClientRect) {
        const r = anchorEl.getBoundingClientRect();
        // Ignore zero-rect (hidden / detached) anchors and fall back to the
        // bottom-center default so the burst is always visible.
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
            x = r.left + r.width / 2;
            y = r.top + r.height / 2;
        }
    }
    // Spawn 5 emojis with slight horizontal jitter
    for (let i = 0; i < 5; i++) {
        const el = document.createElement("div");
        el.className = "float-emoji";
        el.textContent = emoji;
        const jitter = (Math.random() - 0.5) * 60;
        el.style.left = `${x + jitter}px`;
        el.style.top = `${y}px`;
        el.style.animationDelay = `${i * 70}ms`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1700 + i * 70);
    }
}

// ----- 1b. Big heart burst (double-tap to like) -----
function spawnBigHeart(anchorEl) {
    if (!anchorEl) return;
    const heart = document.createElement("div");
    heart.className = "big-heart-burst";
    heart.textContent = "♥";
    // Position relative to the anchor; anchor needs position:relative in CSS
    const prev = getComputedStyle(anchorEl).position;
    if (prev === "static") anchorEl.style.position = "relative";
    anchorEl.appendChild(heart);
    setTimeout(() => heart.remove(), 900);
}

// ----- 2. Streak milestone confetti -----
function isStreakMilestone(n) {
    return n === 3 || n === 7 || n === 14 || n === 30 || n === 50 || n === 100 || n === 365;
}
function celebrateStreak(streakNum) {
    const pill = document.getElementById("today-streak");
    if (pill) {
        pill.classList.remove("is-milestone");
        // force reflow so the animation re-triggers
        void pill.offsetWidth;
        pill.classList.add("is-milestone");
    }
    spawnConfetti();
    Sounds.likeReceived?.();
}
function spawnConfetti() {
    const colors = ["#ff5a32", "#ffb12b", "#3ea7ff", "#36c98a", "#c46cff", "#ff5b8a"];
    const n = 36;
    const startX = window.innerWidth / 2;
    const startY = window.innerHeight * 0.25;
    for (let i = 0; i < n; i++) {
        const el = document.createElement("div");
        el.className = "confetti-piece";
        el.style.background = colors[i % colors.length];
        el.style.left = `${startX}px`;
        el.style.top = `${startY}px`;
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        const dist = 140 + Math.random() * 180;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist + 220;
        el.style.setProperty("--end-tf", `translate(${dx}px, ${dy}px)`);
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1600);
    }
}

// ----- 3. Live counter on Today -----
function startTodayCounter() {
    if (state.todayCounterUnsub) state.todayCounterUnsub();
    if (!state.user) return;
    const q = query(collection(db, "posts"), where("promptDate", "==", todayKey()));
    state.todayCounterUnsub = onSnapshot(q, (snap) => {
        // Count distinct friend UIDs (excluding self) who posted today
        const friendUids = new Set(state.friends.keys());
        const dropped = new Set();
        snap.docs.forEach(d => {
            const data = d.data();
            if (data.circleId) return;
            if (data.uid === state.user.uid) return;
            if (friendUids.has(data.uid)) dropped.add(data.uid);
        });
        const el = document.getElementById("today-live-counter");
        if (!el) return;
        const n = dropped.size;
        if (n === 0) {
            el.hidden = true;
        } else {
            el.hidden = false;
            const txt = el.querySelector(".live-text");
            if (txt) txt.textContent = `${n} friend${n === 1 ? " has" : "s have"} dropped today`;
        }
    }, (err) => console.warn("today counter:", err));
}
function setNavLivePulse() {
    const today = document.querySelector('.nav-item[data-route="today"]');
    if (!today) return;
    const w = (typeof getWindowState === "function") ? getWindowState() : null;
    if (w && w.phase === "open") today.classList.add("is-live");
    else today.classList.remove("is-live");
}

// ----- 4. Memories ("on this day last year") -----
async function loadMemories() {
    const card = document.getElementById("today-memories");
    if (!card || !state.user) return;
    card.hidden = true;
    try {
        const today = new Date();
        const lastYear = new Date(today);
        lastYear.setFullYear(today.getFullYear() - 1);
        const targetKey = todayKey(lastYear);
        // Single where() — no composite index. Filter client-side.
        const qs = await getDocs(query(
            collection(db, "posts"),
            where("uid", "==", state.user.uid),
            limit(200)
        ));
        const match = qs.docs.find(d => d.data().promptDate === targetKey);
        if (!match) return;
        const data = match.data();
        const img = (data.images && data.images[0]) || data.imageUrl;
        if (!img) return;
        document.getElementById("today-memories-thumb").src = img;
        const text = data.caption?.trim()
            || (data.promptText ? `"${data.promptText}"` : "Your drop from a year ago");
        document.getElementById("today-memories-text").textContent = text;
        card.hidden = false;
        card.onclick = () => { location.hash = `#/post/${match.id}`; };
    } catch (err) {
        console.warn("memories load:", err);
    }
}

// ----- 5. Drop of the day (top-liked from yesterday) -----
async function loadDropOfTheDay() {
    const banner = document.getElementById("feed-spotlight");
    if (!banner) return;
    banner.hidden = true;
    try {
        const qs = await getDocs(query(
            collection(db, "posts"),
            where("promptDate", "==", yesterdayKey()),
            limit(80)
        ));
        let top = null;
        qs.docs.forEach(d => {
            const data = d.data();
            if (data.circleId) return;
            const likes = data.likes || 0;
            if (likes < 1) return;
            if (!top || likes > (top.data().likes || 0)) top = d;
        });
        if (!top) return;
        const data = top.data();
        const img = (data.images && data.images[0]) || data.imageUrl;
        if (!img) return;
        document.getElementById("feed-spotlight-thumb").src = img;
        document.getElementById("feed-spotlight-text").innerHTML =
            `<strong>@${escapeHtml(data.username || "user")}</strong> · ${data.likes || 0} like${(data.likes || 0) === 1 ? "" : "s"}`;
        banner.hidden = false;
        banner.onclick = () => { location.hash = `#/post/${top.id}`; };
    } catch (err) {
        console.warn("drop of the day:", err);
    }
}

// ----- 6. Skeleton shimmer markup -----
function skeletonFeedHTML(n = 3) {
    return Array.from({ length: n }, () => `<div class="skel skel-card"></div>`).join("");
}
function skeletonRowsHTML(n = 5) {
    return Array.from({ length: n }, () => `
        <div class="skel-row">
            <div class="skel skel-avatar"></div>
            <div class="skel-lines">
                <div class="skel skel-line med"></div>
                <div class="skel skel-line short"></div>
            </div>
        </div>`).join("");
}

// ----- 7. Themed weeks -----
const THEMES = [
    { key: "freestyle", emoji: "✦", label: "Sunday freestyle" }, // Sun = 0
    { key: "portrait",  emoji: "👤", label: "Portrait Monday" },  // Mon = 1
    { key: "food",      emoji: "🍽", label: "Tasty Tuesday" },    // Tue = 2
    { key: "view",      emoji: "🌅", label: "Window Wednesday" }, // Wed = 3
    { key: "texture",   emoji: "✋", label: "Texture Thursday" }, // Thu = 4
    { key: "motion",    emoji: "💨", label: "Motion Friday" },    // Fri = 5
    { key: "window",    emoji: "🪟", label: "Snapshot Saturday" } // Sat = 6
];
function getDailyTheme(d = new Date()) {
    return THEMES[d.getDay()] || THEMES[0];
}
function renderThemePill() {
    const pill = document.getElementById("today-theme-pill");
    if (!pill) return;
    const t = getDailyTheme();
    pill.dataset.theme = t.key;
    pill.querySelector(".theme-emoji").textContent = t.emoji;
    pill.querySelector(".theme-label").textContent = t.label;
    pill.hidden = false;
    // Liveliness: tint the parent prompt card with the day's theme color
    const card = pill.closest(".prompt-card");
    if (card) card.dataset.theme = t.key;
}

// ----- 8. Pull-to-refresh -----
const PTR = {
    startY: 0,
    pulling: false,
    armed: false,
    threshold: 70,
    onRefresh: null
};
function setupPullToRefresh() {
    const ind = document.getElementById("ptr-indicator");
    if (!ind) return;

    window.addEventListener("touchstart", (e) => {
        if (window.scrollY > 0) { PTR.armed = false; return; }
        PTR.armed = true;
        PTR.startY = e.touches[0].clientY;
        PTR.pulling = false;
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (!PTR.armed) return;
        const dy = e.touches[0].clientY - PTR.startY;
        if (dy <= 0) { PTR.pulling = false; ind.classList.remove("is-pulling"); return; }
        PTR.pulling = true;
        ind.classList.add("is-pulling");
        const pct = Math.min(1, dy / PTR.threshold);
        const offset = -100 + pct * 120; // -100% (hidden) -> +20%
        ind.style.transform = `translate(-50%, ${offset}%)`;
    }, { passive: true });

    window.addEventListener("touchend", () => {
        if (!PTR.armed) return;
        const wasPulling = PTR.pulling;
        const trigger = wasPulling && parseFloat(ind.style.transform.match(/-?\d+\.?\d*%/g)?.[1] || "-100") > 0;
        ind.classList.remove("is-pulling");
        if (trigger) {
            ind.classList.add("is-refreshing");
            ind.style.transform = "";
            const fn = PTR.onRefresh || (() => Promise.resolve());
            Promise.resolve(fn()).finally(() => {
                setTimeout(() => {
                    ind.classList.remove("is-refreshing");
                    ind.style.transform = "";
                }, 300);
            });
        } else {
            ind.style.transform = "";
        }
        PTR.armed = false;
        PTR.pulling = false;
    });
}
function setPullToRefreshHandler(fn) { PTR.onRefresh = fn; }

// ----- 10. Friend-just-dropped toast -----
function startFriendDropWatcher() {
    if (state.friendDropUnsub) state.friendDropUnsub();
    if (!state.user) return;
    state.friendDropSeen = new Set();
    let firstSnap = true;
    const q = query(collection(db, "posts"), where("promptDate", "==", todayKey()));
    state.friendDropUnsub = onSnapshot(q, (snap) => {
        snap.docChanges().forEach(ch => {
            if (ch.type !== "added") return;
            const id = ch.doc.id;
            if (state.friendDropSeen.has(id)) return;
            state.friendDropSeen.add(id);
            if (firstSnap) return; // skip backfill
            const data = ch.doc.data();
            if (data.circleId) return;
            if (data.uid === state.user.uid) return;
            if (!state.friends.has(data.uid)) return;
            // Don't toast if the user is already viewing the feed
            if (location.hash.startsWith("#/feed") || location.hash.startsWith("#/post/")) return;
            showFriendDropToast(data, id);
        });
        firstSnap = false;
    }, (err) => console.warn("friend drop watcher:", err));
}
let _friendToastTimer = null;
function showFriendDropToast(post, postId) {
    const el = document.getElementById("friend-toast");
    if (!el) return;
    const img = (post.images && post.images[0]) || post.imageUrl || "";
    const initial = (post.username || "?").charAt(0).toUpperCase();
    el.innerHTML = `
        ${img
            ? `<img src="${escapeHtml(img)}" alt="" />`
            : `<div class="post-avatar" style="width:36px;height:36px;font-size:14px;">${escapeHtml(initial)}</div>`}
        <span class="ft-text"><strong>@${escapeHtml(post.username || "user")}</strong> just dropped</span>`;
    el.hidden = false;
    el.onclick = () => {
        location.hash = `#/post/${postId}`;
        hideFriendDropToast();
    };
    // Force reflow then show
    void el.offsetWidth;
    el.classList.add("is-shown");
    el.classList.remove("is-leaving");
    Sounds.friendAccepted?.();
    if (_friendToastTimer) clearTimeout(_friendToastTimer);
    _friendToastTimer = setTimeout(hideFriendDropToast, 4500);
}
function hideFriendDropToast() {
    const el = document.getElementById("friend-toast");
    if (!el) return;
    el.classList.remove("is-shown");
    el.classList.add("is-leaving");
    setTimeout(() => { el.hidden = true; el.classList.remove("is-leaving"); }, 300);
}

function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

function initials(name) {
    if (!name) return "?";
    return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

function showToast(msg, type = "default") {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    $("#toast-container").appendChild(el);
    setTimeout(() => {
        el.style.transition = "opacity 240ms, transform 240ms";
        el.style.opacity = "0";
        el.style.transform = "translateY(8px)";
        setTimeout(() => el.remove(), 260);
    }, 2600);
}

/* =============================================================
   IN-APP SOUND CUES
   Tiny synthesized tones via Web Audio — no external files,
   no licensing concerns. User can mute in Settings.
   ============================================================= */
const Sounds = (() => {
    let ctx = null;
    let enabled = localStorage.getItem("drop:sounds") !== "0"; // default ON

    function ensureCtx() {
        if (!enabled) return null;
        try {
            if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === "suspended") ctx.resume();
            return ctx;
        } catch (e) { return null; }
    }

    // Play one tone: f Hz, dur s, type, peak gain
    function tone(f, dur = 0.12, type = "sine", gain = 0.08, delay = 0) {
        const c = ensureCtx();
        if (!c) return;
        const t0 = c.currentTime + delay;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f, t0);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    return {
        get enabled() { return enabled; },
        set(on) {
            enabled = !!on;
            localStorage.setItem("drop:sounds", on ? "1" : "0");
            if (on) tone(660, 0.1, "sine", 0.06); // confirmation blip
        },
        // Distinct cues — short, gentle, never alarming
        promptOpen()    { tone(523, 0.18, "sine",     0.07);
                          tone(784, 0.22, "sine",     0.07, 0.08); },     // C5 → G5
        postSent()      { tone(880, 0.10, "triangle", 0.08);
                          tone(1175, 0.16, "triangle", 0.08, 0.07); },    // A5 → D6
        likeReceived()  { tone(988, 0.12, "sine",     0.06); },           // B5 ping
        messageIn()     { tone(740, 0.09, "sine",     0.06);
                          tone(988, 0.12, "sine",     0.06, 0.05); },     // F#5 → B5
        messageOut()    { tone(1320, 0.06, "sine",    0.04); },           // soft swish
        friendAccepted(){ tone(587, 0.10, "triangle", 0.07);
                          tone(740, 0.10, "triangle", 0.07, 0.08);
                          tone(988, 0.18, "triangle", 0.07, 0.16); },     // D5–F#5–B5
    };
})();

function confirmDialog(title, message, okText = "Confirm") {
    return new Promise((resolve) => {
        $("#confirm-title").textContent = title;
        $("#confirm-message").textContent = message;
        $("#confirm-ok").textContent = okText;
        $("#confirm-dialog").hidden = false;
        const cleanup = () => {
            $("#confirm-dialog").hidden = true;
            $("#confirm-ok").onclick = null;
            $("#confirm-cancel").onclick = null;
        };
        $("#confirm-ok").onclick = () => { cleanup(); resolve(true); };
        $("#confirm-cancel").onclick = () => { cleanup(); resolve(false); };
    });
}

/* =============================================================
   STATE
   ============================================================= */

const state = {
    user: null,           // Firebase auth user
    profile: null,        // users/{uid} doc
    todayPrompt: null,    // { date, text }
    countdownInterval: null,
    feedUnsub: null,
    telegramReady: false,

    // ----- social state -----
    feedTab: "friends",                // "friends" | "all"
    feedDocs: [],                      // last snapshot of today's posts (raw docs)
    friends: new Map(),                // friendUid -> { username, displayName }
    friendsUnsub: null,
    requestsIn: new Map(),             // requesterUid -> { username, displayName, requestedAt }
    requestsInUnsub: null,
    requestsOut: new Map(),            // recipientUid -> { username, displayName, requestedAt }
    requestsOutUnsub: null,

    // ----- chat state -----
    chatThreads: new Map(),            // chatId -> { otherUid, otherUsername, lastMessage, updatedAt, unreadCount }
    chatThreadsUnsub: null,
    threadUnsub: null,
    threadOtherUid: null,

    // ----- comments state -----
    commentsUnsub: null,
    commentsPostId: null,
    repliesUnsubs: new Map(),          // commentId -> unsub for that comment's replies feed

    // ----- notifications state -----
    notificationsUnsub: null,
    notifications: [],                 // array of doc snapshots

    // ----- liveliness state -----
    todayCounterUnsub: null,           // listener for "X friends dropped today"
    friendDropUnsub: null,             // listener for friend-just-dropped toast
    friendDropSeen: null,              // Set<postId> of seen post IDs
    lastStreakShown: 0,                // last streak we celebrated (avoid double-confetti)
    feedRenderedOnce: false            // suppress new-card animation on initial load
};

const REACTIONS = [
    { key: "fire",  emoji: "🔥" },
    { key: "love",  emoji: "❤️" },
    { key: "lol",   emoji: "😂" },
    { key: "wow",   emoji: "😮" },
    { key: "clap",  emoji: "👏" }
];
const REACTION_BY_KEY = Object.fromEntries(REACTIONS.map(r => [r.key, r.emoji]));

/* =============================================================
   PROMPT WINDOW LOGIC
   ============================================================= */

function getPromptTimeMinutes() {
    const t = state.profile?.promptTimeLocal || "19:00";
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

function getWindowState() {
    const promptMin = getPromptTimeMinutes();
    const nowMin = nowMinutes();
    const minsUntilOpen = promptMin - nowMin;
    const ON_TIME_WINDOW_MIN = 4; // first 4 min after open = "on time"

    if (minsUntilOpen > 0) {
        return { phase: "before", secondsUntil: minsUntilOpen * 60 - new Date().getSeconds() };
    } else if (minsUntilOpen <= 0 && minsUntilOpen > -ON_TIME_WINDOW_MIN) {
        const secondsLeft = (-minsUntilOpen + ON_TIME_WINDOW_MIN) * 60 - new Date().getSeconds();
        return { phase: "open", secondsLeft };
    } else {
        return { phase: "late" };
    }
}

function isPostOnTime(postedAt, promptDate) {
    const promptMin = getPromptTimeMinutes();
    const posted = postedAt instanceof Date ? postedAt : postedAt.toDate?.() || new Date(postedAt);
    const promptOpen = new Date(`${promptDate}T00:00:00`);
    promptOpen.setMinutes(promptMin);
    const diffMin = (posted - promptOpen) / 60000;
    return diffMin >= -1 && diffMin <= 4;
}

function formatCountdown(seconds) {
    if (seconds <= 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
}

/* =============================================================
   AUTH FLOW
   ============================================================= */

onAuthStateChanged(auth, async (user) => {
    if (user) {
        state.user = user;
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (profileSnap.exists()) {
            state.profile = { uid: user.uid, ...profileSnap.data() };
            // Init Telegram link helper (no-op if bot username isn't set yet)
            if (CONFIG.telegram.botUsername) {
                initTelegramFor(user.uid).catch(() => {});
            }
            // Start social subscriptions (friends, requests, chat threads)
            startSocialSubscriptions(user.uid);
            // Start notifications subscription
            subscribeToNotifications(user.uid);
            // Start liveliness subscriptions
            startTodayCounter();
            startFriendDropWatcher();
            state.lastStreakShown = state.profile.currentStreak || 0;
            // First time? No username yet → onboarding.
            if (!state.profile.username && !location.hash.startsWith("#/onboarding")) {
                location.hash = "#/onboarding";
            } else if (location.hash === "" || location.hash === "#" || location.hash.startsWith("#/login") || location.hash.startsWith("#/signup")) {
                location.hash = "#/";
            } else {
                router();
            }
        } else {
            // Auth exists but no profile doc — create skeleton + push to onboarding
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                createdAt: serverTimestamp(),
                currentStreak: 0,
                longestStreak: 0,
                totalDrops: 0,
                promptTimeLocal: "19:00",
                telegramChatId: null,
                telegramNotifyEnabled: false
            });
            location.hash = "#/onboarding";
        }
    } else {
        state.user = null;
        state.profile = null;
        stopSocialSubscriptions();
        if (state.feedUnsub) { state.feedUnsub(); state.feedUnsub = null; }
        if (state.commentsUnsub) { state.commentsUnsub(); state.commentsUnsub = null; }
        if (state.threadUnsub) { state.threadUnsub(); state.threadUnsub = null; }
        if (state.notificationsUnsub) { state.notificationsUnsub(); state.notificationsUnsub = null; }
        if (state.todayCounterUnsub) { state.todayCounterUnsub(); state.todayCounterUnsub = null; }
        if (state.friendDropUnsub) { state.friendDropUnsub(); state.friendDropUnsub = null; }
        state.repliesUnsubs.forEach(u => u()); state.repliesUnsubs.clear();
        if (!["#/login", "#/signup"].some(h => location.hash.startsWith(h))) {
            location.hash = "#/login";
        } else {
            router();
        }
    }
});

async function handleSignup(e) {
    e.preventDefault();
    const name = $("#signup-name").value.trim();
    const email = $("#signup-email").value.trim();
    const password = $("#signup-password").value;
    const inviteRaw = ($("#signup-invite")?.value || "").trim().toUpperCase();
    const errEl = $("#signup-error");
    errEl.hidden = true;
    try {
        // Validate invite code BEFORE creating account so the user can correct it.
        let inviter = null;
        if (inviteRaw) {
            inviter = await findInviter(inviteRaw);
            if (!inviter) {
                errEl.textContent = "That invite code isn't valid.";
                errEl.hidden = false;
                return;
            }
        }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const myInviteCode = generateInviteCode();
        await setDoc(doc(db, "users", cred.user.uid), {
            email,
            displayName: name,
            createdAt: serverTimestamp(),
            currentStreak: inviter ? 1 : 0,    // streak boost on join
            longestStreak: inviter ? 1 : 0,
            totalDrops: 0,
            promptTimeLocal: "19:00",
            telegramChatId: null,
            telegramNotifyEnabled: false,
            inviteCode: myInviteCode,
            invitedBy: inviter ? inviter.uid : null,
            invitedCount: 0
        });
        if (inviter) {
            // Reward inviter: +1 to invitedCount, bump streak by 1.
            await updateDoc(doc(db, "users", inviter.uid), {
                invitedCount: increment(1),
                currentStreak: increment(1),
                longestStreak: increment(1)
            }).catch(() => {});
        }
    } catch (err) {
        errEl.textContent = friendlyAuthError(err);
        errEl.hidden = false;
    }
}

function generateInviteCode() {
    // 4 unambiguous chars (no 0/O/1/I).
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
    return `DROP-${s}`;
}

async function findInviter(code) {
    const snap = await getDocs(query(collection(db, "users"), where("inviteCode", "==", code), limit(1)));
    if (snap.empty) return null;
    return { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

async function ensureMyInviteCode() {
    if (!state.profile) return;
    if (state.profile.inviteCode) return state.profile.inviteCode;
    const code = generateInviteCode();
    await updateDoc(doc(db, "users", state.user.uid), { inviteCode: code }).catch(() => {});
    state.profile.inviteCode = code;
    return code;
}

async function handleLogin(e) {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    const errEl = $("#login-error");
    errEl.hidden = true;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        errEl.textContent = friendlyAuthError(err);
        errEl.hidden = false;
    }
}

async function handleForgot() {
    const email = $("#login-email").value.trim();
    if (!email) { showToast("Enter your email above first."); return; }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Reset link sent. Check your inbox.", "success");
    } catch (err) {
        showToast(friendlyAuthError(err), "error");
    }
}

async function handleSignout() {
    try {
        await signOut(auth);
    } catch (err) {
        showToast("Sign out failed.", "error");
    }
}

async function handleDeleteAccount() {
    const ok = await confirmDialog(
        "Delete your account?",
        "All your drops, streaks and profile will be permanently removed. This cannot be undone.",
        "Delete forever"
    );
    if (!ok) return;
    try {
        await deleteDoc(doc(db, "users", state.user.uid));
        await deleteUser(state.user);
        showToast("Account deleted.", "success");
    } catch (err) {
        showToast("Could not delete account. You may need to sign in again first.", "error");
    }
}

function friendlyAuthError(err) {
    const code = err?.code || "";
    if (code.includes("invalid-email")) return "That email doesn't look right.";
    if (code.includes("missing-password") || code.includes("weak-password")) return "Password must be at least 6 characters.";
    if (code.includes("email-already-in-use")) return "That email is already registered. Try signing in.";
    if (code.includes("user-not-found") || code.includes("invalid-credential") || code.includes("wrong-password")) return "Email or password is incorrect.";
    if (code.includes("network")) return "Network error. Check your connection.";
    if (code.includes("too-many-requests")) return "Too many attempts. Try again in a minute.";
    return err?.message || "Something went wrong.";
}

/* =============================================================
   ONBOARDING
   ============================================================= */

let onboardingSlide = 0;

function showOnboardingSlide(n) {
    onboardingSlide = n;
    $$(".onboarding-slide").forEach(el => {
        el.hidden = Number(el.dataset.slide) !== n;
    });
    $$("#onboarding-dots .dot").forEach(el => {
        el.classList.toggle("active", Number(el.dataset.dot) === n);
    });
    $("#onboarding-back").hidden = n === 0;
    $("#onboarding-next").hidden = n === 2;
}

function setupOnboardingControls() {
    $("#onboarding-next").onclick = () => showOnboardingSlide(Math.min(2, onboardingSlide + 1));
    $("#onboarding-back").onclick = () => showOnboardingSlide(Math.max(0, onboardingSlide - 1));
    $$("#onboarding-dots .dot").forEach(el => {
        el.onclick = () => showOnboardingSlide(Number(el.dataset.dot));
    });
    $("#onboarding-form").onsubmit = handleOnboardingSubmit;
}

async function handleOnboardingSubmit(e) {
    e.preventDefault();
    const username = $("#onboarding-username").value.trim().toLowerCase();
    const errEl = $("#onboarding-error");
    errEl.hidden = true;
    if (!/^[a-z0-9_]{2,24}$/.test(username)) {
        errEl.textContent = "Pick a username with letters, numbers, or underscores (2–24 chars).";
        errEl.hidden = false;
        return;
    }
    try {
        // Check uniqueness
        const existing = await getDocs(query(collection(db, "users"), where("username", "==", username), limit(1)));
        if (!existing.empty && existing.docs[0].id !== state.user.uid) {
            errEl.textContent = "That username is taken.";
            errEl.hidden = false;
            return;
        }
        await updateDoc(doc(db, "users", state.user.uid), { username });
        state.profile.username = username;
        location.hash = "#/";
    } catch (err) {
        errEl.textContent = "Couldn't save. Try again.";
        errEl.hidden = false;
    }
}

/* =============================================================
   PROMPTS — load today's, seed 30 days
   ============================================================= */

async function loadTodayPrompt() {
    const key = todayKey();
    const snap = await getDoc(doc(db, "prompts", key));
    if (snap.exists()) {
        state.todayPrompt = { date: key, ...snap.data() };
    } else {
        // Try yesterday's top-voted community submission as today's prompt.
        const winner = await pickTopCommunityPromptFor(key).catch(() => null);
        if (winner) {
            await setDoc(doc(db, "prompts", key), {
                date: key, text: winner.text, source: "community",
                submittedBy: winner.submittedBy || null
            }).catch(() => {});
            state.todayPrompt = { date: key, text: winner.text, source: "community" };
        } else {
            state.todayPrompt = { date: key, text: "Show what's right in front of you." };
        }
    }
    return state.todayPrompt;
}

async function pickTopCommunityPromptFor(targetDate) {
    // Pick highest-voted pending submission, mark it used.
    const q = query(
        collection(db, "promptSubmissions"),
        where("status", "==", "pending"),
        limit(50)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.votes || 0) - (a.votes || 0));
    const top = sorted[0];
    if (!top || (top.votes || 0) < 1) return null;
    await updateDoc(doc(db, "promptSubmissions", top.id), {
        status: "used",
        usedDate: targetDate
    }).catch(() => {});
    return top;
}

async function seedPrompts() {
    const today = new Date();
    const batch = [];
    for (let i = 0; i < PROMPTS.length; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const key = todayKey(d);
        batch.push(setDoc(doc(db, "prompts", key), { date: key, text: PROMPTS[i] }));
    }
    await Promise.all(batch);
    console.log(`Seeded ${PROMPTS.length} prompts starting ${todayKey()}.`);
    showToast(`Seeded ${PROMPTS.length} prompts.`, "success");
}

window.seedPrompts = seedPrompts;

/* =============================================================
   TODAY VIEW
   ============================================================= */

async function renderToday() {
    await loadTodayPrompt();
    $("#today-date").textContent = formatDateLong();
    $("#today-prompt-text").textContent = state.todayPrompt.text;
    const streakNum = $("#today-streak .streak-num");
    if (streakNum) streakNum.textContent = state.profile?.currentStreak || 0;

    // Did the user already post today?
    const posted = await hasPostedToday();
    $("#today-already-posted").hidden = !posted;
    $("#today-action").hidden = posted;

    if (state.countdownInterval) clearInterval(state.countdownInterval);
    state.countdownInterval = setInterval(updateCountdown, 1000);
    updateCountdown();

    // Liveliness: themed pill, memories, and refresh hook
    renderThemePill();
    loadMemories();
    setPullToRefreshHandler(async () => { await renderToday(); });

    $("#today-snap-btn").onclick = () => { location.hash = "#/capture"; };
}

let _lastCountdownPhase = null;
function updateCountdown() {
    const w = getWindowState();
    const cd = $("#today-countdown");
    const label = cd.querySelector(".countdown-label");
    const value = cd.querySelector(".countdown-value");
    const btn = $("#today-snap-btn");
    const hint = $("#today-action-hint");

    // Play a soft chime the moment the prompt opens (only on transition,
    // not while sitting on the page after it's already open).
    if (_lastCountdownPhase && _lastCountdownPhase !== "open" && w.phase === "open") {
        Sounds.promptOpen();
    }
    _lastCountdownPhase = w.phase;

    if (w.phase === "before") {
        cd.classList.remove("is-open");
        label.textContent = "Opens in";
        value.textContent = formatCountdown(w.secondsUntil);
        btn.disabled = true;
        btn.textContent = "Capture";
        hint.textContent = "Get ready — the prompt opens at your set time.";
    } else if (w.phase === "open") {
        cd.classList.add("is-open");
        label.textContent = "Live now";
        value.textContent = `${formatCountdown(w.secondsLeft)} left`;
        btn.disabled = false;
        btn.textContent = "Capture now";
        hint.textContent = "Post in the next few minutes to be on time.";
    } else {
        cd.classList.remove("is-open");
        label.textContent = "Late entries open";
        value.textContent = "Feed is live";
        btn.disabled = false;
        btn.textContent = "Post late";
        hint.textContent = "You can still post — it'll just be marked late.";
    }
    // Liveliness: red pulse on the Today nav while the prompt is open
    setNavLivePulse();
}

async function hasPostedToday() {
    if (!state.user) return false;
    const q = query(
        collection(db, "posts"),
        where("uid", "==", state.user.uid),
        where("promptDate", "==", todayKey()),
        limit(1)
    );
    const snap = await getDocs(q);
    return !snap.empty;
}

/* =============================================================
   FEED VIEW
   ============================================================= */

function renderFeed() {
    const promptText = state.todayPrompt?.text || "Today";
    $("#feed-prompt-text").textContent = promptText;

    const grid = $("#feed-grid");
    // Liveliness: shimmer placeholders while the first snapshot arrives
    grid.innerHTML = skeletonFeedHTML(3);
    state.feedRenderedOnce = false;
    $("#feed-empty").hidden = true;
    // Liveliness: top-liked drop from yesterday banner
    loadDropOfTheDay();
    // Liveliness: pull-to-refresh re-subscribes
    setPullToRefreshHandler(async () => { renderFeed(); });

    if (state.feedUnsub) state.feedUnsub();

    // Single where() — no composite index needed. Sort client-side below.
    const q = query(
        collection(db, "posts"),
        where("promptDate", "==", todayKey())
    );

    state.feedUnsub = onSnapshot(q, (snap) => {
        state.feedDocs = snap.docs;
        applyFeedRender();
    }, (err) => {
        console.error("Feed listener error:", err);
        $("#feed-empty").hidden = false;
        $("#feed-empty").innerHTML = `<h3>Couldn't load feed</h3><p class="muted">${escapeHtml(err.message)}</p>`;
    });
}

// Re-renders the feed grid based on current feedTab + cached feedDocs.
function applyFeedRender() {
    const grid = $("#feed-grid");
    if (!grid) return;

    // Clear skeleton placeholders the first time real data arrives
    if (!state.feedRenderedOnce) {
        grid.querySelectorAll(".skel-card").forEach(el => el.remove());
    }

    // Always exclude posts scoped to a circle from the public/global feed.
    let docs = state.feedDocs.filter(d => !d.data().circleId);

    if (state.feedTab === "friends") {
        const allowed = new Set([state.user.uid, ...state.friends.keys()]);
        docs = docs.filter(d => allowed.has(d.data().uid));
    }

    docs = docs.sort((a, b) => {
        const ta = a.data().createdAt?.toMillis?.() || 0;
        const tb = b.data().createdAt?.toMillis?.() || 0;
        return tb - ta;
    }).slice(0, 120);

    if (docs.length === 0) {
        $("#feed-empty").hidden = false;
        const empty = $("#feed-empty");
        if (state.feedTab === "friends") {
            empty.innerHTML = `<h3>No friend drops yet</h3><p class="muted">Add friends or switch to Everyone.</p>`;
        } else {
            empty.innerHTML = `<h3>No drops yet today</h3><p class="muted">Be the first to drop.</p>`;
        }
        $("#feed-count").textContent = "0 drops";
        grid.innerHTML = "";
        return;
    }

    $("#feed-empty").hidden = true;
    $("#feed-count").textContent = `${docs.length} drop${docs.length === 1 ? "" : "s"}`;

    // Incremental render: only diff/patch cards instead of wiping the whole grid.
    // This prevents the full-grid flash when a single post (e.g. a reaction)
    // changes in the snapshot.
    const existing = new Map();
    grid.querySelectorAll(".post-card").forEach(c => existing.set(c.dataset.postId, c));

    const newIds = new Set(docs.map(d => d.id));
    existing.forEach((card, id) => { if (!newIds.has(id)) card.remove(); });

    let prev = null;
    docs.forEach(d => {
        const id = d.id;
        const data = d.data();
        let card = existing.get(id);
        if (!card) {
            const tpl = document.createElement("template");
            tpl.innerHTML = renderPostCardHTML(id, data).trim();
            card = tpl.content.firstElementChild;
            if (prev && prev.nextSibling !== card) prev.after(card);
            else if (!prev) grid.prepend(card);
            else grid.appendChild(card);
            wirePostCard(card);
            // Liveliness: animate in only after the initial paint, so we don't
            // animate every card on first feed load.
            if (state.feedRenderedOnce) {
                card.classList.add("is-new");
                setTimeout(() => card.classList.remove("is-new"), 500);
            }
        } else {
            // Patch in-place: replace inner HTML, preserve outer article + its
            // event listener (set in wirePostCard) so no full-page flash.
            const tpl = document.createElement("template");
            tpl.innerHTML = renderPostCardHTML(id, data).trim();
            const fresh = tpl.content.firstElementChild;
            // Only swap inner if changed (cheap signature: likes+comments+reactions+caption)
            const sig = postSignature(data);
            if (card.dataset.sig !== sig) {
                card.innerHTML = fresh.innerHTML;
                card.dataset.sig = sig;
                wireCarouselScroll(card);
            }
            if (prev && prev.nextSibling !== card) prev.after(card);
            else if (!prev && grid.firstChild !== card) grid.prepend(card);
        }
        if (!card.dataset.sig) card.dataset.sig = postSignature(data);
        prev = card;
    });
    state.feedRenderedOnce = true;
}

function postSignature(p) {
    const reactions = p.reactions || {};
    const rs = Object.keys(reactions).sort().map(k => `${k}:${reactions[k]}`).join(",");
    const ur = (p.userReactions || {})[(state.user && state.user.uid) || ""] || "";
    const lb = (p.likedBy || []).length;
    return [
        p.likes || 0,
        p.commentsCount || 0,
        rs,
        ur,
        lb,
        (p.caption || "").length,
        p.imageUrl || ""
    ].join("|");
}

function renderPostCardHTML(postId, p) {
    const onTime = p.isOnTime;
    const userLiked = (p.likedBy || []).includes(state.user.uid);
    const likes = p.likes || 0;
    const comments = p.commentsCount || 0;
    const initial = (p.username || "?").charAt(0).toUpperCase();
    const timeAgo = p.createdAt?.toMillis ? relativeTime(p.createdAt.toMillis()) : "";
    const images = (p.images && p.images.length) ? p.images : [p.imageUrl];
    const isCarousel = images.length > 1;
    const myReaction = (p.userReactions || {})[state.user.uid] || null;

    const imageHtml = isCarousel
        ? `<div class="post-image-wrap carousel" data-action="open">
                <div class="post-image-track">
                    ${images.map(u => `<img class="post-image" src="${escapeHtml(u)}" alt="" loading="lazy" />`).join("")}
                </div>
                <div class="carousel-counter">1/${images.length}</div>
                <div class="carousel-dots">
                    ${images.map((_, i) => `<span class="carousel-dot ${i === 0 ? "active" : ""}"></span>`).join("")}
                </div>
            </div>`
        : `<div class="post-image-wrap" data-action="open">
                <img class="post-image" src="${escapeHtml(p.imageUrl || images[0] || "")}" alt="" loading="lazy" />
            </div>`;

    const reactionsHtml = renderReactionsRowHTML(p, myReaction, postId, /*compact*/ true);
    const taggedNames = Array.isArray(p.taggedUsernames) ? p.taggedUsernames.filter(Boolean) : [];
    const hasTagged = taggedNames.length > 0;
    const withBadgeHtml = hasTagged ? renderWithBadgeHTML(taggedNames) : "";

    return `
        <article class="post-card ${hasTagged ? "has-tagged" : ""}" data-post-id="${postId}">
            <header class="post-header">
                <div class="post-avatar" data-username="${escapeHtml(p.username || "")}">${escapeHtml(initial)}</div>
                <div class="post-header-text">
                    <span class="post-username" data-username="${escapeHtml(p.username || "")}">@${escapeHtml(p.username || "user")}</span>
                    <span class="post-time">${timeAgo}${timeAgo ? " · " : ""}<span class="post-badge ${onTime ? "badge-ontime" : "badge-late"}">${onTime ? "On time" : "Late"}</span></span>
                </div>
            </header>
            ${withBadgeHtml}
            ${imageHtml}
            <div class="post-actions">
                <button class="post-action like-btn ${userLiked ? "liked" : ""}" data-action="like" aria-label="Like">
                    <span class="heart">${userLiked ? "♥" : "♡"}</span>
                    <span class="post-action-count">${likes}</span>
                </button>
                <button class="post-action" data-action="comment" aria-label="Comment">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span class="post-action-count">${comments}</span>
                </button>
                <button class="post-action" data-action="share" aria-label="Share">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                </button>
            </div>
            ${reactionsHtml}
            ${p.caption ? `<p class="post-caption"><span class="post-caption-author" data-username="${escapeHtml(p.username || "")}">@${escapeHtml(p.username || "user")}</span> ${linkifyText(p.caption)}</p>` : ""}
            ${comments > 0 ? `<button class="post-view-comments" data-action="open">View all ${comments} comment${comments === 1 ? "" : "s"}</button>` : ""}
        </article>`;
}

function renderWithBadgeHTML(usernames) {
    if (!usernames || !usernames.length) return "";
    const stack = usernames.slice(0, 3).map(u => {
        const initial = (u || "?").charAt(0).toUpperCase();
        return `<span class="with-avatar">${escapeHtml(initial)}</span>`;
    }).join("");
    let textParts;
    if (usernames.length === 1) {
        textParts = `<a data-username="${escapeHtml(usernames[0])}">@${escapeHtml(usernames[0])}</a>`;
    } else if (usernames.length === 2) {
        textParts = `<a data-username="${escapeHtml(usernames[0])}">@${escapeHtml(usernames[0])}</a> and <a data-username="${escapeHtml(usernames[1])}">@${escapeHtml(usernames[1])}</a>`;
    } else {
        textParts = `<a data-username="${escapeHtml(usernames[0])}">@${escapeHtml(usernames[0])}</a> and ${usernames.length - 1} others`;
    }
    return `<div class="post-with-badge">
        <span class="post-with-stack">${stack}</span>
        <span class="post-with-text">with ${textParts}</span>
    </div>`;
}

function renderReactionsRowHTML(p, myReaction, postId, compact) {
    const reactions = p.reactions || {};
    const chips = REACTIONS.map(r => {
        const c = reactions[r.key] || 0;
        if (compact && c === 0 && myReaction !== r.key) return "";
        const active = myReaction === r.key ? "active" : "";
        return `<button class="reaction-chip ${active}" data-reaction="${r.key}" data-post-id="${postId}">
            <span class="emoji">${r.emoji}</span>${c > 0 ? `<span class="count">${c}</span>` : ""}
        </button>`;
    }).filter(Boolean).join("");
    const picker = `<button class="reaction-picker" data-action="reaction-picker" data-post-id="${postId}" aria-label="Add reaction">
        <span style="font-size:16px;line-height:1">😊</span><span style="font-size:18px;line-height:1">+</span>
    </button>`;
    return `<div class="reactions-row">${chips}${picker}</div>`;
}

function wirePostCards(container) {
    container.querySelectorAll(".post-card").forEach(card => wirePostCard(card));
}

function wireCarouselScroll(card) {
    const track = card.querySelector(".post-image-track");
    if (!track || track.dataset.wired) return;
    track.dataset.wired = "1";
    const counter = card.querySelector(".carousel-counter");
    const dots = card.querySelectorAll(".carousel-dot");
    track.addEventListener("scroll", () => {
        const idx = Math.round(track.scrollLeft / track.clientWidth);
        if (counter) counter.textContent = `${idx + 1}/${dots.length}`;
        dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    });
}

function wirePostCard(card) {
    if (card.dataset.wired) return;
    card.dataset.wired = "1";
    const postId = card.dataset.postId;
    wireCarouselScroll(card);
    // Double-tap photo to like (Instagram-style)
    const wrap = card.querySelector(".post-image-wrap");
    if (wrap) {
        let lastTap = 0;
        wrap.addEventListener("click", (e) => {
            const now = Date.now();
            if (now - lastTap < 320) {
                e.preventDefault();
                e.stopPropagation();
                const likeBtn = card.querySelector('.like-btn[data-action="like"]');
                if (likeBtn && !likeBtn.classList.contains("liked")) {
                    toggleLikeOnPost(postId, likeBtn);
                }
                spawnBigHeart(wrap);
                lastTap = 0;
            } else {
                lastTap = now;
            }
        });
    }
    {
        card.addEventListener("click", async (e) => {
            const target = e.target.closest("[data-action], [data-username], [data-reaction]");
            if (!target) {
                location.hash = `#/post/${postId}`;
                return;
            }
            const action = target.dataset.action;
            const usernameLink = target.dataset.username;
            const reactionKey = target.dataset.reaction;

            if (reactionKey) {
                e.stopPropagation();
                // Pass the actual clicked chip so the floating emoji can launch
                // from its real on-screen position (the row gets re-rendered
                // after, which would otherwise lose the anchor).
                await toggleReaction(postId, reactionKey, target);
                return;
            }
            if (action === "reaction-picker") {
                e.stopPropagation();
                showReactionPicker(target, postId);
                return;
            }
            if (usernameLink) {
                location.hash = `#/profile/${encodeURIComponent(usernameLink)}`;
                return;
            }
            if (action === "like") {
                await toggleLikeOnPost(postId, target);
                return;
            }
            if (action === "share") {
                location.hash = `#/share/${postId}`;
                return;
            }
            // "open" or "comment" or anywhere else → post detail page
            location.hash = `#/post/${postId}`;
        });
    }
}

async function toggleLikeOnPost(postId, btn) {
    const wasLiked = btn.classList.contains("liked");
    const heart = btn.querySelector(".heart");
    const count = btn.querySelector(".post-action-count");
    btn.classList.toggle("liked", !wasLiked);
    btn.classList.add("pulse");
    setTimeout(() => btn.classList.remove("pulse"), 400);
    if (heart) heart.textContent = wasLiked ? "♡" : "♥";
    // Liveliness: float a few hearts up from the button when liking
    if (!wasLiked) spawnFloatingReaction("❤️", btn);
    const newCount = (Number(count?.textContent) || 0) + (wasLiked ? -1 : 1);
    if (count) count.textContent = Math.max(0, newCount);
    try {
        await updateDoc(doc(db, "posts", postId), {
            likes: increment(wasLiked ? -1 : 1),
            likedBy: wasLiked ? arrayRemove(state.user.uid) : arrayUnion(state.user.uid)
        });
        // Notify owner of like (only on like, not unlike, and not for self)
        if (!wasLiked) {
            const psnap = await getDoc(doc(db, "posts", postId));
            const owner = psnap.data()?.uid;
            if (owner && owner !== state.user.uid) {
                writeNotification(owner, {
                    type: "like",
                    fromUid: state.user.uid,
                    fromUsername: state.profile.username,
                    postId,
                    postThumb: psnap.data()?.imageUrl || ""
                });
            }
        }
    } catch (err) {
        console.warn(err);
        btn.classList.toggle("liked", wasLiked);
        if (heart) heart.textContent = wasLiked ? "♥" : "♡";
        if (count) count.textContent = newCount + (wasLiked ? 1 : -1);
        showToast("Couldn't update like.", "error");
    }
}

/* =============================================================
   REACTIONS
   ============================================================= */

async function toggleReaction(postId, reactionKey, anchorEl) {
    const ref = doc(db, "posts", postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const p = snap.data();
    const userReactions = p.userReactions || {};
    const reactions = p.reactions || {};
    const previous = userReactions[state.user.uid] || null;

    const updates = {};
    if (previous === reactionKey) {
        // Toggle off
        updates[`reactions.${reactionKey}`] = increment(-1);
        updates[`userReactions.${state.user.uid}`] = deleteField();
    } else {
        if (previous) updates[`reactions.${previous}`] = increment(-1);
        updates[`reactions.${reactionKey}`] = increment(1);
        updates[`userReactions.${state.user.uid}`] = reactionKey;
    }
    // Optimistic in-place patch BEFORE the network round-trip so the user
    // sees the chip update immediately and there's no full-page flash.
    const optimisticReactions = { ...reactions };
    let optimisticUserReaction;
    if (previous === reactionKey) {
        optimisticReactions[reactionKey] = Math.max(0, (optimisticReactions[reactionKey] || 0) - 1);
        optimisticUserReaction = null;
    } else {
        if (previous) optimisticReactions[previous] = Math.max(0, (optimisticReactions[previous] || 0) - 1);
        optimisticReactions[reactionKey] = (optimisticReactions[reactionKey] || 0) + 1;
        optimisticUserReaction = reactionKey;
    }
    // Liveliness: float the emoji up from the visible click target. Capture
    // the position FIRST, before patchReactionsInDOM swaps the row out.
    if (previous !== reactionKey) {
        spawnFloatingReaction(REACTION_EMOJI[reactionKey], anchorEl);
        Sounds.likeReceived?.();
    }

    patchReactionsInDOM(postId, optimisticReactions, optimisticUserReaction);

    try {
        await updateDoc(ref, updates);
        // Snapshot listener will reconcile any drift.
    } catch (err) {
        console.warn(err);
        showToast("Couldn't react.", "error");
        // Revert on failure
        patchReactionsInDOM(postId, reactions, previous);
    }
}

// Patch every visible reactions-row for this post (feed, detail, hashtag…)
// without re-rendering the whole card.
function patchReactionsInDOM(postId, reactions, myReaction) {
    const fakePost = { reactions, userReactions: { [state.user.uid]: myReaction } };
    const newHtml = renderReactionsRowHTML(fakePost, myReaction || null, postId, /*compact*/ true);
    document.querySelectorAll(`.post-card[data-post-id="${postId}"], #post-detail [data-post-id="${postId}"]`).forEach(card => {
        const row = card.querySelector(":scope > .reactions-row, .reactions-row");
        if (row) row.outerHTML = newHtml;
    });
}

function showReactionPicker(anchorEl, postId) {
    closeReactionPicker();
    const pop = document.createElement("div");
    pop.className = "reaction-pop";
    pop.id = "reaction-pop";
    REACTIONS.forEach(r => {
        const b = document.createElement("button");
        b.textContent = r.emoji;
        b.onclick = (ev) => {
            ev.stopPropagation();
            // Anchor the floating emoji on the picker button the user tapped
            toggleReaction(postId, r.key, b);
            closeReactionPicker();
        };
        pop.appendChild(b);
    });
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.top = `${window.scrollY + rect.top - pop.offsetHeight - 8}px`;
    pop.style.left = `${Math.max(8, window.scrollX + rect.left)}px`;
    setTimeout(() => {
        document.addEventListener("click", closeReactionPickerOnce, { once: true });
    }, 0);
}
function closeReactionPickerOnce() { closeReactionPicker(); }
function closeReactionPicker() {
    const p = document.getElementById("reaction-pop");
    if (p) p.remove();
}

function relativeTime(ms) {
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

async function openPostDialog(postId) {
    const snap = await getDoc(doc(db, "posts", postId));
    if (!snap.exists()) return;
    const p = snap.data();
    $("#photo-dialog-img").src = p.imageUrl;
    $("#photo-dialog-prompt").textContent = state.todayPrompt?.text || "";
    $("#photo-dialog-username").textContent = `@${p.username}`;
    $("#photo-dialog-caption").textContent = p.caption || "";

    const likeBtn = $("#photo-dialog-like");
    const heart = likeBtn.querySelector(".heart");
    const count = likeBtn.querySelector(".like-count");
    const userLiked = (p.likedBy || []).includes(state.user.uid);
    likeBtn.classList.toggle("liked", userLiked);
    heart.textContent = userLiked ? "♥" : "♡";
    count.textContent = p.likes || 0;

    likeBtn.onclick = async () => {
        const wasLiked = likeBtn.classList.contains("liked");
        likeBtn.classList.toggle("liked", !wasLiked);
        likeBtn.classList.add("pulse");
        setTimeout(() => likeBtn.classList.remove("pulse"), 400);
        heart.textContent = wasLiked ? "♡" : "♥";
        const newCount = (Number(count.textContent) || 0) + (wasLiked ? -1 : 1);
        count.textContent = Math.max(0, newCount);
        try {
            await updateDoc(doc(db, "posts", postId), {
                likes: increment(wasLiked ? -1 : 1),
                likedBy: wasLiked ? arrayRemove(state.user.uid) : arrayUnion(state.user.uid)
            });
        } catch {
            // revert UI
            likeBtn.classList.toggle("liked", wasLiked);
            heart.textContent = wasLiked ? "♥" : "♡";
            count.textContent = newCount + (wasLiked ? 1 : -1);
            showToast("Couldn't update like.", "error");
        }
    };

    $("#photo-dialog-share").onclick = () => {
        closePhotoDialog();
        location.hash = `#/share/${postId}`;
    };

    // Subscribe to comments for this post
    subscribeToComments(postId);
    $("#photo-dialog-comment-form").onsubmit = (e) => {
        e.preventDefault();
        const text = $("#photo-dialog-comment-input").value.trim();
        if (!text) return;
        $("#photo-dialog-comment-input").value = "";
        postComment(postId, text);
    };

    $("#photo-dialog").hidden = false;
}

$("#photo-dialog-close").onclick = () => closePhotoDialog();

function closePhotoDialog() {
    $("#photo-dialog").hidden = true;
    if (state.commentsUnsub) { state.commentsUnsub(); state.commentsUnsub = null; }
    state.commentsPostId = null;
    $("#photo-dialog-comments").innerHTML = "";
}

/* =============================================================
   CAPTURE VIEW
   ============================================================= */

let captureFiles = [];                  // array of File objects (max 5)
const MAX_CAPTURE_FILES = 5;

async function renderCapture() {
    try {
        // Make sure today's prompt is loaded BEFORE we try to render the
        // capture screen. Doing this asynchronously without awaiting (the
        // old behavior) caused the capture text to show up blank and
        // could throw later inside handlePost.
        if (!state.todayPrompt) {
            try { await loadTodayPrompt(); } catch (e) { console.warn("loadTodayPrompt failed:", e); }
        }
        setText("#capture-prompt-text", state.todayPrompt?.text || "Today", "renderCapture");

        captureFiles = [];
        captureTagged = new Map(); // uid -> { username, displayName }

        setHidden("#capture-picker",        false, "renderCapture");
        setHidden("#capture-preview-block", true,  "renderCapture");
        setHidden("#capture-uploading",     true,  "renderCapture");
        setVal   ("#capture-caption",       "",    "renderCapture");
        setText  ("#capture-caption-count", "0 / 240", "renderCapture");
        setHidden("#capture-error",         true,  "renderCapture");
        setHTML  ("#capture-previews",      "",    "renderCapture");

        renderCaptureWithChips();
        setHidden("#capture-with-picker", true, "renderCapture");
    } catch (err) {
        // Last-resort guard: never let a render exception leave the user
        // staring at a frozen screen.
        console.error("renderCapture crashed:", err);
        showToast?.("Couldn't open the capture screen. Check console.", "error");
    }
}

// "With friends" tagging state + UI
let captureTagged = new Map();
function renderCaptureWithChips() {
    const wrap = $("#capture-with-chips");
    if (!wrap) return;
    wrap.innerHTML = "";
    captureTagged.forEach((info, uid) => {
        const chip = document.createElement("span");
        chip.className = "with-chip";
        chip.innerHTML = `@${escapeHtml(info.username || "user")}<button type="button" aria-label="Remove">×</button>`;
        chip.querySelector("button").onclick = () => {
            captureTagged.delete(uid);
            renderCaptureWithChips();
        };
        wrap.appendChild(chip);
    });
}
function renderCaptureWithResults(filter = "") {
    const list = $("#capture-with-results");
    if (!list) return;
    const friends = [...state.friends.entries()].map(([uid, info]) => ({ uid, ...info }));
    const f = filter.trim().toLowerCase();
    const filtered = f
        ? friends.filter(x =>
            (x.username || "").toLowerCase().includes(f) ||
            (x.displayName || "").toLowerCase().includes(f))
        : friends;
    if (filtered.length === 0) {
        list.innerHTML = `<div class="with-empty">${friends.length === 0 ? "No friends yet — add some first." : "No matches."}</div>`;
        return;
    }
    list.innerHTML = filtered.map(x => {
        const initial = (x.username || "?").charAt(0).toUpperCase();
        const sel = captureTagged.has(x.uid) ? "selected" : "";
        return `<div class="with-result-row ${sel}" data-uid="${x.uid}" data-username="${escapeHtml(x.username || "")}" data-display="${escapeHtml(x.displayName || "")}">
            <div class="with-result-avatar">${escapeHtml(initial)}</div>
            <div class="with-result-name">@${escapeHtml(x.username || "user")}</div>
            <div class="with-result-check"></div>
        </div>`;
    }).join("");
    list.querySelectorAll(".with-result-row").forEach(row => {
        row.onclick = () => {
            const uid = row.dataset.uid;
            if (captureTagged.has(uid)) captureTagged.delete(uid);
            else captureTagged.set(uid, { username: row.dataset.username, displayName: row.dataset.display });
            row.classList.toggle("selected");
            renderCaptureWithChips();
        };
    });
}

function setupCaptureControls() {
    // Each binding is null-guarded so a missing element in the HTML
    // can no longer abort the entire DOMContentLoaded boot sequence.
    const cam = $safe("#capture-camera",     "setupCaptureControls");
    const lib = $safe("#capture-library",    "setupCaptureControls");
    const ret = $safe("#capture-retake-btn", "setupCaptureControls");
    const post = $safe("#capture-post-btn",  "setupCaptureControls");
    const cap = $safe("#capture-caption",    "setupCaptureControls");
    const cnt = $safe("#capture-caption-count", "setupCaptureControls");

    if (cam)  cam.onchange  = (e) => onCaptureFiles(Array.from(e.target.files || []));
    if (lib)  lib.onchange  = (e) => onCaptureFiles(Array.from(e.target.files || []));
    if (ret)  ret.onclick   = () => renderCapture();
    if (post) post.onclick  = handlePost;
    if (cap)  cap.oninput   = (e) => { if (cnt) cnt.textContent = `${e.target.value.length} / 240`; };

    // "With friends" picker
    const addBtn = $safe("#capture-with-add",    "setupCaptureControls");
    const picker = $safe("#capture-with-picker", "setupCaptureControls");
    const search = $safe("#capture-with-search", "setupCaptureControls");
    const done   = $safe("#capture-with-done",   "setupCaptureControls");
    if (addBtn && picker) {
        addBtn.onclick = () => {
            picker.hidden = false;
            if (search) { search.value = ""; search.focus(); }
            renderCaptureWithResults("");
        };
    }
    if (search) search.oninput = (e) => renderCaptureWithResults(e.target.value);
    if (done && picker) done.onclick = () => { picker.hidden = true; };
}

function onCaptureFiles(files) {
    if (!files.length) return;
    for (const file of files) {
        if (file.size > 12 * 1024 * 1024) {
            showToast(`"${file.name}" is over 12MB and was skipped.`, "error");
            continue;
        }
        if (captureFiles.length >= MAX_CAPTURE_FILES) {
            showToast(`Maximum ${MAX_CAPTURE_FILES} photos.`, "error");
            break;
        }
        captureFiles.push(file);
    }
    if (!captureFiles.length) return;
    renderCapturePreviews();
    $("#capture-picker").hidden = true;
    $("#capture-preview-block").hidden = false;
    // reset input so selecting same files again works
    $("#capture-camera").value = "";
    $("#capture-library").value = "";
}

function renderCapturePreviews() {
    const wrap = $("#capture-previews");
    wrap.innerHTML = "";
    captureFiles.forEach((file, idx) => {
        const div = document.createElement("div");
        div.className = "capture-preview-thumb";
        const img = document.createElement("img");
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(file);
        const btn = document.createElement("button");
        btn.className = "capture-preview-remove";
        btn.type = "button";
        btn.textContent = "×";
        btn.onclick = () => {
            captureFiles.splice(idx, 1);
            if (captureFiles.length === 0) renderCapture();
            else renderCapturePreviews();
        };
        div.appendChild(img);
        div.appendChild(btn);
        wrap.appendChild(div);
    });
    // "+ Add another" tile — lets users stack photos one at a time.
    // This is essential for native webviews (Median.co, older WebView)
    // where the multi-file picker is restricted to a single selection.
    if (captureFiles.length < MAX_CAPTURE_FILES) {
        const addTile = document.createElement("label");
        addTile.className = "capture-preview-thumb capture-preview-add";
        addTile.htmlFor = "capture-library";
        addTile.title = "Add another photo";
        addTile.innerHTML = `<span class="add-plus">+</span><span class="add-label">Add</span>`;
        wrap.appendChild(addTile);
    }
}

async function uploadToCloudinary(file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CONFIG.cloudinary.uploadPreset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`, {
        method: "POST",
        body: fd
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${text}`);
    }
    const data = await res.json();
    return data.secure_url;
}

async function handlePost() {
    if (!captureFiles.length) return;
    const errEl = $("#capture-error");
    errEl.hidden = true;
    $("#capture-preview-block").hidden = true;
    $("#capture-uploading").hidden = false;

    try {
        // Upload all files in parallel
        const images = await Promise.all(captureFiles.map(f => uploadToCloudinary(f)));
        const promptDate = todayKey();
        const onTime = getWindowState().phase === "open";
        const captionRaw = $("#capture-caption").value.trim();
        const hashtags = extractHashtags(captionRaw);

        // If user came from a circle's "Capture for this circle" button,
        // attach the circleId so the post is scoped to that circle's feed.
        const pendingCircleId = sessionStorage.getItem("dropPendingCircle") || null;
        sessionStorage.removeItem("dropPendingCircle");
        let circlePromptText = null;
        if (pendingCircleId) {
            try {
                const cs = await getDoc(doc(db, "circles", pendingCircleId));
                if (cs.exists()) circlePromptText = cs.data().todayPrompt;
            } catch {}
        }

        // "With friends" tags
        const taggedUids = [...captureTagged.keys()];
        const taggedUsernames = [...captureTagged.values()].map(v => v.username || "");

        // Pending song — read directly from the Songs module so the song is
        // written into the post document at creation time (avoids the async
        // post-write patch that could race or fail on missing Firestore index).
        const _pendingSong = window.Songs?.pendingSong || null;

        // Create post (keeps `imageUrl` for backwards compat = first image)
        const postRef = await addDoc(collection(db, "posts"), {
            uid: state.user.uid,
            username: state.profile.username,
            displayName: state.profile.displayName || state.profile.username,
            promptDate,
            promptText: circlePromptText || state.todayPrompt.text,
            imageUrl: images[0],
            images,
            caption: captionRaw,
            hashtags,
            isOnTime: onTime,
            circleId: pendingCircleId,
            taggedUids,
            taggedUsernames,
            ...(_pendingSong ? {
                songId: _pendingSong.id,
                songTitle: _pendingSong.title,
                songArtist: _pendingSong.artist,
                songUrl: _pendingSong.url || ""
            } : {}),
            likes: 0,
            likedBy: [],
            commentsCount: 0,
            viewsCount: 0,
            reactions: {},
            userReactions: {},
            createdAt: serverTimestamp()
        });

        // Notify each tagged friend (Telegram delivery is automatic
        // — the bot listens to this collection)
        for (const uid of taggedUids) {
            try {
                await addDoc(collection(db, "users", uid, "notifications"), {
                    type: "tagged_in_drop",
                    fromUid: state.user.uid,
                    fromUsername: state.profile.username,
                    postId: postRef.id,
                    read: false,
                    createdAt: serverTimestamp()
                });
            } catch (e) { console.warn("tag notif failed:", e); }
        }

        // Streaks count public daily drops only.
        if (!pendingCircleId) await updateUserStreak();

        // Clear the pending song now that it's baked into the post.
        if (_pendingSong && window.Songs) {
            window.Songs.pendingSong = null;
            if (typeof window.Songs.savePending === "function") window.Songs.savePending();
            if (typeof window.Songs.refreshAddPill === "function") window.Songs.refreshAddPill();
        }

        Sounds.postSent();
        showToast("Posted!", "success");
        if (pendingCircleId) { location.hash = `#/circle/${pendingCircleId}`; return; }
        location.hash = "#/feed";
    } catch (err) {
        console.error(err);
        $("#capture-uploading").hidden = true;
        $("#capture-preview-block").hidden = false;
        errEl.textContent = "Upload failed. Check your Cloudinary settings and try again.";
        errEl.hidden = false;
    }
}

/* =============================================================
   HASHTAG UTILITIES
   ============================================================= */

const HASHTAG_RE = /(^|[\s.,;:!?\(\)\[\]])#([a-zA-Z0-9_]{1,30})/g;

function extractHashtags(text) {
    if (!text) return [];
    const tags = new Set();
    let m;
    HASHTAG_RE.lastIndex = 0;
    while ((m = HASHTAG_RE.exec(text)) !== null) {
        tags.add(m[2].toLowerCase());
    }
    return Array.from(tags);
}

function linkifyText(text) {
    if (!text) return "";
    // Escape, then replace #tags with clickable links
    const escaped = escapeHtml(text);
    return escaped.replace(/(^|[\s.,;:!?\(\)\[\]])#([a-zA-Z0-9_]{1,30})/g,
        (_match, pre, tag) => `${pre}<a class="hashtag-link" href="#/hashtag/${encodeURIComponent(tag.toLowerCase())}">#${tag}</a>`);
}

async function updateUserStreak() {
    const userRef = doc(db, "users", state.user.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};

    const today = todayKey();
    const yesterday = yesterdayKey();
    const lastDate = data.lastPostDate;

    let currentStreak = data.currentStreak || 0;
    if (lastDate === today) {
        // already counted
    } else if (lastDate === yesterday) {
        currentStreak += 1;
    } else {
        currentStreak = 1;
    }
    const longestStreak = Math.max(data.longestStreak || 0, currentStreak);

    await updateDoc(userRef, {
        currentStreak,
        longestStreak,
        totalDrops: increment(1),
        lastPostDate: today
    });

    state.profile.currentStreak = currentStreak;
    // Liveliness: confetti + pulse on milestone days
    if (currentStreak !== state.lastStreakShown && isStreakMilestone(currentStreak)) {
        try { celebrateStreak(currentStreak); } catch (e) { console.warn("celebrate:", e); }
    }
    state.lastStreakShown = currentStreak;
    state.profile.longestStreak = longestStreak;
    state.profile.totalDrops = (state.profile.totalDrops || 0) + 1;
    state.profile.lastPostDate = today;
}

/* =============================================================
   PROFILE VIEW
   ============================================================= */

async function renderProfile(usernameOrUid) {
    // The link target may be either the document UID (when we already
    // know it, e.g. from chat threads) or a @username (from post cards,
    // comments, etc.). Resolve to the user doc either way.
    let targetUid;
    let p;
    if (!usernameOrUid || usernameOrUid === state.user.uid) {
        targetUid = state.user.uid;
        const snap = await getDoc(doc(db, "users", targetUid));
        if (snap.exists()) p = snap.data();
    } else {
        // Try as document UID first.
        const snap = await getDoc(doc(db, "users", usernameOrUid));
        if (snap.exists()) {
            targetUid = usernameOrUid;
            p = snap.data();
        } else {
            // Fall back to a username lookup.
            const uname = usernameOrUid.replace(/^@/, "");
            const qs = await getDocs(query(
                collection(db, "users"),
                where("username", "==", uname)
            ));
            if (!qs.empty) {
                targetUid = qs.docs[0].id;
                p = qs.docs[0].data();
            }
        }
    }
    if (!p || !targetUid) {
        showToast("Profile not found.", "error");
        location.hash = "#/";
        return;
    }
    const isOwn = targetUid === state.user.uid;

    $("#profile-display-name").textContent = p.displayName || p.username || "—";
    $("#profile-username").textContent = `@${p.username || "—"}`;
    $("#profile-avatar").textContent = initials(p.displayName || p.username);
    $("#profile-current-streak").textContent = p.currentStreak || 0;
    $("#profile-longest-streak").textContent = p.longestStreak || 0;
    $("#profile-total").textContent = p.totalDrops || 0;
    $("#profile-own-actions").hidden = !isOwn;
    $("#profile-other-actions").hidden = isOwn;

    if (!isOwn) {
        renderProfileFriendButton(targetUid, p.username || "user");
    }

    // Last 30 posts
    const grid = $("#profile-grid");
    // Liveliness: shimmer placeholders while the query resolves
    grid.innerHTML = skeletonFeedHTML(3);
    // limit(30) here avoids downloading every post for busy users.
    // Sort client-side to show the newest 30 without needing a composite index.
    const q = query(
        collection(db, "posts"),
        where("uid", "==", targetUid),
        limit(30)
    );
    const postSnap = await getDocs(q);
    if (postSnap.empty) {
        $("#profile-empty").hidden = false;
    } else {
        $("#profile-empty").hidden = true;
        const sortedDocs = [...postSnap.docs].sort((a, b) => {
            const ta = a.data().createdAt?.toMillis?.() || 0;
            const tb = b.data().createdAt?.toMillis?.() || 0;
            return tb - ta;
        }).slice(0, 30);
        const monthShort = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
        grid.innerHTML = sortedDocs.map(d => {
            const post = d.data();
            const ts = post.createdAt?.toMillis?.() || Date.now();
            const dt = new Date(ts);
            const dateLabel = `${monthShort[dt.getMonth()]} ${dt.getDate()}`;
            const promptText = (post.promptText || "").trim();
            const likes = post.likes || 0;
            const comments = post.commentsCount || 0;
            const stat = likes + comments;
            const imgs = (post.images && post.images.length) ? post.images : [post.imageUrl];
            const isMulti = imgs.length > 1;
            const heart = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9C.7 8.4 2.6 5 6 5c2 0 3.5 1.2 4.5 2.7C11.5 6.2 13 5 15 5c3.4 0 5.3 3.4 3.5 7-2.5 4.5-9.5 9-9.5 9z"/></svg>`;
            const stack = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M21 7v12a2 2 0 0 1-2 2H7"/></svg>`;
            return `
                <div class="profile-thumb" data-post-id="${d.id}">
                    <img src="${escapeHtml(post.imageUrl || imgs[0] || "")}" alt="" loading="lazy" />
                    ${isMulti ? `<span class="profile-thumb-multi">${stack}</span>` : ""}
                    ${stat > 0 ? `<span class="profile-thumb-stats">${heart}<span>${stat}</span></span>` : ""}
                    <div class="profile-thumb-overlay">
                        <div class="profile-thumb-date">${dateLabel}</div>
                        ${promptText ? `<div class="profile-thumb-prompt">${escapeHtml(promptText)}</div>` : ""}
                    </div>
                </div>`;
        }).join("");
        grid.querySelectorAll(".profile-thumb").forEach(t => {
            t.onclick = () => location.hash = `#/post/${t.dataset.postId}`;
        });
    }

    if (isOwn) {
        $("#profile-signout-btn").onclick = handleSignout;
        const recapBtn = $("#profile-recap-btn");
        if (recapBtn) recapBtn.onclick = openWeeklyRecap;
    }
}

/* =============================================================
   SHARE VIEW
   ============================================================= */

async function renderShare(postId) {
    const snap = await getDoc(doc(db, "posts", postId));
    if (!snap.exists()) {
        showToast("Drop not found.", "error");
        location.hash = "#/";
        return;
    }
    const p = snap.data();
    $("#share-card-img").src = p.imageUrl;
    $("#share-card-prompt").textContent = p.promptText || "—";
    $("#share-card-username").textContent = `@${p.username}`;

    $("#share-download-btn").onclick = async () => {
        const card = $("#share-card");
        try {
            const canvas = await html2canvas(card, { useCORS: true, backgroundColor: null, scale: 2 });
            canvas.toBlob((blob) => {
                if (!blob) { showToast("Could not export image.", "error"); return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `drop-${p.promptDate}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                showToast("Image saved.", "success");
            }, "image/png");
        } catch (err) {
            console.error(err);
            showToast("Couldn't generate image.", "error");
        }
    };

    $("#share-copy-btn").onclick = async () => {
        const url = `${location.origin}${location.pathname}#/share/${postId}`;
        try {
            await navigator.clipboard.writeText(url);
            showToast("Link copied.", "success");
        } catch {
            showToast("Could not copy link.", "error");
        }
    };
}

/* =============================================================
   SETTINGS VIEW
   ============================================================= */

function renderSettings() {
    $("#settings-time").value = state.profile?.promptTimeLocal || "19:00";
    // The "notifications" toggle now controls Telegram alerts.
    const pushEl = $("#settings-push");
    if (pushEl) pushEl.checked = !!state.profile?.telegramNotifyEnabled;
    ensureTelegramSettingsUI();
    renderTelegramStatus();
    const sndEl = $("#settings-sounds");
    if (sndEl) sndEl.checked = Sounds.enabled;
    $("#settings-saved").hidden = true;
    // Invite section
    ensureMyInviteCode().then(code => {
        const codeEl = $("#settings-invite-code");
        if (codeEl) codeEl.textContent = code || "DROP-—";
    });
    const stats = $("#settings-invite-stats");
    if (stats) {
        const n = state.profile?.invitedCount || 0;
        stats.textContent = `${n} friend${n === 1 ? "" : "s"} joined with your code.`;
    }
}

function setupSettingsControls() {
    // Sound toggle saves immediately to localStorage (no server round-trip)
    const sndEl = $("#settings-sounds");
    if (sndEl) sndEl.onchange = () => Sounds.set(sndEl.checked);

    // Optional "Connect Telegram" button. If your HTML doesn't have one yet,
    // this is a no-op — users can still toggle the notifications switch
    // and we'll prompt them to connect on the spot.
    const tgBtn = $("#settings-telegram-btn");
    if (tgBtn) {
        tgBtn.onclick = async () => {
            if (state.profile?.telegramChatId) {
                const ok = await confirmDialog(
                    "Disconnect Telegram?",
                    "We'll stop sending you Telegram alerts. You can reconnect any time.",
                    "Disconnect"
                );
                if (!ok) return;
                await disconnectTelegram();
            } else {
                await connectTelegram();
            }
        };
    }

    $("#settings-save-btn").onclick = async () => {
        const newTime = $("#settings-time").value || "19:00";
        const wantOn = $("#settings-push").checked;
        try {
            await updateDoc(doc(db, "users", state.user.uid), {
                promptTimeLocal: newTime,
                telegramNotifyEnabled: wantOn
            });
            state.profile.promptTimeLocal = newTime;
            state.profile.telegramNotifyEnabled = wantOn;

            // If they turned the switch on but never linked Telegram, walk
            // them through it now.
            if (wantOn && !state.profile.telegramChatId) {
                if (!CONFIG.telegram.botUsername) {
                    showToast("Telegram isn't configured yet.", "default");
                } else {
                    showToast("Open Telegram to finish connecting.", "default");
                    await connectTelegram();
                }
            }

            $("#settings-saved").hidden = false;
            setTimeout(() => $("#settings-saved").hidden = true, 1800);
        } catch (err) {
            showToast("Could not save settings.", "error");
        }
    };
    $("#settings-signout-btn").onclick = handleSignout;
    $("#settings-delete-btn").onclick = handleDeleteAccount;
}

// Inject a "Connect Telegram" button + status line into the Settings
// view if the HTML doesn't already include them. This way the user
// doesn't have to edit index.html to get the new UI.
function ensureTelegramSettingsUI() {
    if ($("#settings-telegram-btn")) return; // already present
    const pushEl = $("#settings-push");
    if (!pushEl) return;
    // Walk up to a sensible insertion row (the label row containing the toggle).
    const anchor = pushEl.closest("label, .row, .form-row, .setting-row, li") || pushEl.parentElement;
    if (!anchor) return;

    const wrap = document.createElement("div");
    wrap.id = "settings-telegram-row";
    wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:12px;";
    wrap.innerHTML = `
        <button type="button" id="settings-telegram-btn"
            style="align-self:flex-start;padding:10px 18px;border-radius:999px;
                   border:1.5px solid var(--border-strong, #d6d3d1);
                   background:transparent;color:var(--ink, #0a0a0a);
                   font-weight:600;font-size:14px;cursor:pointer;">
            Connect Telegram
        </button>
        <div id="settings-telegram-status"
            style="font-size:13px;color:var(--muted, #737373);"></div>
    `;
    anchor.parentElement.insertBefore(wrap, anchor.nextSibling);

    // Wire the click handler now (setupSettingsControls runs once at boot
    // and may have already missed this element).
    const tgBtn = $("#settings-telegram-btn");
    if (tgBtn && !tgBtn.dataset.bound) {
        tgBtn.dataset.bound = "1";
        tgBtn.onclick = async () => {
            if (state.profile?.telegramChatId) {
                const ok = await confirmDialog(
                    "Disconnect Telegram?",
                    "We'll stop sending you Telegram alerts. You can reconnect any time.",
                    "Disconnect"
                );
                if (!ok) return;
                await disconnectTelegram();
            } else {
                await connectTelegram();
            }
        };
    }
}

function renderTelegramStatus() {
    const el = $("#settings-telegram-status");
    const btn = $("#settings-telegram-btn");
    const linked = !!state.profile?.telegramChatId;
    if (el) {
        el.textContent = linked
            ? "Telegram connected."
            : (CONFIG.telegram.botUsername
                ? "Not connected — tap to link your Telegram."
                : "Telegram isn't configured yet.");
        el.classList.toggle("is-connected", linked);
    }
    if (btn) {
        btn.textContent = linked ? "Disconnect Telegram" : "Connect Telegram";
        btn.disabled = !CONFIG.telegram.botUsername;
    }
}

/* =============================================================
   TELEGRAM NOTIFICATIONS
   -------------------------------------------------------------
   The web app no longer asks the browser for push permission.
   Instead, every notification we write to Firestore is picked
   up by a small bot script (see /bot/telegram-bot.js) which
   forwards it to the recipient's Telegram chat automatically.

   The web app's only job here is the LINK FLOW: when a user
   taps "Connect Telegram" we generate a one-time code, write
   it to Firestore, and open t.me/<bot>?start=<code>. The bot
   handles the rest.
   ============================================================= */

async function initTelegramFor(uid) {
    if (state.telegramReady) return;
    if (!CONFIG.telegram.botUsername) return;
    try {
        const mod = await import("./telegram.js");
        window.Telegram = mod.Telegram;
        mod.Telegram.configure({
            botUsername: CONFIG.telegram.botUsername,
            db,
            uid
        });
        state.telegramReady = true;
    } catch (err) {
        console.warn("Telegram init failed:", err);
    }
}

async function connectTelegram() {
    if (!state.user) return;
    if (!CONFIG.telegram.botUsername) {
        showToast("Telegram isn't configured yet.", "default");
        return;
    }
    if (!window.Telegram) await initTelegramFor(state.user.uid);
    try {
        const url = await window.Telegram?.connect(state.user.uid);
        if (!url) { showToast("Couldn't start Telegram link.", "error"); return; }
        // Open Telegram. On phones this will deep-link into the app.
        window.open(url, "_blank", "noopener");
        renderTelegramStatus();
    } catch (err) {
        console.warn("connectTelegram:", err);
        showToast("Couldn't open Telegram.", "error");
    }
}

async function disconnectTelegram() {
    if (!state.user) return;
    try {
        if (!window.Telegram) await initTelegramFor(state.user.uid);
        await window.Telegram?.disconnect(state.user.uid);
        state.profile.telegramChatId = null;
        state.profile.telegramNotifyEnabled = false;
        const pushEl = $("#settings-push");
        if (pushEl) pushEl.checked = false;
        renderTelegramStatus();
        showToast("Telegram disconnected.", "success");
    } catch (err) {
        console.warn("disconnectTelegram:", err);
        showToast("Couldn't disconnect Telegram.", "error");
    }
}

/* =============================================================
   SOCIAL — friends, friend requests, search
   ----------------------------------------------------------------
   Data model (no composite indexes needed anywhere):
     users/{uid}/friends/{friendUid}              -> { username, displayName, addedAt }
     users/{uid}/friendRequestsIn/{requesterUid}  -> { username, displayName, requestedAt }
     users/{uid}/friendRequestsOut/{recipientUid} -> { username, displayName, requestedAt }
   ============================================================= */

function startSocialSubscriptions(uid) {
    stopSocialSubscriptions();

    state.friendsUnsub = onSnapshot(
        collection(db, "users", uid, "friends"),
        (snap) => {
            state.friends.clear();
            snap.forEach(d => state.friends.set(d.id, d.data()));
            updateNavBadges();
            renderFriendsList();
            applyFeedRender();
        },
        (err) => console.warn("friends listener:", err)
    );

    state.requestsInUnsub = onSnapshot(
        collection(db, "users", uid, "friendRequestsIn"),
        (snap) => {
            state.requestsIn.clear();
            snap.forEach(d => state.requestsIn.set(d.id, d.data()));
            updateNavBadges();
            renderFriendRequests();
        },
        (err) => console.warn("requestsIn listener:", err)
    );

    state.requestsOutUnsub = onSnapshot(
        collection(db, "users", uid, "friendRequestsOut"),
        (snap) => {
            state.requestsOut.clear();
            snap.forEach(d => state.requestsOut.set(d.id, d.data()));
            renderFriendRequests();
        },
        (err) => console.warn("requestsOut listener:", err)
    );

    let _chatThreadsInit = false;
    let _prevUnreadByThread = new Map();
    state.chatThreadsUnsub = onSnapshot(
        collection(db, "users", uid, "chatThreads"),
        (snap) => {
            // Detect newly arrived messages so we can play a soft chime.
            // Only after the initial load, and not while the user is already
            // in that thread (no point chiming for a message they're reading).
            if (_chatThreadsInit) {
                snap.docs.forEach(d => {
                    const data = d.data();
                    const prev = _prevUnreadByThread.get(d.id) || 0;
                    const curr = data.unreadCount || 0;
                    if (curr > prev && data.otherUid !== state.threadOtherUid) {
                        Sounds.messageIn();
                    }
                });
            }
            state.chatThreads.clear();
            _prevUnreadByThread.clear();
            snap.forEach(d => {
                state.chatThreads.set(d.id, d.data());
                _prevUnreadByThread.set(d.id, d.data().unreadCount || 0);
            });
            _chatThreadsInit = true;
            updateNavBadges();
            renderChatsList();
        },
        (err) => console.warn("chatThreads listener:", err)
    );
}

function stopSocialSubscriptions() {
    [
        "friendsUnsub", "requestsInUnsub", "requestsOutUnsub", "chatThreadsUnsub"
    ].forEach(k => {
        if (state[k]) { state[k](); state[k] = null; }
    });
    state.friends.clear();
    state.requestsIn.clear();
    state.requestsOut.clear();
    state.chatThreads.clear();
}

function updateNavBadges() {
    const reqCount = state.requestsIn.size;
    const reqBadge = $("#nav-friends-badge");
    if (reqBadge) reqBadge.hidden = reqCount === 0;

    const friendsReqBadge = $("#friends-req-badge");
    if (friendsReqBadge) {
        friendsReqBadge.textContent = reqCount;
        friendsReqBadge.hidden = reqCount === 0;
    }

    const friendsCountBadge = $("#friends-count-badge");
    if (friendsCountBadge) {
        friendsCountBadge.textContent = state.friends.size;
        friendsCountBadge.hidden = state.friends.size === 0;
    }

    let unread = 0;
    state.chatThreads.forEach(t => unread += (t.unreadCount || 0));
    const chatsBadge = $("#nav-chats-badge");
    if (chatsBadge) chatsBadge.hidden = unread === 0;
}

async function findUserByUsername(username) {
    const u = (username || "").trim().toLowerCase();
    if (!u) return null;
    const q = query(collection(db, "users"), where("username", "==", u), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { uid: d.id, ...d.data() };
}

async function sendFriendRequest(otherUid, otherProfile) {
    if (otherUid === state.user.uid) {
        showToast("That's you.", "error");
        return;
    }
    if (state.friends.has(otherUid)) {
        showToast("Already friends.", "info");
        return;
    }
    if (state.requestsOut.has(otherUid)) {
        showToast("Request already sent.", "info");
        return;
    }
    if (state.requestsIn.has(otherUid)) {
        // They already requested us — accept directly.
        await acceptFriendRequest(otherUid);
        return;
    }
    const me = state.profile;
    const myProfile = {
        username: me.username,
        displayName: me.displayName || me.username,
        requestedAt: serverTimestamp()
    };
    const theirProfile = {
        username: otherProfile.username,
        displayName: otherProfile.displayName || otherProfile.username,
        requestedAt: serverTimestamp()
    };
    try {
        await Promise.all([
            setDoc(doc(db, "users", otherUid, "friendRequestsIn", state.user.uid), myProfile),
            setDoc(doc(db, "users", state.user.uid, "friendRequestsOut", otherUid), theirProfile)
        ]);
        writeNotification(otherUid, {
            type: "friend_request",
            fromUid: state.user.uid,
            fromUsername: me.username
        });
        showToast("Friend request sent.", "success");
    } catch (err) {
        console.error(err);
        showToast("Couldn't send request.", "error");
    }
}

async function acceptFriendRequest(otherUid) {
    const incoming = state.requestsIn.get(otherUid);
    if (!incoming) return;
    const me = state.profile;
    try {
        await Promise.all([
            setDoc(doc(db, "users", state.user.uid, "friends", otherUid), {
                username: incoming.username,
                displayName: incoming.displayName || incoming.username,
                addedAt: serverTimestamp()
            }),
            setDoc(doc(db, "users", otherUid, "friends", state.user.uid), {
                username: me.username,
                displayName: me.displayName || me.username,
                addedAt: serverTimestamp()
            }),
            deleteDoc(doc(db, "users", state.user.uid, "friendRequestsIn", otherUid)),
            deleteDoc(doc(db, "users", otherUid, "friendRequestsOut", state.user.uid))
        ]);
        writeNotification(otherUid, {
            type: "friend_accept",
            fromUid: state.user.uid,
            fromUsername: me.username
        });
        Sounds.friendAccepted();
        showToast(`You and @${incoming.username} are now friends.`, "success");
    } catch (err) {
        console.error(err);
        showToast("Couldn't accept request.", "error");
    }
}

async function rejectFriendRequest(otherUid) {
    try {
        await Promise.all([
            deleteDoc(doc(db, "users", state.user.uid, "friendRequestsIn", otherUid)),
            deleteDoc(doc(db, "users", otherUid, "friendRequestsOut", state.user.uid))
        ]);
    } catch (err) {
        console.error(err);
        showToast("Couldn't reject.", "error");
    }
}

async function cancelFriendRequest(otherUid) {
    try {
        await Promise.all([
            deleteDoc(doc(db, "users", state.user.uid, "friendRequestsOut", otherUid)),
            deleteDoc(doc(db, "users", otherUid, "friendRequestsIn", state.user.uid))
        ]);
    } catch (err) {
        console.error(err);
        showToast("Couldn't cancel.", "error");
    }
}

async function unfriend(otherUid) {
    const ok = await confirmDialog("Remove friend?", "You'll no longer see each other in your friends feed.", "Remove");
    if (!ok) return;
    try {
        await Promise.all([
            deleteDoc(doc(db, "users", state.user.uid, "friends", otherUid)),
            deleteDoc(doc(db, "users", otherUid, "friends", state.user.uid))
        ]);
        showToast("Removed.", "success");
    } catch (err) {
        console.error(err);
        showToast("Couldn't remove.", "error");
    }
}

/* ----- Friends view rendering ----- */

let activeFriendsTab = "list";

function setFriendsTab(tab) {
    activeFriendsTab = tab;
    $$(".tab-btn[data-friends-tab]").forEach(b => {
        b.classList.toggle("active", b.dataset.friendsTab === tab);
    });
    $("#friends-tab-list").hidden = tab !== "list";
    $("#friends-tab-requests").hidden = tab !== "requests";
    $("#friends-tab-find").hidden = tab !== "find";
    $("#friends-tab-leaderboard").hidden = tab !== "leaderboard";
    $("#friends-tab-circles").hidden = tab !== "circles";
    if (tab === "leaderboard") renderLeaderboard();
    if (tab === "circles") renderCirclesList();
}

function renderFriendsList() {
    const list = $("#friends-list");
    if (!list) return;
    if (state.friends.size === 0) {
        list.innerHTML = "";
        $("#friends-empty").hidden = false;
        return;
    }
    $("#friends-empty").hidden = true;
    const rows = [...state.friends.entries()].sort((a, b) => {
        return (a[1].username || "").localeCompare(b[1].username || "");
    });
    list.innerHTML = rows.map(([uid, f]) => `
        <div class="friend-card" data-uid="${uid}">
            <div class="avatar">${escapeHtml(initials(f.displayName || f.username))}</div>
            <div class="friend-card-meta">
                <p class="friend-card-name">${escapeHtml(f.displayName || f.username)}</p>
                <p class="friend-card-username">@${escapeHtml(f.username || "")}</p>
            </div>
            <div class="friend-card-actions">
                <button class="btn btn-ghost btn-sm" data-act="message">Message</button>
                <button class="btn btn-ghost btn-sm" data-act="profile">View</button>
            </div>
        </div>
    `).join("");

    list.querySelectorAll(".friend-card").forEach(card => {
        const uid = card.dataset.uid;
        card.querySelector('[data-act="message"]').onclick = () => location.hash = `#/thread/${uid}`;
        card.querySelector('[data-act="profile"]').onclick = () => location.hash = `#/profile/${uid}`;
    });
}

function renderFriendRequests() {
    const inEl = $("#friends-requests-in");
    const outEl = $("#friends-requests-out");
    if (!inEl || !outEl) return;

    if (state.requestsIn.size === 0) {
        inEl.innerHTML = "";
        $("#friends-requests-in-empty").hidden = false;
    } else {
        $("#friends-requests-in-empty").hidden = true;
        inEl.innerHTML = [...state.requestsIn.entries()].map(([uid, r]) => `
            <div class="friend-card" data-uid="${uid}">
                <div class="avatar">${escapeHtml(initials(r.displayName || r.username))}</div>
                <div class="friend-card-meta">
                    <p class="friend-card-name">${escapeHtml(r.displayName || r.username)}</p>
                    <p class="friend-card-username">@${escapeHtml(r.username || "")}</p>
                </div>
                <div class="friend-card-actions">
                    <button class="btn btn-primary btn-sm" data-act="accept">Accept</button>
                    <button class="btn btn-ghost btn-sm" data-act="reject">Reject</button>
                </div>
            </div>
        `).join("");
        inEl.querySelectorAll(".friend-card").forEach(c => {
            const uid = c.dataset.uid;
            c.querySelector('[data-act="accept"]').onclick = () => acceptFriendRequest(uid);
            c.querySelector('[data-act="reject"]').onclick = () => rejectFriendRequest(uid);
        });
    }

    if (state.requestsOut.size === 0) {
        outEl.innerHTML = "";
        $("#friends-requests-out-empty").hidden = false;
    } else {
        $("#friends-requests-out-empty").hidden = true;
        outEl.innerHTML = [...state.requestsOut.entries()].map(([uid, r]) => `
            <div class="friend-card" data-uid="${uid}">
                <div class="avatar">${escapeHtml(initials(r.displayName || r.username))}</div>
                <div class="friend-card-meta">
                    <p class="friend-card-name">${escapeHtml(r.displayName || r.username)}</p>
                    <p class="friend-card-username">@${escapeHtml(r.username || "")}</p>
                </div>
                <div class="friend-card-actions">
                    <button class="btn btn-ghost btn-sm" data-act="cancel">Cancel</button>
                </div>
            </div>
        `).join("");
        outEl.querySelectorAll(".friend-card").forEach(c => {
            const uid = c.dataset.uid;
            c.querySelector('[data-act="cancel"]').onclick = () => cancelFriendRequest(uid);
        });
    }
}

async function handleFriendSearch(e) {
    e.preventDefault();
    const input = $("#friends-search-input");
    const result = $("#friends-search-result");
    const status = $("#friends-search-status");
    result.innerHTML = "";
    status.hidden = true;

    const username = input.value.trim().toLowerCase();
    if (!username) return;

    status.hidden = false;
    status.textContent = "Searching…";

    try {
        const found = await findUserByUsername(username);
        if (!found) {
            status.textContent = `No user with @${escapeHtml(username)}.`;
            return;
        }
        if (found.uid === state.user.uid) {
            status.textContent = "That's you.";
            return;
        }
        status.hidden = true;
        const isFriend = state.friends.has(found.uid);
        const isOutgoing = state.requestsOut.has(found.uid);
        const isIncoming = state.requestsIn.has(found.uid);

        let actionHtml = "";
        if (isFriend) actionHtml = `<button class="btn btn-secondary btn-sm" disabled>Friends ✓</button>`;
        else if (isOutgoing) actionHtml = `<button class="btn btn-ghost btn-sm" data-act="cancel">Pending — Cancel</button>`;
        else if (isIncoming) actionHtml = `<button class="btn btn-primary btn-sm" data-act="accept">Accept request</button>`;
        else actionHtml = `<button class="btn btn-primary btn-sm" data-act="add">Add friend</button>`;

        result.innerHTML = `
            <div class="friend-card" data-uid="${found.uid}">
                <div class="avatar">${escapeHtml(initials(found.displayName || found.username))}</div>
                <div class="friend-card-meta">
                    <p class="friend-card-name">${escapeHtml(found.displayName || found.username)}</p>
                    <p class="friend-card-username">@${escapeHtml(found.username || "")}</p>
                </div>
                <div class="friend-card-actions">${actionHtml}</div>
            </div>`;
        const card = result.querySelector(".friend-card");
        const addBtn = card.querySelector('[data-act="add"]');
        const cancelBtn = card.querySelector('[data-act="cancel"]');
        const acceptBtn = card.querySelector('[data-act="accept"]');
        if (addBtn) addBtn.onclick = () => sendFriendRequest(found.uid, found).then(() => handleFriendSearch(e));
        if (cancelBtn) cancelBtn.onclick = () => cancelFriendRequest(found.uid).then(() => handleFriendSearch(e));
        if (acceptBtn) acceptBtn.onclick = () => acceptFriendRequest(found.uid).then(() => handleFriendSearch(e));
    } catch (err) {
        console.error(err);
        status.textContent = "Search failed.";
    }
}

function renderProfileFriendButton(otherUid, otherUsername) {
    const btn = $("#profile-friend-btn");
    const msgBtn = $("#profile-message-btn");

    const isFriend = state.friends.has(otherUid);
    const isOutgoing = state.requestsOut.has(otherUid);
    const isIncoming = state.requestsIn.has(otherUid);

    btn.className = "btn btn-block";
    if (isFriend) {
        btn.textContent = "Friends ✓ — Remove";
        btn.classList.add("btn-ghost");
        btn.onclick = () => unfriend(otherUid);
        msgBtn.hidden = false;
        msgBtn.onclick = () => location.hash = `#/thread/${otherUid}`;
    } else if (isOutgoing) {
        btn.textContent = "Pending — Cancel request";
        btn.classList.add("btn-ghost");
        btn.onclick = () => cancelFriendRequest(otherUid);
        msgBtn.hidden = true;
    } else if (isIncoming) {
        btn.textContent = "Accept friend request";
        btn.classList.add("btn-primary");
        btn.onclick = () => acceptFriendRequest(otherUid);
        msgBtn.hidden = true;
    } else {
        btn.textContent = "Add friend";
        btn.classList.add("btn-primary");
        btn.onclick = async () => {
            const profile = (await getDoc(doc(db, "users", otherUid))).data() || {};
            sendFriendRequest(otherUid, { username: otherUsername, displayName: profile.displayName });
        };
        msgBtn.hidden = true;
    }
}

/* =============================================================
   COMMENTS — subcollection on each post
   ----------------------------------------------------------------
   posts/{postId}/comments/{commentId}
   Single subcollection query, no composite index needed.
   ============================================================= */

function subscribeToComments(postId) {
    if (state.commentsUnsub) state.commentsUnsub();
    state.commentsPostId = postId;
    const list = $("#photo-dialog-comments");
    list.innerHTML = "";

    state.commentsUnsub = onSnapshot(
        collection(db, "posts", postId, "comments"),
        (snap) => {
            const empty = $("#photo-dialog-comments-empty");
            if (snap.empty) {
                empty.hidden = false;
                list.innerHTML = "";
                return;
            }
            empty.hidden = true;
            const sorted = [...snap.docs].sort((a, b) => {
                const ta = a.data().createdAt?.toMillis?.() || 0;
                const tb = b.data().createdAt?.toMillis?.() || 0;
                return ta - tb;
            });
            list.innerHTML = sorted.map(d => {
                const c = d.data();
                return `
                    <div class="comment-item">
                        <span class="comment-author">@${escapeHtml(c.username || "user")}</span>
                        <p class="comment-text">${escapeHtml(c.text || "")}</p>
                    </div>`;
            }).join("");
            list.scrollTop = list.scrollHeight;
        },
        (err) => console.warn("comments listener:", err)
    );
}

async function postComment(postId, text, parentId = null, parentUid = null) {
    try {
        const docPayload = {
            text,
            uid: state.user.uid,
            username: state.profile.username,
            likes: 0,
            likedBy: [],
            createdAt: serverTimestamp()
        };
        if (parentId) docPayload.parentId = parentId;
        await addDoc(collection(db, "posts", postId, "comments"), docPayload);
        // Bump comments count
        try {
            await updateDoc(doc(db, "posts", postId), { commentsCount: increment(1) });
        } catch (e) { /* non-fatal */ }
        // Notify post owner (for top-level comments) or the parent comment author (for replies)
        const psnap = await getDoc(doc(db, "posts", postId));
        const owner = psnap.data()?.uid;
        const thumb = psnap.data()?.imageUrl || "";
        if (parentId && parentUid && parentUid !== state.user.uid) {
            writeNotification(parentUid, {
                type: "reply",
                fromUid: state.user.uid,
                fromUsername: state.profile.username,
                postId,
                postThumb: thumb,
                text
            });
        } else if (!parentId && owner && owner !== state.user.uid) {
            writeNotification(owner, {
                type: "comment",
                fromUid: state.user.uid,
                fromUsername: state.profile.username,
                postId,
                postThumb: thumb,
                text
            });
        }
    } catch (err) {
        console.error(err);
        showToast("Couldn't post comment.", "error");
    }
}

/* =============================================================
   CHAT — 1:1 messages between friends
   ----------------------------------------------------------------
   chats/{chatId}/messages/{messageId}      where chatId = sorted([uidA, uidB]).join("_")
   users/{uid}/chatThreads/{chatId}         inbox: lastMessage, otherUid, updatedAt, unreadCount
   All queries use a single subcollection — no composite indexes.
   ============================================================= */

function chatIdFor(uidA, uidB) {
    return [uidA, uidB].sort().join("_");
}

function renderChatsList() {
    const list = $("#chats-list");
    if (!list) return;
    // Liveliness: shimmer rows while we wait for the threads listener.
    // chatThreadsUnsub is started at login; if the map is still empty AND
    // the listener hasn't fired yet, show skeletons. We track that with
    // a one-shot dataset flag.
    if (state.chatThreads.size === 0) {
        if (!list.dataset.loaded && state.chatThreadsUnsub) {
            list.innerHTML = skeletonRowsHTML(4);
            return;
        }
        list.innerHTML = "";
        $("#chats-empty").hidden = false;
        return;
    }
    list.dataset.loaded = "1";
    $("#chats-empty").hidden = true;
    const rows = [...state.chatThreads.values()].sort((a, b) => {
        const ta = a.updatedAt?.toMillis?.() || 0;
        const tb = b.updatedAt?.toMillis?.() || 0;
        return tb - ta;
    });
    list.innerHTML = rows.map(t => {
        const initial = (t.otherUsername || "?").charAt(0).toUpperCase();
        const time = t.updatedAt?.toMillis ? relativeTime(t.updatedAt.toMillis()) : "";
        const preview = t.lastIsImage
            ? "📷 Photo"
            : (t.lastMessage || "");
        const unread = t.unreadCount > 0 && t.lastSenderUid !== state.user.uid;
        return `
            <div class="chat-row" data-uid="${t.otherUid}">
                <div class="chat-avatar">${escapeHtml(initial)}</div>
                <div class="chat-body">
                    <div class="chat-row-top">
                        <span class="chat-name">@${escapeHtml(t.otherUsername || "user")}</span>
                        <span class="chat-time">${time}</span>
                    </div>
                    <div class="chat-row-bottom">
                        <span class="chat-preview ${unread ? "unread" : ""}">${escapeHtml(preview)}</span>
                        ${unread ? `<span class="chat-unread-pill">${t.unreadCount}</span>` : ""}
                    </div>
                </div>
            </div>
        `;
    }).join("");
    list.querySelectorAll(".chat-row").forEach(row => {
        row.onclick = () => location.hash = `#/thread/${row.dataset.uid}`;
    });
}

async function openThread(otherUid) {
    state.threadOtherUid = otherUid;
    if (state.threadUnsub) { state.threadUnsub(); state.threadUnsub = null; }

    let otherUsername = state.friends.get(otherUid)?.username
        || state.chatThreads.get(chatIdFor(state.user.uid, otherUid))?.otherUsername;
    if (!otherUsername) {
        const snap = await getDoc(doc(db, "users", otherUid));
        otherUsername = snap.data()?.username || "user";
    }
    $("#thread-title").textContent = `@${otherUsername}`;
    $("#thread-avatar").textContent = (otherUsername || "?").charAt(0).toUpperCase();
    $("#thread-subtitle").textContent = "Tap to view profile";
    $("#thread-profile-link").setAttribute("href", `#/profile/${encodeURIComponent(otherUsername)}`);
    document.body.classList.add("in-thread");

    const messagesEl = $("#thread-messages");
    messagesEl.innerHTML = "";

    const cid = chatIdFor(state.user.uid, otherUid);

    // Mark thread as read
    const threadDoc = state.chatThreads.get(cid);
    if (threadDoc && threadDoc.unreadCount > 0) {
        try {
            await updateDoc(doc(db, "users", state.user.uid, "chatThreads", cid), { unreadCount: 0 });
        } catch (e) { /* may not exist yet */ }
    }

    // Incremental thread render: only insert new messages instead of
    // wiping `messagesEl.innerHTML` on every snapshot. This is what causes
    // the perceived full-page flash when sending a message.
    const threadCache = new Map(); // id -> { ts, mine }
    state.threadUnsub = onSnapshot(
        collection(db, "chats", cid, "messages"),
        (snap) => {
            const nearBottom = (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 80;

            // Sort all current docs once to compute consecutive/day-divider context
            const sorted = [...snap.docs].sort((a, b) => {
                const ta = a.data().createdAt?.toMillis?.() || 0;
                const tb = b.data().createdAt?.toMillis?.() || 0;
                return ta - tb;
            });

            // Handle removals
            const liveIds = new Set(sorted.map(d => d.id));
            threadCache.forEach((_, id) => {
                if (!liveIds.has(id)) {
                    const node = messagesEl.querySelector(`[data-msg-id="${id}"]`);
                    if (node) {
                        // Also remove any preceding day-divider that becomes orphaned
                        node.remove();
                    }
                    threadCache.delete(id);
                }
            });

            // Handle additions and in-place text updates
            let prevSender = null;
            let lastDate = "";
            sorted.forEach((d) => {
                const m = d.data();
                const ts = m.createdAt?.toMillis?.() || Date.now();
                const dayLabel = formatDayDivider(ts);
                const needsDivider = dayLabel !== lastDate;
                if (needsDivider) {
                    lastDate = dayLabel;
                    prevSender = null;
                    // Make sure a divider exists immediately before this message
                    const node = messagesEl.querySelector(`[data-msg-id="${d.id}"]`);
                    const expected = `<div class="msg-time-divider" data-divider-for="${d.id}">${dayLabel}</div>`;
                    if (node) {
                        const prev = node.previousElementSibling;
                        if (!prev || !prev.classList.contains("msg-time-divider")) {
                            node.insertAdjacentHTML("beforebegin", expected);
                        }
                    }
                }
                const consecutive = prevSender === m.uid;
                prevSender = m.uid;

                if (!threadCache.has(d.id)) {
                    // INSERT new message
                    const mine = m.uid === state.user.uid;
                    let html = "";
                    if (needsDivider) {
                        html += `<div class="msg-time-divider" data-divider-for="${d.id}">${dayLabel}</div>`;
                    }
                    html += buildMessageRowHTML(d.id, m, mine, consecutive);
                    messagesEl.insertAdjacentHTML("beforeend", html);
                    wireMessageRow(messagesEl.querySelector(`[data-msg-id="${d.id}"]`), m);
                    threadCache.set(d.id, { ts, mine });
                }
            });

            // Only auto-scroll if user was already at the bottom
            if (nearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
        },
        (err) => console.warn("thread listener:", err)
    );

    $("#thread-form").onsubmit = (e) => {
        e.preventDefault();
        const input = $("#thread-input");
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        const replyTo = consumeReplyDraft();
        sendMessage(otherUid, { text, replyTo });
    };
    $("#thread-image-input").onchange = async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        await sendImageMessage(otherUid, file);
    };
    // Reset any leftover reply draft when entering a thread.
    cancelReplyDraft();
    $("#thread-input").focus();
}

/* ----- Message bubble rendering (shared between snapshot + initial) ----- */

function buildMessageRowHTML(id, m, mine, consecutive) {
    // Build the reply quote once — it sits *inside* the bubble (not as its own
    // disconnected mini-bubble) so reply-to-image and reply-to-voice messages
    // look like one cohesive unit instead of two stacked ones.
    let replyQuote = "";
    if (m.replyTo) {
        const r = m.replyTo;
        const author = r.senderUid === state.user.uid ? "You" : `@${r.senderUsername || "user"}`;
        let snippet = r.snippet || "";
        if (r.isImage) snippet = "📷 Photo";
        else if (r.isAudio) snippet = "🎤 Voice note";
        replyQuote = `<div class="msg-reply-quote" data-reply-to-id="${escapeHtml(r.messageId || "")}">
            <span class="rq-name">${escapeHtml(author)}</span>
            <span class="rq-text">${escapeHtml(snippet || "Message")}</span>
          </div>`;
    }

    const hasReplyClass = replyQuote ? " has-reply" : "";
    let inner;
    if (m.imageUrl) {
        inner = `<div class="msg-bubble msg-media-bubble${hasReplyClass}">${replyQuote}<img class="msg-image" src="${escapeHtml(m.imageUrl)}" alt="" /></div>`;
    } else if (m.audioUrl) {
        const dur = m.audioDuration ? formatVoiceDuration(m.audioDuration) : "";
        inner = `<div class="msg-bubble msg-audio${hasReplyClass}">${replyQuote}<audio controls preload="metadata" src="${escapeHtml(m.audioUrl)}"></audio>${dur ? `<span class="msg-audio-dur">${dur}</span>` : ""}</div>`;
    } else {
        inner = `<div class="msg-bubble${hasReplyClass}">${replyQuote}${linkifyText(m.text || "")}</div>`;
    }
    const replyBtn = `<button type="button" class="msg-reply-btn" data-action="reply-to" aria-label="Reply">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
      </button>`;
    return `<div class="msg-row ${mine ? "from-me" : "from-them"} ${consecutive ? "consecutive" : ""}" data-msg-id="${id}">${inner}${replyBtn}</div>`;
}

function formatVoiceDuration(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function wireMessageRow(rowEl, m) {
    if (!rowEl) return;
    const img = rowEl.querySelector(".msg-image");
    if (img) img.onclick = () => window.open(img.src, "_blank");
    const replyBtn = rowEl.querySelector('[data-action="reply-to"]');
    if (replyBtn) {
        replyBtn.onclick = (e) => {
            e.stopPropagation();
            startReplyTo(rowEl.dataset.msgId, m);
        };
    }
    // Tap quoted preview to scroll to original message
    const quote = rowEl.querySelector(".msg-reply-quote");
    if (quote) {
        quote.onclick = (e) => {
            e.stopPropagation();
            const targetId = quote.dataset.replyToId;
            if (!targetId) return;
            const target = document.querySelector(`[data-msg-id="${targetId}"]`);
            if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "center" });
                target.classList.add("show-reply");
                setTimeout(() => target.classList.remove("show-reply"), 1500);
            }
        };
    }
    // Long-press on the row also opens reply (mobile)
    let pressTimer = null;
    rowEl.addEventListener("touchstart", () => {
        pressTimer = setTimeout(() => startReplyTo(rowEl.dataset.msgId, m), 450);
    }, { passive: true });
    rowEl.addEventListener("touchend", () => { if (pressTimer) clearTimeout(pressTimer); });
    rowEl.addEventListener("touchmove", () => { if (pressTimer) clearTimeout(pressTimer); });
}

function renderThreadMessagesHTML(sortedDocs) {
    let html = "";
    let lastDate = "";
    let prevSender = null;
    sortedDocs.forEach((d) => {
        const m = d.data();
        const mine = m.uid === state.user.uid;
        const ts = m.createdAt?.toMillis?.() || Date.now();
        const dayLabel = formatDayDivider(ts);
        if (dayLabel !== lastDate) {
            html += `<div class="msg-time-divider">${dayLabel}</div>`;
            lastDate = dayLabel;
            prevSender = null;
        }
        const consecutive = prevSender === m.uid;
        prevSender = m.uid;
        html += buildMessageRowHTML(d.id, m, mine, consecutive);
    });
    return html;
}

/* ----- Reply draft state (per-thread) ----- */

let replyDraft = null; // { messageId, senderUid, senderUsername, snippet, isImage, isAudio }

function startReplyTo(messageId, m) {
    let senderUsername;
    if (m.uid === state.user.uid) {
        senderUsername = state.profile.username;
    } else {
        senderUsername = state.friends.get(m.uid)?.username
            || state.chatThreads.get(chatIdFor(state.user.uid, state.threadOtherUid))?.otherUsername
            || "user";
    }
    let snippet = (m.text || "").slice(0, 80);
    if (m.imageUrl) snippet = "📷 Photo";
    else if (m.audioUrl) snippet = "🎤 Voice note";
    replyDraft = {
        messageId,
        senderUid: m.uid,
        senderUsername,
        snippet,
        isImage: !!m.imageUrl,
        isAudio: !!m.audioUrl
    };
    const bar = $("#thread-reply-preview");
    if (bar) {
        bar.hidden = false;
        $("#trp-name").textContent = m.uid === state.user.uid ? "You" : `@${senderUsername}`;
        $("#trp-text").textContent = snippet || "Message";
    }
    $("#thread-input")?.focus();
}

function cancelReplyDraft() {
    replyDraft = null;
    const bar = $("#thread-reply-preview");
    if (bar) bar.hidden = true;
}

function consumeReplyDraft() {
    const r = replyDraft;
    cancelReplyDraft();
    return r;
}

function formatDayDivider(ms) {
    const d = new Date(ms);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return "Today";
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function leaveThread() {
    document.body.classList.remove("in-thread");
    if (state.threadUnsub) { state.threadUnsub(); state.threadUnsub = null; }
    state.threadOtherUid = null;
}

async function sendMessage(otherUid, payload) {
    // payload: { text } | { imageUrl } | { audioUrl, audioDuration }
    //         optionally extended with { replyTo: { messageId, senderUid, ... } }
    const me = state.user.uid;
    const cid = chatIdFor(me, otherUid);
    const myUsername = state.profile.username;

    let otherUsername = state.friends.get(otherUid)?.username
        || state.chatThreads.get(cid)?.otherUsername;
    if (!otherUsername) {
        const s = await getDoc(doc(db, "users", otherUid));
        otherUsername = s.data()?.username || "user";
    }

    const now = serverTimestamp();
    const isImage = !!payload.imageUrl;
    const isAudio = !!payload.audioUrl;
    let messageDoc, previewText;
    if (isImage) {
        messageDoc = { imageUrl: payload.imageUrl, uid: me, createdAt: now };
        previewText = "📷 Photo";
    } else if (isAudio) {
        messageDoc = { audioUrl: payload.audioUrl, audioDuration: payload.audioDuration || 0, uid: me, createdAt: now };
        previewText = "🎤 Voice note";
    } else {
        messageDoc = { text: payload.text, uid: me, createdAt: now };
        previewText = payload.text;
    }
    if (payload.replyTo) {
        // Strip undefined fields — Firestore rejects undefined.
        const r = payload.replyTo;
        messageDoc.replyTo = {
            messageId: r.messageId || "",
            senderUid: r.senderUid || "",
            senderUsername: r.senderUsername || "",
            snippet: (r.snippet || "").slice(0, 120),
            isImage: !!r.isImage,
            isAudio: !!r.isAudio
        };
    }

    try {
        await addDoc(collection(db, "chats", cid, "messages"), messageDoc);
        await Promise.all([
            setDoc(doc(db, "users", me, "chatThreads", cid), {
                otherUid, otherUsername,
                lastMessage: previewText, lastIsImage: isImage,
                lastSenderUid: me,
                updatedAt: now, unreadCount: 0
            }, { merge: true }),
            setDoc(doc(db, "users", otherUid, "chatThreads", cid), {
                otherUid: me, otherUsername: myUsername,
                lastMessage: previewText, lastIsImage: isImage,
                lastSenderUid: me,
                updatedAt: now,
                unreadCount: increment(1)
            }, { merge: true })
        ]);
        // Notify recipient
        writeNotification(otherUid, {
            type: "message",
            fromUid: me,
            fromUsername: myUsername,
            text: previewText
        });
    } catch (err) {
        console.error(err);
        showToast("Message failed to send.", "error");
    }
}

async function sendImageMessage(otherUid, file) {
    if (file.size > 12 * 1024 * 1024) {
        showToast("Image is too large (max 12MB).", "error");
        return;
    }
    showToast("Uploading image…");
    try {
        const url = await uploadToCloudinary(file);
        const replyTo = consumeReplyDraft();
        await sendMessage(otherUid, { imageUrl: url, replyTo });
    } catch (err) {
        console.error(err);
        showToast("Image upload failed.", "error");
    }
}

/* =============================================================
   NOTIFICATIONS
   ----------------------------------------------------------------
   users/{uid}/notifications/{id}
   { type, fromUid, fromUsername, postId?, postThumb?, text?, read, createdAt }
   No composite index — single subcollection scan.
   ============================================================= */

async function writeNotification(toUid, payload) {
    if (!toUid || toUid === state.user.uid) return;
    try {
        await addDoc(collection(db, "users", toUid, "notifications"), {
            ...payload,
            read: false,
            createdAt: serverTimestamp()
        });
        // The Telegram bot listens to this collection and forwards
        // every new notification to the recipient automatically.
    } catch (err) {
        console.warn("notification:", err);
    }
}

function subscribeToNotifications(uid) {
    if (state.notificationsUnsub) state.notificationsUnsub();
    state.notificationsUnsub = onSnapshot(
        collection(db, "users", uid, "notifications"),
        (snap) => {
            state.notifications = snap.docs;
            updateNotifBadge();
            if (location.hash === "#/notifications") renderNotifications();
        },
        (err) => console.warn("notifs:", err)
    );
}

function updateNotifBadge() {
    const badge = $("#nav-notif-badge");
    if (!badge) return;
    const unread = state.notifications.filter(d => d.data().read === false).length;
    if (unread > 0) {
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }
}

function renderNotifications() {
    const list = $("#notifications-list");
    const empty = $("#notifications-empty");
    if (!list) return;
    if (state.notifications.length === 0) {
        list.innerHTML = "";
        empty.hidden = false;
        return;
    }
    empty.hidden = true;
    const sorted = [...state.notifications].sort((a, b) => {
        const ta = a.data().createdAt?.toMillis?.() || 0;
        const tb = b.data().createdAt?.toMillis?.() || 0;
        return tb - ta;
    });
    list.innerHTML = sorted.map(d => {
        const n = d.data();
        const initial = (n.fromUsername || "?").charAt(0).toUpperCase();
        const time = n.createdAt?.toMillis ? relativeTime(n.createdAt.toMillis()) : "";
        let actionText = "";
        switch (n.type) {
            case "like":     actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> liked your drop.`; break;
            case "view":     actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> viewed your drop.`; break;
            case "comment":  actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> commented: ${escapeHtml((n.text || "").slice(0, 60))}`; break;
            case "reply":    actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> replied: ${escapeHtml((n.text || "").slice(0, 60))}`; break;
            case "reaction": actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> reacted ${n.emoji || "❤️"} to your drop.`; break;
            case "friend_request": actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> sent you a friend request.`; break;
            case "friend_accept":  actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> accepted your friend request.`; break;
            case "message":  actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong>: ${escapeHtml((n.text || "").slice(0, 60))}`; break;
            case "circle_join": actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> added you to <strong>${escapeHtml(n.circleName || "a circle")}</strong>.`; break;
            case "tagged_in_drop": actionText = `<strong>@${escapeHtml(n.fromUsername)}</strong> tagged you in their drop.`; break;
            default:         actionText = `<strong>@${escapeHtml(n.fromUsername || "Someone")}</strong> did something.`;
        }
        const thumb = n.postThumb ? `<img class="notif-thumb" src="${escapeHtml(n.postThumb)}" alt="" />` : "";
        return `
            <div class="notif-item ${n.read ? "" : "unread"}" data-id="${d.id}" data-type="${n.type}" data-post-id="${n.postId || ""}" data-from-username="${escapeHtml(n.fromUsername || "")}">
                <div class="notif-avatar">${escapeHtml(initial)}</div>
                <div class="notif-body">
                    <p class="notif-text">${actionText}</p>
                    <p class="notif-time">${time}</p>
                </div>
                ${thumb}
            </div>
        `;
    }).join("");

    list.querySelectorAll(".notif-item").forEach(el => {
        el.onclick = async () => {
            const id = el.dataset.id;
            const type = el.dataset.type;
            const postId = el.dataset.postId;
            const fromUsername = el.dataset.fromUsername;
            // Mark read
            try { await updateDoc(doc(db, "users", state.user.uid, "notifications", id), { read: true }); } catch {}
            if (postId && (type === "like" || type === "view" || type === "comment" || type === "reply" || type === "reaction" || type === "tagged_in_drop")) {
                location.hash = `#/post/${postId}`;
            } else if (type === "message") {
                // need otherUid → store fromUid
                const sn = state.notifications.find(d => d.id === id);
                const fromUid = sn?.data()?.fromUid;
                if (fromUid) location.hash = `#/thread/${fromUid}`;
            } else if (type === "friend_request" || type === "friend_accept") {
                location.hash = "#/friends";
            } else if (type === "circle_join") {
                const sn = state.notifications.find(d => d.id === id);
                const cid = sn?.data()?.circleId;
                if (cid) location.hash = `#/circle/${cid}`;
                else location.hash = "#/circles";
            } else if (fromUsername) {
                location.hash = `#/profile/${encodeURIComponent(fromUsername)}`;
            }
        };
    });

    // Auto-mark all as read shortly after view (so badge clears)
    setTimeout(async () => {
        const batch = writeBatch(db);
        let any = false;
        state.notifications.forEach(d => {
            if (d.data().read === false) {
                batch.update(doc(db, "users", state.user.uid, "notifications", d.id), { read: true });
                any = true;
            }
        });
        if (any) try { await batch.commit(); } catch {}
    }, 1500);
}

/* =============================================================
   POST DETAIL PAGE (full page view, not modal)
   ============================================================= */

async function renderPost(postId) {
    const container = $("#post-detail");
    container.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;

    const ref = doc(db, "posts", postId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        container.innerHTML = `<div class="empty-state"><h3>Drop not found</h3><p class="muted">It may have been deleted.</p></div>`;
        return;
    }
    const p = snap.data();

    // Track view (idempotent — first time only). Notify owner.
    recordPostView(postId, p).catch(() => {});

    // Render the full card
    const cardHTML = renderPostCardHTML(postId, p);
    const statsHTML = `
        <div class="post-stats">
            <span><strong>${p.viewsCount || 0}</strong> views</span>
            <span><strong>${p.likes || 0}</strong> likes</span>
            <span><strong>${p.commentsCount || 0}</strong> comments</span>
        </div>`;
    const composerHTML = `
        <form id="post-detail-comment-form" class="post-detail-composer">
            <input id="post-detail-comment-input" type="text" placeholder="Add a comment…" autocomplete="off" maxlength="240" required />
            <button type="submit">Post</button>
        </form>`;
    container.innerHTML = `
        ${cardHTML}
        ${statsHTML}
        <div class="post-detail-comments">
            <h3>Comments</h3>
            <div id="post-detail-comments-list"></div>
            <p id="post-detail-comments-empty" class="muted small" hidden>No comments yet. Be the first.</p>
        </div>
        ${composerHTML}
    `;

    // Wire the post card itself (carousel, like, share, reactions etc.)
    wirePostCards(container);

    // Subscribe to comments live
    subscribeToCommentsForDetail(postId, p.uid);

    $("#post-detail-comment-form").onsubmit = async (e) => {
        e.preventDefault();
        const inp = $("#post-detail-comment-input");
        const text = inp.value.trim();
        if (!text) return;
        inp.value = "";
        await postComment(postId, text, null /* parentId */);
    };
}

async function recordPostView(postId, p) {
    const me = state.user.uid;
    if (!p?.uid || p.uid === me) return;
    const viewRef = doc(db, "posts", postId, "views", me);
    const vs = await getDoc(viewRef);
    if (vs.exists()) return;
    await setDoc(viewRef, { createdAt: serverTimestamp(), username: state.profile.username });
    try { await updateDoc(doc(db, "posts", postId), { viewsCount: increment(1) }); } catch {}
    writeNotification(p.uid, {
        type: "view",
        fromUid: me,
        fromUsername: state.profile.username,
        postId,
        postThumb: p.imageUrl || ""
    });
}

function subscribeToCommentsForDetail(postId, postOwnerUid) {
    if (state.commentsUnsub) state.commentsUnsub();
    // Cleanup previous reply unsubs
    state.repliesUnsubs.forEach(u => u()); state.repliesUnsubs.clear();
    state.commentsPostId = postId;

    state.commentsUnsub = onSnapshot(
        collection(db, "posts", postId, "comments"),
        (snap) => {
            const list = $("#post-detail-comments-list");
            const empty = $("#post-detail-comments-empty");
            if (!list) return;
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const top = all.filter(c => !c.parentId).sort((a, b) => {
                const ta = a.createdAt?.toMillis?.() || 0;
                const tb = b.createdAt?.toMillis?.() || 0;
                return ta - tb;
            });
            const repliesByParent = new Map();
            all.filter(c => c.parentId).forEach(c => {
                if (!repliesByParent.has(c.parentId)) repliesByParent.set(c.parentId, []);
                repliesByParent.get(c.parentId).push(c);
            });
            repliesByParent.forEach(arr => arr.sort((a, b) => {
                const ta = a.createdAt?.toMillis?.() || 0;
                const tb = b.createdAt?.toMillis?.() || 0;
                return ta - tb;
            }));
            if (top.length === 0) {
                list.innerHTML = "";
                empty.hidden = false;
                return;
            }
            empty.hidden = true;
            list.innerHTML = top.map(c => renderDetailCommentHTML(c, repliesByParent.get(c.id) || [])).join("");
            wireDetailComments(list, postId, postOwnerUid);
        },
        (err) => console.warn("comments listener:", err)
    );
}

function renderDetailCommentHTML(c, replies) {
    const initial = (c.username || "?").charAt(0).toUpperCase();
    const time = c.createdAt?.toMillis ? relativeTime(c.createdAt.toMillis()) : "";
    const liked = (c.likedBy || []).includes(state.user.uid);
    const likes = c.likes || 0;
    const isMine = c.uid === state.user.uid;
    const repliesHTML = replies.length
        ? `<div class="detail-replies">${replies.map(r => renderDetailCommentHTML(r, [])).join("")}</div>`
        : "";
    return `
        <div class="detail-comment" data-comment-id="${c.id}" data-comment-uid="${c.uid}" data-comment-username="${escapeHtml(c.username || "")}">
            <div class="detail-comment-avatar" data-username="${escapeHtml(c.username || "")}">${escapeHtml(initial)}</div>
            <div class="detail-comment-body">
                <div>
                    <span class="detail-comment-author" data-username="${escapeHtml(c.username || "")}">@${escapeHtml(c.username || "user")}</span>
                    <span class="detail-comment-time">${time}</span>
                </div>
                <p class="detail-comment-text">${linkifyText(c.text || "")}</p>
                <div class="detail-comment-actions">
                    <button class="like-btn-mini ${liked ? "liked" : ""}" data-action="like-comment">${liked ? "♥" : "♡"} ${likes > 0 ? likes : ""}</button>
                    ${c.parentId ? "" : `<button data-action="reply">Reply</button>`}
                    ${isMine ? `<button data-action="delete-comment">Delete</button>` : ""}
                </div>
                <div class="reply-composer-slot"></div>
                ${repliesHTML}
            </div>
        </div>`;
}

function wireDetailComments(container, postId, postOwnerUid) {
    container.querySelectorAll(".detail-comment").forEach(el => {
        const cid = el.dataset.commentId;
        const cuid = el.dataset.commentUid;
        const cusername = el.dataset.commentUsername;

        el.querySelectorAll("[data-username]").forEach(u => {
            u.onclick = (ev) => {
                ev.stopPropagation();
                const un = u.dataset.username;
                if (un) location.hash = `#/profile/${encodeURIComponent(un)}`;
            };
        });

        const likeBtn = el.querySelector('[data-action="like-comment"]');
        if (likeBtn) likeBtn.onclick = async (ev) => {
            ev.stopPropagation();
            const wasLiked = likeBtn.classList.contains("liked");
            likeBtn.classList.toggle("liked", !wasLiked);
            try {
                await updateDoc(doc(db, "posts", postId, "comments", cid), {
                    likes: increment(wasLiked ? -1 : 1),
                    likedBy: wasLiked ? arrayRemove(state.user.uid) : arrayUnion(state.user.uid)
                });
            } catch (e) {
                likeBtn.classList.toggle("liked", wasLiked);
            }
        };

        const replyBtn = el.querySelector('[data-action="reply"]');
        if (replyBtn) replyBtn.onclick = (ev) => {
            ev.stopPropagation();
            const slot = el.querySelector(".reply-composer-slot");
            if (slot.firstChild) { slot.innerHTML = ""; return; }
            slot.innerHTML = `
                <form class="reply-composer">
                    <input type="text" placeholder="Reply to @${escapeHtml(cusername)}…" required maxlength="240" />
                    <button type="submit">Reply</button>
                </form>`;
            const form = slot.querySelector("form");
            const inp = slot.querySelector("input");
            inp.focus();
            form.onsubmit = async (e) => {
                e.preventDefault();
                const t = inp.value.trim();
                if (!t) return;
                inp.value = "";
                slot.innerHTML = "";
                await postComment(postId, t, cid /* parentId */, cuid /* parentUid */);
            };
        };

        const delBtn = el.querySelector('[data-action="delete-comment"]');
        if (delBtn) delBtn.onclick = async (ev) => {
            ev.stopPropagation();
            try {
                await deleteDoc(doc(db, "posts", postId, "comments", cid));
                await updateDoc(doc(db, "posts", postId), { commentsCount: increment(-1) });
            } catch (e) { showToast("Couldn't delete.", "error"); }
        };
    });
}

/* =============================================================
   HASHTAG VIEW
   ============================================================= */

async function renderHashtag(tag) {
    $("#hashtag-title").textContent = `#${tag}`;
    const grid = $("#hashtag-feed");
    const empty = $("#hashtag-empty");
    grid.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    empty.hidden = true;

    try {
        const q = query(
            collection(db, "posts"),
            where("hashtags", "array-contains", tag.toLowerCase())
        );
        const snap = await getDocs(q);
        if (snap.empty) {
            grid.innerHTML = "";
            empty.hidden = false;
            $("#hashtag-count").textContent = "0 drops";
            return;
        }
        const sorted = [...snap.docs].sort((a, b) => {
            const ta = a.data().createdAt?.toMillis?.() || 0;
            const tb = b.data().createdAt?.toMillis?.() || 0;
            return tb - ta;
        });
        $("#hashtag-count").textContent = `${sorted.length} drop${sorted.length === 1 ? "" : "s"}`;
        grid.innerHTML = sorted.map(d => renderPostCardHTML(d.id, d.data())).join("");
        wirePostCards(grid);
    } catch (err) {
        console.error(err);
        grid.innerHTML = `<div class="empty-state"><p class="muted">Couldn't load this hashtag.</p></div>`;
    }
}

/* =============================================================
   STREAK LEADERBOARD (friends + me)
   ============================================================= */

async function renderLeaderboard() {
    const list = $("#leaderboard-list");
    const empty = $("#leaderboard-empty");
    if (!list) return;
    list.innerHTML = `<p class="muted small center">Loading…</p>`;

    const me = state.user.uid;
    const ids = [me, ...Array.from(state.friends.keys())];
    if (ids.length <= 1 && state.friends.size === 0) {
        list.innerHTML = "";
        empty.hidden = false;
        return;
    }
    empty.hidden = true;

    // Fetch user docs (single-getDoc loop — friends list is small)
    const users = await Promise.all(ids.map(async (uid) => {
        const s = await getDoc(doc(db, "users", uid));
        return s.exists() ? { uid, ...s.data() } : null;
    }));

    // Past 7-day drop counts per user
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const cutoff = todayKey(sevenDaysAgo);
    const dropCounts = await Promise.all(ids.map(async (uid) => {
        try {
            const q = query(
                collection(db, "posts"),
                where("uid", "==", uid),
                where("promptDate", ">=", cutoff)
            );
            const snap = await getDocs(q);
            return snap.size;
        } catch { return 0; }
    }));

    const rows = users
        .filter(Boolean)
        .map((u, i) => ({ ...u, weekDrops: dropCounts[i] }))
        .sort((a, b) => (b.currentStreak || 0) - (a.currentStreak || 0)
                     || (b.weekDrops || 0) - (a.weekDrops || 0));

    list.innerHTML = rows.map((u, i) => {
        const rank = i + 1;
        const isMe = u.uid === me;
        const name = escapeHtml(u.displayName || u.username || "user");
        const handle = escapeHtml(u.username || "—");
        return `
            <a class="lb-row rank-${rank} ${isMe ? "is-me" : ""}" href="#/profile/${encodeURIComponent(u.uid)}" style="text-decoration:none;color:inherit;">
                <div class="lb-rank">${rank}</div>
                <div class="lb-avatar">${escapeHtml(initials(u.displayName || u.username))}</div>
                <div class="lb-info">
                    <div class="lb-name">${name}${isMe ? " <span class='muted small'>(you)</span>" : ""}</div>
                    <div class="lb-sub">@${handle} · ${u.weekDrops} this week</div>
                </div>
                <div class="lb-streak">🔥 ${u.currentStreak || 0}</div>
            </a>
        `;
    }).join("");
}

/* =============================================================
   STORY-STYLE DAILY RECAP (auto-advance through today's drops)
   ============================================================= */

const story = {
    posts: [],
    idx: 0,
    timer: null,
    durationMs: 3000
};

async function openStoryPlayer() {
    if (!state.todayPrompt) await loadTodayPrompt();
    let docs = state.feedDocs && state.feedDocs.length ? [...state.feedDocs] : null;
    if (!docs) {
        try {
            const q = query(
                collection(db, "posts"),
                where("promptDate", "==", todayKey()),
                limit(50)
            );
            const snap = await getDocs(q);
            docs = snap.docs;
        } catch { docs = []; }
    }
    // Sort by createdAt asc so the story is chronological
    docs.sort((a, b) => {
        const ta = a.data().createdAt?.toMillis?.() || 0;
        const tb = b.data().createdAt?.toMillis?.() || 0;
        return ta - tb;
    });
    if (!docs.length) {
        showToast("No drops yet today.");
        return;
    }
    story.posts = docs.map(d => ({ id: d.id, ...d.data() }));
    story.idx = 0;
    $("#story-dialog").hidden = false;
    document.body.style.overflow = "hidden";
    showStoryFrame();
}

function showStoryFrame() {
    const p = story.posts[story.idx];
    if (!p) { closeStory(); return; }
    $("#story-img").src = (p.images?.[0]) || p.imageUrl || "";
    $("#story-username").textContent = `@${p.username || "user"}`;
    $("#story-prompt").textContent = p.promptText || "";
    $("#story-caption").textContent = p.caption || "";
    // Build progress segments
    const prog = $("#story-progress");
    // Inline ALL animation properties on the active fill so every browser
    // (especially iOS Safari) reliably shows the moving white progress line.
    prog.innerHTML = story.posts.map((_, i) => {
        const cls = i < story.idx ? "done" : i === story.idx ? "active" : "";
        const fillStyle = (cls === "active")
            ? ` style="animation-name:storyProgress;animation-duration:${story.durationMs}ms;animation-timing-function:linear;animation-fill-mode:forwards;"`
            : (cls === "done") ? ` style="width:100%"` : "";
        return `<div class="seg ${cls}"><span class="fill"${fillStyle}></span></div>`;
    }).join("");
    if (story.timer) clearTimeout(story.timer);
    story.timer = setTimeout(nextStoryFrame, story.durationMs);
}

function nextStoryFrame() {
    if (story.idx < story.posts.length - 1) {
        story.idx++;
        showStoryFrame();
    } else {
        closeStory();
    }
}

function prevStoryFrame() {
    if (story.idx > 0) {
        story.idx--;
        showStoryFrame();
    }
}

function closeStory() {
    if (story.timer) { clearTimeout(story.timer); story.timer = null; }
    $("#story-dialog").hidden = true;
    document.body.style.overflow = "";
}

/* =============================================================
   WEEKLY HIGHLIGHT REEL (single shareable image)
   ============================================================= */

async function openWeeklyRecap() {
    const dlg = $("#recap-dialog");
    const grid = $("#recap-grid");
    if (!dlg || !grid) return;
    dlg.hidden = false;
    grid.innerHTML = `<p class="muted small center" style="grid-column:1/-1;">Loading…</p>`;

    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const cutoff = todayKey(sevenDaysAgo);

    // Single where() — composite (uid + promptDate) requires a Firestore index
    // we don't ship. Filter and sort client-side, same pattern as renderProfile.
    let posts = [];
    try {
        const q = query(
            collection(db, "posts"),
            where("uid", "==", state.user.uid)
        );
        const snap = await getDocs(q);
        posts = snap.docs
            .map(d => d.data())
            .filter(p => (p.promptDate || "") >= cutoff)
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
            .slice(0, 9);
    } catch (err) {
        console.error("recap query failed:", err);
        grid.innerHTML = `<div class="recap-empty-msg">
            Couldn't load your week. Please try again in a moment.
        </div>`;
        $("#recap-period").textContent = "—";
        $("#recap-username").textContent = `@${state.profile?.username || "you"}`;
        $("#recap-streak").textContent = `🔥 ${state.profile?.currentStreak || 0}`;
        return;
    }

    // If the user hasn't dropped at all this week, show a friendly empty
    // state instead of an all-blank grid (which made the modal look broken).
    if (posts.length === 0) {
        grid.innerHTML = `<div class="recap-empty-msg">
            No drops this week yet.<br/>
            Post a few daily prompts and your recap card will fill up.
        </div>`;
    } else {
        // Always render 9 tiles (fill empties for grid harmony)
        let html = "";
        for (let i = 0; i < 9; i++) {
            const p = posts[i];
            if (p) {
                const url = (p.images?.[0]) || p.imageUrl || "";
                html += `<div class="recap-tile"><img crossorigin="anonymous" src="${escapeHtml(url)}" alt=""/></div>`;
            } else {
                html += `<div class="recap-tile empty"></div>`;
            }
        }
        grid.innerHTML = html;
    }

    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    $("#recap-period").textContent = `${fmt(sevenDaysAgo)} – ${fmt(new Date())}`;
    $("#recap-username").textContent = `@${state.profile?.username || "you"}`;
    $("#recap-streak").textContent = `🔥 ${state.profile?.currentStreak || 0}`;
}

async function saveRecapImage() {
    const card = $("#recap-card");
    if (!card) return;
    try {
        const canvas = await html2canvas(card, { useCORS: true, backgroundColor: null, scale: 2 });
        canvas.toBlob((blob) => {
            if (!blob) { showToast("Could not export image.", "error"); return; }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `drop-recap-${todayKey()}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast("Recap saved.", "success");
        }, "image/png");
    } catch (err) {
        console.error(err);
        showToast("Couldn't generate image.", "error");
    }
}

/* =============================================================
   COMMUNITY-VOTED PROMPTS
   promptSubmissions/{id}: { text, submittedBy, submittedByUsername,
                             votes, voters[], status, createdAt }
   ============================================================= */

let promptsUnsub = null;

async function renderPrompts() {
    const list = $("#prompts-vote-list");
    const empty = $("#prompts-vote-empty");
    if (!list) return;
    list.innerHTML = `<p class="muted small center">Loading…</p>`;
    if (promptsUnsub) { promptsUnsub(); promptsUnsub = null; }

    const q = query(
        collection(db, "promptSubmissions"),
        where("status", "==", "pending"),
        limit(50)
    );
    promptsUnsub = onSnapshot(q, (snap) => {
        if (snap.empty) {
            list.innerHTML = "";
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        const docs = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.votes || 0) - (a.votes || 0));
        const me = state.user.uid;
        list.innerHTML = docs.map(d => {
            const voted = (d.voters || []).includes(me);
            const mine = d.submittedBy === me;
            return `
                <div class="pv-row">
                    <div class="pv-text">
                        ${escapeHtml(d.text)}
                        <div class="pv-by">by @${escapeHtml(d.submittedByUsername || "—")}${mine ? " · you" : ""}</div>
                    </div>
                    <button class="pv-vote-btn ${voted ? "voted" : ""}" data-id="${d.id}" data-voted="${voted ? "1" : "0"}">
                        <span class="arrow">▲</span>
                        <span class="count">${d.votes || 0}</span>
                    </button>
                </div>
            `;
        }).join("");
        list.querySelectorAll(".pv-vote-btn").forEach(btn => {
            btn.onclick = () => togglePromptVote(btn.dataset.id, btn.dataset.voted === "1");
        });
    }, (err) => {
        console.error(err);
        list.innerHTML = `<p class="muted small center">Couldn't load.</p>`;
    });
}

async function submitCommunityPrompt(text) {
    const t = text.trim();
    if (t.length < 6 || t.length > 80) {
        showToast("Keep it between 6 and 80 characters.", "error");
        return;
    }
    try {
        await addDoc(collection(db, "promptSubmissions"), {
            text: t,
            submittedBy: state.user.uid,
            submittedByUsername: state.profile?.username || "user",
            votes: 1,
            voters: [state.user.uid],
            status: "pending",
            createdAt: serverTimestamp()
        });
        showToast("Submitted.", "success");
    } catch (err) {
        console.error(err);
        showToast("Could not submit.", "error");
    }
}

async function togglePromptVote(id, alreadyVoted) {
    const me = state.user.uid;
    try {
        await updateDoc(doc(db, "promptSubmissions", id), {
            votes: increment(alreadyVoted ? -1 : 1),
            voters: alreadyVoted ? arrayRemove(me) : arrayUnion(me)
        });
    } catch (err) {
        console.error(err);
        showToast("Vote failed.", "error");
    }
}

/* =============================================================
   CIRCLES (private group prompts)
   circles/{id}: { name, ownerUid, memberUids[], todayPrompt,
                   todayPromptDate, createdAt }
   posts can carry { circleId } to scope to a circle
   ============================================================= */

let circlesUnsub = null;
let activeCircleId = null;
let activeCircleData = null;
let circleFeedUnsub = null;

function renderCirclesList() {
    const list = $("#circles-list");
    const empty = $("#circles-empty");
    if (!list) return;
    list.innerHTML = `<p class="muted small center">Loading…</p>`;
    if (circlesUnsub) { circlesUnsub(); circlesUnsub = null; }

    const q = query(
        collection(db, "circles"),
        where("memberUids", "array-contains", state.user.uid)
    );
    circlesUnsub = onSnapshot(q, (snap) => {
        if (snap.empty) {
            list.innerHTML = "";
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.innerHTML = rows.map(c => `
            <a class="circle-row" href="#/circle/${encodeURIComponent(c.id)}">
                <div class="circle-icon">${escapeHtml(initials(c.name))}</div>
                <div class="circle-info">
                    <div class="circle-name">${escapeHtml(c.name)}</div>
                    <div class="circle-meta">${(c.memberUids || []).length} members${c.todayPromptDate === todayKey() ? " · prompt set" : ""}</div>
                </div>
            </a>
        `).join("");
    }, (err) => {
        console.error(err);
        list.innerHTML = `<p class="muted small center">Couldn't load circles.</p>`;
    });
}

async function createCircleFromDialog() {
    const name = $("#circle-dialog-name").value.trim();
    const promptText = $("#circle-dialog-prompt").value.trim();
    if (!name) { showToast("Name your circle.", "error"); return; }
    try {
        const ref = await addDoc(collection(db, "circles"), {
            name,
            ownerUid: state.user.uid,
            memberUids: [state.user.uid],
            todayPrompt: promptText || "Show what you're up to right now.",
            todayPromptDate: todayKey(),
            createdAt: serverTimestamp()
        });
        $("#circle-dialog").hidden = true;
        showToast("Circle created.", "success");
        location.hash = `#/circle/${ref.id}`;
    } catch (err) {
        console.error(err);
        showToast("Could not create circle.", "error");
    }
}

async function renderCircleDetail(circleId) {
    activeCircleId = circleId;
    if (circleFeedUnsub) { circleFeedUnsub(); circleFeedUnsub = null; }
    const snap = await getDoc(doc(db, "circles", circleId));
    if (!snap.exists()) {
        showToast("Circle not found.", "error");
        location.hash = "#/friends";
        return;
    }
    activeCircleData = { id: circleId, ...snap.data() };

    $("#circle-detail-name").textContent = activeCircleData.name;
    const promptText = activeCircleData.todayPromptDate === todayKey()
        ? activeCircleData.todayPrompt
        : (activeCircleData.todayPrompt || "No prompt set for today");
    $("#circle-detail-prompt").textContent = promptText;
    $("#circle-detail-meta").textContent = `${(activeCircleData.memberUids || []).length} members · ${activeCircleData.ownerUid === state.user.uid ? "owner" : "member"}`;

    $("#circle-edit-prompt-btn").onclick = async () => {
        const next = prompt("Today's prompt for this circle:", activeCircleData.todayPrompt || "");
        if (!next) return;
        await updateDoc(doc(db, "circles", circleId), {
            todayPrompt: next.trim().slice(0, 80),
            todayPromptDate: todayKey()
        });
        renderCircleDetail(circleId);
    };
    $("#circle-add-member-btn").onclick = () => openAddCircleMember(circleId);
    $("#circle-leave-btn").onclick = async () => {
        const ok = await confirmDialog("Leave this circle?", "You won't see drops in it anymore.", "Leave");
        if (!ok) return;
        await updateDoc(doc(db, "circles", circleId), { memberUids: arrayRemove(state.user.uid) });
        location.hash = "#/friends";
    };
    $("#circle-capture-btn").onclick = () => {
        // Stash the active circle id for the capture flow.
        sessionStorage.setItem("dropPendingCircle", circleId);
        location.hash = "#/capture";
    };

    // Live circle feed for today
    const grid = $("#circle-feed");
    const empty = $("#circle-feed-empty");
    grid.innerHTML = "";
    const fq = query(
        collection(db, "posts"),
        where("circleId", "==", circleId),
        where("promptDate", "==", todayKey())
    );
    circleFeedUnsub = onSnapshot(fq, (snap) => {
        if (snap.empty) { grid.innerHTML = ""; empty.hidden = false; return; }
        empty.hidden = true;
        const docs = [...snap.docs].sort((a, b) =>
            (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
        );
        grid.innerHTML = docs.map(d => renderPostCardHTML(d.id, d.data())).join("");
        wirePostCards(grid);
    });
}

function openAddCircleMember(circleId) {
    const dlg = $("#circle-member-dialog");
    const list = $("#circle-member-list");
    if (!dlg || !list) return;
    if (state.friends.size === 0) {
        showToast("Add some friends first.");
        return;
    }
    const memberSet = new Set(activeCircleData?.memberUids || []);
    list.innerHTML = [...state.friends.entries()].map(([uid, f]) => {
        const inCircle = memberSet.has(uid);
        return `
            <div class="friend-row">
                <div class="friend-avatar">${escapeHtml(initials(f.displayName || f.username))}</div>
                <div class="friend-info">
                    <div class="friend-name">${escapeHtml(f.displayName || f.username || "user")}</div>
                    <div class="friend-sub">@${escapeHtml(f.username || "")}</div>
                </div>
                <button class="btn ${inCircle ? "btn-ghost" : "btn-primary"} btn-sm" data-uid="${uid}" data-in="${inCircle ? "1" : "0"}">
                    ${inCircle ? "Remove" : "Add"}
                </button>
            </div>
        `;
    }).join("");
    list.querySelectorAll("button[data-uid]").forEach(b => {
        b.onclick = async () => {
            const uid = b.dataset.uid;
            const isIn = b.dataset.in === "1";
            await updateDoc(doc(db, "circles", circleId), {
                memberUids: isIn ? arrayRemove(uid) : arrayUnion(uid)
            });
            // Notify the friend that they were added (only on add, not remove)
            if (!isIn) {
                writeNotification(uid, {
                    type: "circle_join",
                    fromUid: state.user.uid,
                    fromUsername: state.profile?.username || "user",
                    circleId,
                    circleName: activeCircleData?.name || "a circle"
                });
            }
            const snap = await getDoc(doc(db, "circles", circleId));
            activeCircleData = { id: circleId, ...snap.data() };
            openAddCircleMember(circleId);
        };
    });
    dlg.hidden = false;
}

/* =============================================================
   VOICE NOTES (chat)
   Records via MediaRecorder, uploads to Cloudinary as video resource
   (Cloudinary's audio-only files use the /video/upload endpoint).
   ============================================================= */

const voice = {
    rec: null, chunks: [], stream: null,
    startedAt: 0, timer: null
};

async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
        showToast("Voice notes aren't supported on this device.", "error");
        return;
    }
    try {
        voice.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
        showToast("Microphone access denied.", "error");
        return;
    }
    voice.chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    voice.rec = new MediaRecorder(voice.stream, mime ? { mimeType: mime } : undefined);
    voice.rec.ondataavailable = (e) => { if (e.data.size > 0) voice.chunks.push(e.data); };
    voice.rec.start();
    voice.startedAt = Date.now();
    $("#thread-form").hidden = true;
    $("#thread-recording-bar").hidden = false;
    if (voice.timer) clearInterval(voice.timer);
    voice.timer = setInterval(() => {
        const secs = Math.floor((Date.now() - voice.startedAt) / 1000);
        const mm = Math.floor(secs / 60);
        const ss = String(secs % 60).padStart(2, "0");
        $("#thread-rec-time").textContent = `${mm}:${ss}`;
        if (secs >= 120) finishVoiceRecording(true); // hard cap 2 min
    }, 250);
}

function cancelVoiceRecording() {
    cleanupVoice();
    $("#thread-recording-bar").hidden = true;
    $("#thread-form").hidden = false;
}

function cleanupVoice() {
    if (voice.timer) { clearInterval(voice.timer); voice.timer = null; }
    try { if (voice.rec && voice.rec.state !== "inactive") voice.rec.stop(); } catch {}
    if (voice.stream) {
        voice.stream.getTracks().forEach(t => t.stop());
        voice.stream = null;
    }
}

async function finishVoiceRecording(autoSend = true) {
    if (!voice.rec) { cancelVoiceRecording(); return; }
    const otherUid = state.threadOtherUid;
    const durationSec = Math.floor((Date.now() - voice.startedAt) / 1000);

    const stopped = new Promise((resolve) => {
        voice.rec.onstop = () => resolve();
    });
    try { voice.rec.stop(); } catch {}
    await stopped;
    if (voice.stream) {
        voice.stream.getTracks().forEach(t => t.stop());
        voice.stream = null;
    }
    if (voice.timer) { clearInterval(voice.timer); voice.timer = null; }

    $("#thread-recording-bar").hidden = true;
    $("#thread-form").hidden = false;

    if (!autoSend || durationSec < 1 || !voice.chunks.length || !otherUid) {
        voice.chunks = []; voice.rec = null;
        return;
    }

    const blob = new Blob(voice.chunks, { type: voice.rec.mimeType || "audio/webm" });
    voice.chunks = []; voice.rec = null;
    showToast("Sending voice note…");
    try {
        const url = await uploadAudioToCloudinary(blob);
        const replyTo = consumeReplyDraft();
        await sendMessage(otherUid, { audioUrl: url, audioDuration: durationSec, replyTo });
    } catch (err) {
        console.error(err);
        showToast("Voice note failed.", "error");
    }
}

async function uploadAudioToCloudinary(blob) {
    const fd = new FormData();
    fd.append("file", blob, `voice-${Date.now()}.webm`);
    fd.append("upload_preset", CONFIG.cloudinary.uploadPreset);
    // Cloudinary serves audio under the "video" resource type.
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/video/upload`, {
        method: "POST", body: fd
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.secure_url;
}

/* =============================================================
   ROUTER
   ============================================================= */

const ROUTES = [
    { hash: "#/login",       view: "view-login",       chrome: false, public: true },
    { hash: "#/signup",      view: "view-signup",      chrome: false, public: true },
    { hash: "#/onboarding",  view: "view-onboarding",  chrome: false, public: false },
    { hash: "#/capture",     view: "view-capture",     chrome: true,  public: false },
    { hash: "#/feed",        view: "view-feed",        chrome: true,  public: false },
    { hash: "#/friends",     view: "view-friends",     chrome: true,  public: false },
    { hash: "#/leaderboard", view: "view-friends",     chrome: true,  public: false },
    { hash: "#/circles",     view: "view-friends",     chrome: true,  public: false },
    { hash: "#/circle/",     view: "view-circle",      chrome: true,  public: false, prefix: true },
    { hash: "#/prompts",     view: "view-prompts",     chrome: true,  public: false },
    { hash: "#/chats",       view: "view-chats",       chrome: true,  public: false },
    { hash: "#/thread/",     view: "view-thread",      chrome: true,  public: false, prefix: true },
    { hash: "#/share/",      view: "view-share",       chrome: true,  public: false, prefix: true },
    { hash: "#/post/",       view: "view-post",        chrome: true,  public: false, prefix: true },
    { hash: "#/hashtag/",    view: "view-hashtag",     chrome: true,  public: false, prefix: true },
    { hash: "#/notifications", view: "view-notifications", chrome: true, public: false },
    { hash: "#/profile",     view: "view-profile",     chrome: true,  public: false, prefix: true },
    { hash: "#/settings",    view: "view-settings",    chrome: true,  public: false },
    { hash: "#/",            view: "view-today",       chrome: true,  public: false }
];

function matchRoute(hash) {
    if (!hash || hash === "#") return ROUTES.find(r => r.hash === "#/");
    for (const r of ROUTES) {
        if (r.prefix && hash.startsWith(r.hash)) return r;
        if (hash === r.hash) return r;
    }
    return null;
}

async function router() {
    const hash = location.hash || "#/";
    const route = matchRoute(hash) || ROUTES.find(r => r.hash === "#/");

    // Auth gate
    if (!route.public && !state.user) {
        location.hash = "#/login";
        return;
    }
    if (route.public && state.user && state.profile?.username) {
        location.hash = "#/";
        return;
    }
    if (route.hash === "#/onboarding" && state.profile?.username) {
        location.hash = "#/";
        return;
    }

    // Show only this view
    $$(".view").forEach(el => el.hidden = el.id !== route.view);

    // Chrome
    document.body.classList.toggle("no-chrome", !route.chrome);
    $("#top-header").hidden = !route.chrome;
    $("#bottom-nav").hidden = !route.chrome;

    // Active nav
    $$(".nav-item").forEach(el => {
        const r = el.dataset.route;
        const active = (r === "today" && route.view === "view-today")
            || (r === "feed" && route.view === "view-feed")
            || (r === "friends" && route.view === "view-friends")
            || (r === "chats" && (route.view === "view-chats" || route.view === "view-thread"))
            || (r === "profile" && route.view === "view-profile");
        el.classList.toggle("active", active);
    });
    // Liveliness: red pulse on Today nav while the prompt is open
    setNavLivePulse();

    // Leave thread cleanup if not viewing it
    if (route.view !== "view-thread") leaveThread();

    // Per-route render
    if (route.view === "view-today") await renderToday();
    else if (route.view === "view-feed") {
        if (!state.todayPrompt) await loadTodayPrompt();
        renderFeed();
    }
    else if (route.view === "view-capture") await renderCapture();
    else if (route.view === "view-profile") {
        const m = hash.match(/^#\/profile\/(.+)$/);
        await renderProfile(m ? decodeURIComponent(m[1]) : null);
    }
    else if (route.view === "view-share") {
        const m = hash.match(/^#\/share\/(.+)$/);
        if (m) await renderShare(decodeURIComponent(m[1]));
    }
    else if (route.view === "view-settings") renderSettings();
    else if (route.view === "view-onboarding") showOnboardingSlide(0);
    else if (route.view === "view-friends") {
        // Honor #/leaderboard and #/circles by switching tab
        let tab = activeFriendsTab;
        if (hash === "#/leaderboard") tab = "leaderboard";
        else if (hash === "#/circles") tab = "circles";
        setFriendsTab(tab);
        renderFriendsList();
        renderFriendRequests();
    }
    else if (route.view === "view-circle") {
        const m = hash.match(/^#\/circle\/(.+)$/);
        if (m) await renderCircleDetail(decodeURIComponent(m[1]));
    }
    else if (route.view === "view-prompts") renderPrompts();
    else if (route.view === "view-chats") renderChatsList();
    else if (route.view === "view-thread") {
        const m = hash.match(/^#\/thread\/(.+)$/);
        if (m) await openThread(decodeURIComponent(m[1]));
    }
    else if (route.view === "view-post") {
        const m = hash.match(/^#\/post\/(.+)$/);
        if (m) await renderPost(decodeURIComponent(m[1]));
    }
    else if (route.view === "view-hashtag") {
        const m = hash.match(/^#\/hashtag\/(.+)$/);
        if (m) await renderHashtag(decodeURIComponent(m[1]));
    }
    else if (route.view === "view-notifications") renderNotifications();

    // Stop feed listener when leaving feed
    if (route.view !== "view-feed" && state.feedUnsub) {
        state.feedUnsub();
        state.feedUnsub = null;
    }
    // Stop countdown when leaving today
    if (route.view !== "view-today" && state.countdownInterval) {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
    }
    // Stop circle feed when leaving a circle
    if (route.view !== "view-circle" && circleFeedUnsub) {
        circleFeedUnsub(); circleFeedUnsub = null;
    }
    // Stop prompts subscription when leaving prompts vote
    if (route.view !== "view-prompts" && promptsUnsub) {
        promptsUnsub(); promptsUnsub = null;
    }
    // Stop circles list subscription when leaving friends view entirely
    if (route.view !== "view-friends" && circlesUnsub) {
        circlesUnsub(); circlesUnsub = null;
    }

    window.scrollTo(0, 0);
}

window.addEventListener("hashchange", router);

/* =============================================================
   GLOBAL EVENT WIRING
   ============================================================= */

document.addEventListener("DOMContentLoaded", () => {
    $("#login-form").addEventListener("submit", handleLogin);
    $("#signup-form").addEventListener("submit", handleSignup);
    $("#forgot-btn").onclick = handleForgot;
    $("#header-settings-btn").onclick = () => location.hash = "#/settings";
    const notifBtn = $("#header-notif-btn");
    if (notifBtn) notifBtn.onclick = () => location.hash = "#/notifications";

    setupOnboardingControls();
    setupCaptureControls();
    setupSettingsControls();
    setupPullToRefresh();

    // Feed tabs (Friends / Everyone)
    $$(".tab-btn[data-feed-tab]").forEach(btn => {
        btn.onclick = () => {
            state.feedTab = btn.dataset.feedTab;
            $$(".tab-btn[data-feed-tab]").forEach(b => {
                b.classList.toggle("active", b.dataset.feedTab === state.feedTab);
            });
            applyFeedRender();
        };
    });

    // Friends sub-tabs (Friends / Requests / Find)
    $$(".tab-btn[data-friends-tab]").forEach(btn => {
        btn.onclick = () => setFriendsTab(btn.dataset.friendsTab);
    });

    // Friend search form
    const searchForm = $("#friends-search-form");
    if (searchForm) searchForm.addEventListener("submit", handleFriendSearch);

    // ----- Today view: open story player -----
    const storyBtn = $("#today-story-btn");
    if (storyBtn) storyBtn.onclick = openStoryPlayer;

    // ----- Story player controls -----
    $("#story-close")?.addEventListener("click", closeStory);
    $("#story-prev")?.addEventListener("click", prevStoryFrame);
    $("#story-next")?.addEventListener("click", nextStoryFrame);

    // ----- Recap dialog controls -----
    $("#recap-close")?.addEventListener("click", () => $("#recap-dialog").hidden = true);
    $("#recap-save-btn")?.addEventListener("click", saveRecapImage);

    // ----- Community prompts: submit form -----
    const promptForm = $("#prompt-submit-form");
    if (promptForm) {
        promptForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const inp = $("#prompt-submit-input");
            const v = inp.value;
            inp.value = "";
            await submitCommunityPrompt(v);
        });
    }

    // ----- Circles: open create dialog -----
    $("#circle-create-btn")?.addEventListener("click", () => {
        $("#circle-dialog-title").textContent = "New circle";
        $("#circle-dialog-name").value = "";
        $("#circle-dialog-prompt").value = "";
        $("#circle-dialog-save").textContent = "Create";
        $("#circle-dialog").hidden = false;
    });
    $("#circle-dialog-cancel")?.addEventListener("click", () => $("#circle-dialog").hidden = true);
    $("#circle-dialog-save")?.addEventListener("click", createCircleFromDialog);
    $("#circle-member-cancel")?.addEventListener("click", () => $("#circle-member-dialog").hidden = true);

    // ----- Settings: invite code copy + share -----
    $("#settings-invite-copy")?.addEventListener("click", async () => {
        const code = $("#settings-invite-code").textContent.trim();
        try { await navigator.clipboard.writeText(code); showToast("Code copied.", "success"); }
        catch { showToast("Could not copy.", "error"); }
    });
    $("#settings-invite-share")?.addEventListener("click", async () => {
        const code = $("#settings-invite-code").textContent.trim();
        const url = `${location.origin}${location.pathname}#/signup?invite=${encodeURIComponent(code)}`;
        const text = `Join me on Drop — one prompt, one photo, once a day. Use my invite ${code} so we both get a streak boost: ${url}`;
        if (navigator.share) {
            try { await navigator.share({ title: "Join me on Drop", text, url }); return; } catch {}
        }
        try { await navigator.clipboard.writeText(text); showToast("Share text copied.", "success"); }
        catch { showToast("Could not share.", "error"); }
    });

    // ----- Signup: pre-fill invite code from URL (?invite= or #/signup?invite=) -----
    const inviteFromHash = (location.hash.match(/[?&]invite=([^&]+)/) || [])[1];
    const inviteFromQuery = (location.search.match(/[?&]invite=([^&]+)/) || [])[1];
    const presetInvite = inviteFromHash || inviteFromQuery;
    if (presetInvite) {
        const inp = $("#signup-invite");
        if (inp) inp.value = decodeURIComponent(presetInvite).toUpperCase();
    }

    // ----- Voice notes: composer mic button -----
    $("#thread-voice-btn")?.addEventListener("click", startVoiceRecording);
    $("#thread-rec-cancel")?.addEventListener("click", cancelVoiceRecording);
    $("#thread-rec-send")?.addEventListener("click", () => finishVoiceRecording(true));

    // ----- Chat replies: cancel pending reply -----
    $("#trp-cancel")?.addEventListener("click", cancelReplyDraft);

    // Run router once for initial page (e.g. opening with #/share/abc directly)
    if (!auth.currentUser) router();

    // ----- Theme switching (light / dark / auto) -----
    initThemeControls();
});

/* =============================================
   THEME (light / dark / auto)
   Persists user choice in localStorage and reacts to system changes.
   The no-flash bootstrap in <head> sets the initial theme before paint.
   ============================================= */
function getThemeMode() {
    return localStorage.getItem("drop-theme") || "auto";
}
function applyTheme(mode) {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;
    document.documentElement.setAttribute("data-theme", resolved);
    const meta = document.getElementById("meta-theme-color")
        || document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b0b0c" : "#fafaf9");
    syncThemeSegUI(mode);
}
function setThemeMode(mode) {
    if (!["light", "dark", "auto"].includes(mode)) mode = "auto";
    localStorage.setItem("drop-theme", mode);
    applyTheme(mode);
}
function syncThemeSegUI(mode) {
    document.querySelectorAll("#settings-theme-seg .seg-btn").forEach(btn => {
        btn.setAttribute("aria-checked", btn.dataset.themeMode === mode ? "true" : "false");
    });
}
function initThemeControls() {
    const mode = getThemeMode();
    applyTheme(mode);

    // Header sun/moon toggle: cycles light <-> dark (skips auto for one-tap feel)
    const headerBtn = document.getElementById("header-theme-btn");
    if (headerBtn && !headerBtn.dataset.bound) {
        headerBtn.dataset.bound = "1";
        headerBtn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
            setThemeMode(current === "dark" ? "light" : "dark");
        });
    }

    // Settings segmented control: light / dark / auto
    document.querySelectorAll("#settings-theme-seg .seg-btn").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => setThemeMode(btn.dataset.themeMode));
    });

    // Follow system changes when in auto mode
    if (window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => { if (getThemeMode() === "auto") applyTheme("auto"); };
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }
}



/* =============================================================
   PUBLIC API — exposed for features.js
   (chat customization, songs on drops, reply drops, streak shields, recap)
   ============================================================= */
window.dropApp = {
    state, db, auth, CONFIG,
    $, $$, escapeHtml, linkifyText, todayKey,
    showToast, sendMessage, uploadToCloudinary, chatIdFor,
    firestore: {
        collection, doc, setDoc, getDoc, updateDoc, deleteDoc,
        query, where, getDocs, addDoc, serverTimestamp, onSnapshot,
        orderBy, limit, arrayUnion, arrayRemove, increment,
        deleteField, writeBatch
    }
};
window.dispatchEvent(new CustomEvent("dropapp:ready"));

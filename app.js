/* ═══════════════════════════════════════════════════
   DRIFT — app.js  (Firebase + Geolocation + Canvas Map)
   ═══════════════════════════════════════════════════
   Replace the firebaseConfig block below with your
   own Firebase project credentials before deploying.
   Replace CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET
   with your Cloudinary values.
   ═══════════════════════════════════════════════════ */

// ─── CONFIGURATION ────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

const CLOUDINARY_CLOUD_NAME   = "YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UPLOAD_PRESET"; // unsigned preset

// ─── FIREBASE INIT ────────────────────────────────
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ─── CONSTANTS ────────────────────────────────────
const ZONE_RADIUS_DEFAULT = 500;     // metres
const LOCATION_INTERVAL   = 15000;  // ms between location updates
const GHOST_EXPIRE_MS     = 86400000; // 24h
const CROWD_THRESHOLD     = 10;     // min users for crowd mode
const CROWD_RADIUS        = 200;    // metres for crowd
const ORB_COLORS = {
  open:    "#f97316",
  chill:   "#06b6d4",
  lost:    "#a855f7",
  bored:   "#eab308",
  curious: "#22c55e",
  observe: "#64748b",
  default: "#7c3aed",
};

// ─── STATE ────────────────────────────────────────
const state = {
  uid:          null,
  user:         null,   // Firestore user doc
  authUser:     null,   // Firebase auth user
  coords:       null,   // { lat, lng }
  nearbyUsers:  [],     // array of user objects within zone
  threads:      [],     // active message threads
  ghosts:       [],     // ghost message threads
  currentThread: null,
  currentProfileCard: null,
  anchorMode:   false,
  currentMood:  null,
  zoneRadius:   ZONE_RADIUS_DEFAULT,
  currentView:  "map",
  unsubscribers: [],
  // Map state
  mapZoom:      1.0,
  mapOffset:    { x: 0, y: 0 },
  mapDragging:  false,
  mapDragStart: { x: 0, y: 0 },
  mapDragOffset:{ x: 0, y: 0 },
  mapAnimFrame: null,
  // Watchers
  geoWatchId:   null,
  locationInterval: null,
};

// ─── UTILS ────────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingTo(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function formatRelativeTime(ts) {
  if (!ts) return "";
  const ms = Date.now() - (ts.toDate ? ts.toDate().getTime() : ts);
  if (ms < 60000)  return "just now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function orbColor(mood) {
  return ORB_COLORS[mood] || ORB_COLORS.default;
}

function nameInitial(name) {
  return (name || "?")[0].toUpperCase();
}

function generateGradientColors(uid) {
  const hue = (parseInt(uid.slice(-4), 16) % 360);
  return `hsl(${hue}, 70%, 55%)`;
}

let toastTimer = null;
function showToast(message, type = "default") {
  const toast = document.getElementById("toast");
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#22c55e"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#ef4444"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#06b6d4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    ghost:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#a78bfa"><path d="M9 10h.01M15 10h.01M12 2a7 7 0 0 1 7 7v8l-2-2-2 2-2-2-2 2-2-2-2 2V9a7 7 0 0 1 7-7z"/></svg>`,
    default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#94949e"><circle cx="12" cy="12" r="10"/></svg>`,
  };
  toast.innerHTML = (icons[type] || icons.default) + `<span>${message}</span>`;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function showView(name) {
  state.currentView = name;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const el = document.getElementById(`view-${name}`);
  if (el) el.classList.add("active");
  // nav
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  if (name === "inbox")   renderInbox();
  if (name === "crowd")   initCrowdView();
  if (name === "profile") renderProfile();
  if (name === "map")     { resizeMapCanvas(); }
}

function togglePw(inputId) {
  const el = document.getElementById(inputId);
  el.type = el.type === "password" ? "text" : "password";
}

// ─── AUTH CANVAS BACKGROUND ───────────────────────
function initAuthCanvas() {
  const canvas = document.getElementById("auth-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();

  for (let i = 0; i < 28; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight * 0.6,
      r: Math.random() * 2.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.15,
      color: Math.random() > 0.6 ? "#7c3aed" : "#06b6d4",
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Radial glow background
    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height * 0.3, 0,
      canvas.width / 2, canvas.height * 0.3, canvas.height * 0.7
    );
    g.addColorStop(0, "rgba(124,58,237,0.12)");
    g.addColorStop(0.5, "rgba(6,182,212,0.05)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2, "0");
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height * 0.6) p.vy *= -1;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── AUTH ─────────────────────────────────────────
function initAuth() {
  // Tab switching
  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`auth-${tab.dataset.tab}`).classList.add("active");
    });
  });

  // Login
  document.getElementById("btn-login").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value.trim();
    const pass  = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    if (!email || !pass) { errEl.textContent = "Please fill in all fields."; return; }
    const btn = document.getElementById("btn-login");
    btn.disabled = true; btn.textContent = "Signing in...";
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
      errEl.textContent = friendlyAuthError(e.code);
      btn.disabled = false; btn.textContent = "Sign In";
    }
  });

  // Register
  document.getElementById("btn-register").addEventListener("click", async () => {
    const name  = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const pass  = document.getElementById("reg-password").value;
    const errEl = document.getElementById("register-error");
    errEl.textContent = "";
    if (!name || !email || !pass) { errEl.textContent = "Please fill in all fields."; return; }
    if (pass.length < 6) { errEl.textContent = "Password must be at least 6 characters."; return; }
    const btn = document.getElementById("btn-register");
    btn.disabled = true; btn.textContent = "Creating...";
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name });
      await createUserDoc(cred.user, name);
    } catch (e) {
      errEl.textContent = friendlyAuthError(e.code);
      btn.disabled = false; btn.textContent = "Create Account";
    }
  });

  // Google
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  ["btn-google-login", "btn-google-register"].forEach(id => {
    document.getElementById(id).addEventListener("click", async () => {
      try {
        const result = await auth.signInWithPopup(googleProvider);
        const isNew = result.additionalUserInfo.isNewUser;
        if (isNew) await createUserDoc(result.user, result.user.displayName);
      } catch (e) {
        const errEl = document.getElementById(
          id.includes("login") ? "login-error" : "register-error"
        );
        errEl.textContent = friendlyAuthError(e.code);
      }
    });
  });

  // Auth state
  auth.onAuthStateChanged(async user => {
    if (user) {
      state.uid = user.uid;
      state.authUser = user;
      await loadUserDoc(user.uid);
      showScreen("app-screen");
      initApp();
    } else {
      cleanupApp();
      showScreen("auth-screen");
    }
  });
}

function friendlyAuthError(code) {
  const map = {
    "auth/user-not-found":       "No account found with this email.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/weak-password":        "Password is too weak.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/popup-closed-by-user": "Sign-in cancelled.",
    "auth/too-many-requests":    "Too many attempts. Please wait and try again.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

async function createUserDoc(firebaseUser, displayName) {
  const ref = db.collection("users").doc(firebaseUser.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      uid:          firebaseUser.uid,
      displayName:  displayName || "Anonymous",
      email:        firebaseUser.email,
      photoURL:     firebaseUser.photoURL || null,
      bio:          "",
      mood:         null,
      anchorMode:   false,
      isVisible:    true,
      showTrail:    true,
      driftScore:   0,
      totalConvos:  0,
      totalGhosts:  0,
      lastSeen:     firebase.firestore.FieldValue.serverTimestamp(),
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      location:     null,
    });
  }
}

async function loadUserDoc(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (snap.exists) {
    state.user = snap.data();
  }
}

// ─── APP INIT ─────────────────────────────────────
function initApp() {
  initNavigation();
  initMapCanvas();
  initGeolocation();
  initMapControls();
  initMoodPicker();
  initAnchorMode();
  initThreadInput();
  initCrowdInput();
  initProfile();
  initSettings();
  subscribeToThreads();
  showView("map");
}

function cleanupApp() {
  state.unsubscribers.forEach(fn => fn());
  state.unsubscribers = [];
  if (state.geoWatchId !== null) {
    navigator.geolocation.clearWatch(state.geoWatchId);
    state.geoWatchId = null;
  }
  clearInterval(state.locationInterval);
  cancelAnimationFrame(state.mapAnimFrame);
}

// ─── NAVIGATION ───────────────────────────────────
function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.view) showView(btn.dataset.view);
    });
  });
}

// ─── GEOLOCATION ──────────────────────────────────
function initGeolocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser", "error");
    return;
  }

  const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 };

  state.geoWatchId = navigator.geolocation.watchPosition(
    onLocationUpdate, onLocationError, options
  );
}

function onLocationUpdate(position) {
  const { latitude: lat, longitude: lng, accuracy } = position.coords;
  const prev = state.coords;
  state.coords = { lat, lng, accuracy };

  // Update Firestore
  if (state.uid) {
    db.collection("users").doc(state.uid).update({
      location:  new firebase.firestore.GeoPoint(lat, lng),
      lastSeen:  firebase.firestore.FieldValue.serverTimestamp(),
      isOnline:  true,
    }).catch(() => {});
  }

  // Update label
  const label = document.getElementById("location-label");
  if (label) label.textContent = `±${Math.round(accuracy)}m accuracy`;

  // Load nearby users
  loadNearbyUsers();

  // Track drift score (new zone = new coordinate cluster)
  if (prev) {
    const dist = haversineDistance(prev.lat, prev.lng, lat, lng);
    if (dist > 200) incrementDriftScore();
  }
}

function onLocationError(err) {
  const msgs = {
    1: "Location access denied. Enable location to use Drift.",
    2: "Location unavailable.",
    3: "Location request timed out.",
  };
  showToast(msgs[err.code] || "Location error", "error");
}

function incrementDriftScore() {
  if (!state.uid) return;
  db.collection("users").doc(state.uid).update({
    driftScore: firebase.firestore.FieldValue.increment(1),
  }).catch(() => {});
}

// ─── NEARBY USERS ─────────────────────────────────
let nearbyUnsubscribe = null;

function loadNearbyUsers() {
  if (!state.coords || !state.uid) return;

  // Listen to users who have been online recently
  if (nearbyUnsubscribe) nearbyUnsubscribe();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 min

  nearbyUnsubscribe = db.collection("users")
    .where("isOnline", "==", true)
    .where("isVisible", "==", true)
    .limit(100)
    .onSnapshot(snap => {
      const nearby = [];
      snap.forEach(doc => {
        const u = doc.data();
        if (u.uid === state.uid) return;
        if (!u.location) return;
        const dist = haversineDistance(
          state.coords.lat, state.coords.lng,
          u.location.latitude, u.location.longitude
        );
        if (dist <= state.zoneRadius) {
          nearby.push({ ...u, distance: Math.round(dist) });
        }
      });

      nearby.sort((a, b) => a.distance - b.distance);
      state.nearbyUsers = nearby;

      updateZoneBadge(nearby.length);
      renderNearbyStrip(nearby);
      checkCrowdMode(nearby);
      checkGhostReactivation();
    }, () => {});

  state.unsubscribers.push(() => { if (nearbyUnsubscribe) nearbyUnsubscribe(); });
}

function updateZoneBadge(count) {
  const el = document.getElementById("zone-count");
  if (el) el.textContent = `${count} nearby`;
}

// ─── MAP CANVAS ───────────────────────────────────
let mapCtx = null;
let mapCanvas = null;

// Per-user trail history
const trailHistory = {};
// Orb pulse phases
const orbPhases = {};
let mapTime = 0;

function initMapCanvas() {
  mapCanvas = document.getElementById("map-canvas");
  mapCtx = mapCanvas.getContext("2d");
  resizeMapCanvas();
  window.addEventListener("resize", resizeMapCanvas);
  startMapLoop();
}

function resizeMapCanvas() {
  if (!mapCanvas) return;
  const wrap = mapCanvas.parentElement;
  mapCanvas.width  = wrap.offsetWidth  * window.devicePixelRatio;
  mapCanvas.height = wrap.offsetHeight * window.devicePixelRatio;
  mapCanvas.style.width  = wrap.offsetWidth  + "px";
  mapCanvas.style.height = wrap.offsetHeight + "px";
  if (mapCtx) mapCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function startMapLoop() {
  function frame() {
    mapTime++;
    drawMap();
    state.mapAnimFrame = requestAnimationFrame(frame);
  }
  state.mapAnimFrame = requestAnimationFrame(frame);
}

function drawMap() {
  if (!mapCtx || !mapCanvas) return;
  const W = mapCanvas.offsetWidth;
  const H = mapCanvas.offsetHeight;
  const cx = W / 2 + state.mapOffset.x;
  const cy = H / 2 + state.mapOffset.y;

  // Pixels per meter at current zoom
  const ppm = (Math.min(W, H) * 0.28 / state.zoneRadius) * state.mapZoom;

  mapCtx.clearRect(0, 0, W, H);

  // ── Background ──
  const bg = mapCtx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
  bg.addColorStop(0,   "rgba(15,12,30,1)");
  bg.addColorStop(0.5, "rgba(10,8,20,1)");
  bg.addColorStop(1,   "rgba(6,6,14,1)");
  mapCtx.fillStyle = bg;
  mapCtx.fillRect(0, 0, W, H);

  // ── Grid lines (faint) ──
  const gridSpacing = 80 * state.mapZoom;
  mapCtx.strokeStyle = "rgba(255,255,255,0.03)";
  mapCtx.lineWidth = 1;
  for (let x = (cx % gridSpacing); x < W; x += gridSpacing) {
    mapCtx.beginPath(); mapCtx.moveTo(x, 0); mapCtx.lineTo(x, H); mapCtx.stroke();
  }
  for (let y = (cy % gridSpacing); y < H; y += gridSpacing) {
    mapCtx.beginPath(); mapCtx.moveTo(0, y); mapCtx.lineTo(W, y); mapCtx.stroke();
  }

  // ── Zone circle ──
  const zoneR = state.zoneRadius * ppm;
  // Outer glow
  const zoneGlow = mapCtx.createRadialGradient(cx, cy, zoneR * 0.85, cx, cy, zoneR * 1.15);
  zoneGlow.addColorStop(0, "rgba(124,58,237,0)");
  zoneGlow.addColorStop(0.5, "rgba(124,58,237,0.06)");
  zoneGlow.addColorStop(1, "rgba(124,58,237,0)");
  mapCtx.fillStyle = zoneGlow;
  mapCtx.beginPath();
  mapCtx.arc(cx, cy, zoneR * 1.15, 0, Math.PI * 2);
  mapCtx.fill();

  // Inner fill
  const zoneFill = mapCtx.createRadialGradient(cx, cy, 0, cx, cy, zoneR);
  zoneFill.addColorStop(0,   "rgba(124,58,237,0.04)");
  zoneFill.addColorStop(0.7, "rgba(124,58,237,0.02)");
  zoneFill.addColorStop(1,   "rgba(124,58,237,0)");
  mapCtx.fillStyle = zoneFill;
  mapCtx.beginPath();
  mapCtx.arc(cx, cy, zoneR, 0, Math.PI * 2);
  mapCtx.fill();

  // Border
  mapCtx.strokeStyle = "rgba(124,58,237,0.25)";
  mapCtx.lineWidth = 1.5;
  mapCtx.setLineDash([6, 4]);
  mapCtx.beginPath();
  mapCtx.arc(cx, cy, zoneR, 0, Math.PI * 2);
  mapCtx.stroke();
  mapCtx.setLineDash([]);

  // ── Pulse rings from center ──
  for (let i = 0; i < 3; i++) {
    const phase = ((mapTime * 0.4 + i * 40) % 120) / 120;
    const r = zoneR * phase;
    const alpha = (1 - phase) * 0.18;
    mapCtx.strokeStyle = `rgba(124,58,237,${alpha})`;
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  // ── Nearby users ──
  state.nearbyUsers.forEach(user => {
    if (!user.location || !state.coords) return;
    const dist  = user.distance;
    const angle = bearingTo(
      state.coords.lat, state.coords.lng,
      user.location.latitude, user.location.longitude
    );
    const rad = angle * Math.PI / 180;
    const ux = cx + Math.sin(rad) * dist * ppm;
    const uy = cy - Math.cos(rad) * dist * ppm;

    // Trail
    if (!trailHistory[user.uid]) trailHistory[user.uid] = [];
    const trail = trailHistory[user.uid];
    trail.push({ x: ux, y: uy });
    if (trail.length > 20) trail.shift();
    if (trail.length > 2) {
      for (let t = 1; t < trail.length; t++) {
        const alpha = (t / trail.length) * 0.25;
        mapCtx.strokeStyle = `rgba(255,255,255,${alpha})`;
        mapCtx.lineWidth = 1.5;
        mapCtx.beginPath();
        mapCtx.moveTo(trail[t - 1].x, trail[t - 1].y);
        mapCtx.lineTo(trail[t].x, trail[t].y);
        mapCtx.stroke();
      }
    }

    const color = orbColor(user.mood);
    if (!orbPhases[user.uid]) orbPhases[user.uid] = Math.random() * Math.PI * 2;
    const phase = orbPhases[user.uid];
    const pulse = Math.sin(mapTime * 0.04 + phase) * 0.12 + 1;

    // Outer glow
    const orbGlow = mapCtx.createRadialGradient(ux, uy, 0, ux, uy, 28 * pulse);
    orbGlow.addColorStop(0, hexToRgba(color, 0.2));
    orbGlow.addColorStop(1, hexToRgba(color, 0));
    mapCtx.fillStyle = orbGlow;
    mapCtx.beginPath();
    mapCtx.arc(ux, uy, 28 * pulse, 0, Math.PI * 2);
    mapCtx.fill();

    // Ring
    mapCtx.strokeStyle = hexToRgba(color, 0.35 + Math.sin(mapTime * 0.04 + phase) * 0.1);
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.arc(ux, uy, 15 * pulse, 0, Math.PI * 2);
    mapCtx.stroke();

    // Orb fill
    const orbFill = mapCtx.createRadialGradient(ux - 2, uy - 2, 0, ux, uy, 11);
    orbFill.addColorStop(0, lightenColor(color, 30));
    orbFill.addColorStop(1, color);
    mapCtx.fillStyle = orbFill;
    mapCtx.beginPath();
    mapCtx.arc(ux, uy, 11, 0, Math.PI * 2);
    mapCtx.fill();

    // Initial letter
    mapCtx.fillStyle = "rgba(255,255,255,0.92)";
    mapCtx.font = "bold 10px Inter, sans-serif";
    mapCtx.textAlign = "center";
    mapCtx.textBaseline = "middle";
    mapCtx.fillText(nameInitial(user.displayName), ux, uy);

    // Distance label
    if (state.mapZoom > 0.8) {
      mapCtx.fillStyle = "rgba(255,255,255,0.4)";
      mapCtx.font = "9px Inter, sans-serif";
      mapCtx.fillText(`${dist}m`, ux, uy + 18);
    }
  });

  // ── You (center orb) ──
  drawSelfOrb(cx, cy);
}

function drawSelfOrb(cx, cy) {
  const color = orbColor(state.user?.mood);

  // Expanding pulse rings
  for (let i = 0; i < 2; i++) {
    const phase = ((mapTime * 0.5 + i * 30) % 60) / 60;
    const r = 16 + phase * 36;
    const alpha = (1 - phase) * 0.35;
    mapCtx.strokeStyle = `rgba(255,255,255,${alpha})`;
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  // Outer ring
  mapCtx.strokeStyle = "rgba(255,255,255,0.5)";
  mapCtx.lineWidth = 1.5;
  mapCtx.beginPath();
  mapCtx.arc(cx, cy, 17, 0, Math.PI * 2);
  mapCtx.stroke();

  // Fill
  const selfFill = mapCtx.createRadialGradient(cx - 2, cy - 2, 0, cx, cy, 14);
  selfFill.addColorStop(0, "#fff");
  selfFill.addColorStop(1, color);
  mapCtx.fillStyle = selfFill;
  mapCtx.beginPath();
  mapCtx.arc(cx, cy, 13, 0, Math.PI * 2);
  mapCtx.fill();

  // Initial
  if (state.user?.displayName) {
    mapCtx.fillStyle = "rgba(0,0,0,0.8)";
    mapCtx.font = "bold 10px Inter, sans-serif";
    mapCtx.textAlign = "center";
    mapCtx.textBaseline = "middle";
    mapCtx.fillText(nameInitial(state.user.displayName), cx, cy);
  }

  // "You" label
  mapCtx.fillStyle = "rgba(255,255,255,0.5)";
  mapCtx.font = "9px Inter, sans-serif";
  mapCtx.textAlign = "center";
  mapCtx.fillText("You", cx, cy + 22);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lightenColor(hex, amount) {
  let r = parseInt(hex.slice(1,3), 16) + amount;
  let g = parseInt(hex.slice(3,5), 16) + amount;
  let b = parseInt(hex.slice(5,7), 16) + amount;
  r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
  return `rgb(${r},${g},${b})`;
}

// ─── MAP CONTROLS ─────────────────────────────────
function initMapControls() {
  if (!mapCanvas) return;

  document.getElementById("zoom-in").addEventListener("click", () => {
    state.mapZoom = Math.min(state.mapZoom * 1.35, 5);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    state.mapZoom = Math.max(state.mapZoom / 1.35, 0.3);
  });

  // Touch pinch zoom
  let lastTouchDist = null;
  mapCanvas.addEventListener("touchstart", e => {
    if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else if (e.touches.length === 1) {
      state.mapDragging = true;
      state.mapDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      state.mapDragOffset = { ...state.mapOffset };
    }
  }, { passive: true });

  mapCanvas.addEventListener("touchmove", e => {
    if (e.touches.length === 2 && lastTouchDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / lastTouchDist;
      state.mapZoom = Math.max(0.3, Math.min(5, state.mapZoom * delta));
      lastTouchDist = dist;
    } else if (e.touches.length === 1 && state.mapDragging) {
      const dx = e.touches[0].clientX - state.mapDragStart.x;
      const dy = e.touches[0].clientY - state.mapDragStart.y;
      state.mapOffset = {
        x: state.mapDragOffset.x + dx,
        y: state.mapDragOffset.y + dy,
      };
    }
  }, { passive: true });

  mapCanvas.addEventListener("touchend", e => {
    if (e.touches.length < 2) lastTouchDist = null;
    if (e.touches.length === 0) state.mapDragging = false;
  });

  // Mouse drag
  mapCanvas.addEventListener("mousedown", e => {
    state.mapDragging = true;
    state.mapDragStart = { x: e.clientX, y: e.clientY };
    state.mapDragOffset = { ...state.mapOffset };
  });
  mapCanvas.addEventListener("mousemove", e => {
    if (!state.mapDragging) return;
    state.mapOffset = {
      x: state.mapDragOffset.x + (e.clientX - state.mapDragStart.x),
      y: state.mapDragOffset.y + (e.clientY - state.mapDragStart.y),
    };
  });
  mapCanvas.addEventListener("mouseup", () => { state.mapDragging = false; });
  mapCanvas.addEventListener("mouseleave", () => { state.mapDragging = false; });

  // Mouse wheel zoom
  mapCanvas.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    state.mapZoom = Math.max(0.3, Math.min(5, state.mapZoom * factor));
  }, { passive: false });

  // Tap orb to open profile card
  mapCanvas.addEventListener("click", e => {
    if (Math.abs(state.mapOffset.x - state.mapDragOffset.x) > 5 ||
        Math.abs(state.mapOffset.y - state.mapDragOffset.y) > 5) return;
    const rect = mapCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);
    checkOrbTap(mx, my);
  });

  mapCanvas.addEventListener("touchend", e => {
    if (e.changedTouches.length !== 1 || state.nearbyUsers.length === 0) return;
    const rect = mapCanvas.getBoundingClientRect();
    const mx = e.changedTouches[0].clientX - rect.left;
    const my = e.changedTouches[0].clientY - rect.top;
    checkOrbTap(mx, my);
  });
}

function checkOrbTap(mx, my) {
  if (!state.coords) return;
  const W = mapCanvas.offsetWidth;
  const H = mapCanvas.offsetHeight;
  const cx = W / 2 + state.mapOffset.x;
  const cy = H / 2 + state.mapOffset.y;
  const ppm = (Math.min(W, H) * 0.28 / state.zoneRadius) * state.mapZoom;

  for (const user of state.nearbyUsers) {
    if (!user.location) continue;
    const angle = bearingTo(
      state.coords.lat, state.coords.lng,
      user.location.latitude, user.location.longitude
    );
    const rad = angle * Math.PI / 180;
    const ux = cx + Math.sin(rad) * user.distance * ppm;
    const uy = cy - Math.cos(rad) * user.distance * ppm;
    if (Math.hypot(mx - ux, my - uy) < 22) {
      openProfileCard(user);
      return;
    }
  }
}

// ─── NEARBY STRIP ─────────────────────────────────
function renderNearbyStrip(users) {
  const container = document.getElementById("nearby-strip-inner");
  if (!container) return;
  container.innerHTML = "";
  if (users.length === 0) return;

  users.slice(0, 12).forEach(user => {
    const color = orbColor(user.mood);
    const chip = document.createElement("div");
    chip.className = "nearby-chip";
    chip.innerHTML = `
      <div class="nearby-chip-orb" style="background:${color}">
        ${nameInitial(user.displayName)}
      </div>
      <div class="nearby-chip-info">
        <span class="nearby-chip-name">${user.displayName}</span>
        <span class="nearby-chip-dist">${user.distance}m away</span>
      </div>`;
    chip.addEventListener("click", () => openProfileCard(user));
    container.appendChild(chip);
  });
}

// ─── MOOD PICKER ──────────────────────────────────
function initMoodPicker() {
  const btn    = document.getElementById("btn-mood");
  const picker = document.getElementById("mood-picker");

  btn.addEventListener("click", () => {
    picker.classList.toggle("hidden");
  });

  document.querySelectorAll(".mood-btn").forEach(b => {
    b.addEventListener("click", () => {
      const mood = b.dataset.mood;
      setMood(mood);
      picker.classList.add("hidden");
      document.querySelectorAll(".mood-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
    });
  });

  document.getElementById("mood-clear").addEventListener("click", () => {
    setMood(null);
    document.querySelectorAll(".mood-btn").forEach(x => x.classList.remove("active"));
    picker.classList.add("hidden");
  });
}

function setMood(mood) {
  state.currentMood = mood;
  if (state.user) state.user.mood = mood;
  if (state.uid) {
    db.collection("users").doc(state.uid).update({ mood }).catch(() => {});
  }
  const display = document.getElementById("profile-mood-display");
  if (display) {
    const labels = { open:"🔥 Open", chill:"💙 Chill", lost:"🌀 Lost",
                     bored:"😑 Bored", curious:"🔍 Curious", observe:"🌙 Observing" };
    display.textContent = mood ? labels[mood] || mood : "No mood set";
    if (mood) display.style.color = orbColor(mood);
  }
  if (mood) showToast(`Vibe set to ${mood}`, "success");
  else      showToast("Mood cleared", "info");
}

// ─── ANCHOR MODE ──────────────────────────────────
function initAnchorMode() {
  document.getElementById("btn-anchor").addEventListener("click", () => {
    if (state.anchorMode) disableAnchor();
    else                  enableAnchor();
  });
}

function enableAnchor() {
  state.anchorMode = true;
  document.getElementById("anchor-banner").classList.remove("hidden");
  document.getElementById("btn-anchor").classList.add("active");
  if (state.uid) {
    db.collection("users").doc(state.uid).update({ anchorMode: true }).catch(() => {});
  }
  showToast("Anchor mode active", "success");
}

function disableAnchor() {
  state.anchorMode = false;
  document.getElementById("anchor-banner").classList.add("hidden");
  document.getElementById("btn-anchor").classList.remove("active");
  if (state.uid) {
    db.collection("users").doc(state.uid).update({ anchorMode: false }).catch(() => {});
  }
}

// ─── CROWD MODE ───────────────────────────────────
function checkCrowdMode(users) {
  const nearby200 = users.filter(u => u.distance <= CROWD_RADIUS).length;
  const badge = document.getElementById("crowd-count-badge");
  if (badge) badge.textContent = `${nearby200 + 1} here`;
  const btnCrowd = document.getElementById("btn-crowd");
  if (btnCrowd) btnCrowd.classList.toggle("active", nearby200 >= CROWD_THRESHOLD);
}

let crowdUnsubscribe = null;

function initCrowdView() {
  document.getElementById("btn-crowd").addEventListener("click", () => showView("crowd"));
  if (!state.coords) return;
  const statusEl = document.getElementById("crowd-status-text");
  const nearby200 = state.nearbyUsers.filter(u => u.distance <= CROWD_RADIUS).length;
  const total = nearby200 + 1;
  const badge = document.getElementById("crowd-count-badge");
  if (badge) badge.textContent = `${total} here`;

  if (total < CROWD_THRESHOLD) {
    if (statusEl) statusEl.textContent = `${total} / ${CROWD_THRESHOLD} needed to unlock Crowd Mode`;
    return;
  }
  if (statusEl) statusEl.textContent = `${total} people are here with you`;
  subscribeCrowdMessages();
}

function subscribeCrowdMessages() {
  if (crowdUnsubscribe) crowdUnsubscribe();
  if (!state.coords) return;

  // Use geohash prefix as crowd room ID (simplified: lat/lng grid cell)
  const roomId = crowdRoomId(state.coords.lat, state.coords.lng);
  const el = document.getElementById("crowd-messages");
  if (!el) return;
  el.innerHTML = "";

  crowdUnsubscribe = db.collection("crowdRooms").doc(roomId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(80)
    .onSnapshot(snap => {
      const msgs = [];
      snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      renderCrowdMessages(msgs);
    });
  state.unsubscribers.push(() => { if (crowdUnsubscribe) crowdUnsubscribe(); });
}

function crowdRoomId(lat, lng) {
  const la = (Math.floor(lat * 50) / 50).toFixed(2).replace(".", "_").replace("-", "n");
  const lo = (Math.floor(lng * 50) / 50).toFixed(2).replace(".", "_").replace("-", "n");
  return `${la}__${lo}`;
}

function renderCrowdMessages(msgs) {
  const el = document.getElementById("crowd-messages");
  if (!el) return;
  if (msgs.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
      <p>Crowd channel is quiet</p><span>Be the first to say something</span></div>`;
    return;
  }
  el.innerHTML = "";
  msgs.forEach(msg => {
    const mine = msg.uid === state.uid;
    const color = orbColor(msg.mood);
    const div = document.createElement("div");
    div.className = `crowd-msg${mine ? " mine" : ""}`;
    div.innerHTML = `
      <div class="crowd-msg-orb" style="background:${color}">${nameInitial(msg.displayName)}</div>
      <div class="crowd-msg-body">
        ${!mine ? `<div class="crowd-msg-name">${msg.displayName}</div>` : ""}
        <div class="crowd-msg-text">${escapeHtml(msg.text)}</div>
      </div>`;
    el.appendChild(div);
  });
  el.scrollTop = el.scrollHeight;
}

function initCrowdInput() {
  const btn = document.getElementById("btn-crowd-send");
  const inp = document.getElementById("crowd-input");
  if (!btn || !inp) return;

  const send = async () => {
    const text = inp.value.trim();
    if (!text || !state.coords || !state.uid) return;
    const roomId = crowdRoomId(state.coords.lat, state.coords.lng);
    inp.value = "";
    await db.collection("crowdRooms").doc(roomId).collection("messages").add({
      uid:         state.uid,
      displayName: state.user?.displayName || "Anonymous",
      mood:        state.user?.mood || null,
      text,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("crowdRooms").doc(roomId).set({
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      location: new firebase.firestore.GeoPoint(state.coords.lat, state.coords.lng),
    }, { merge: true });
  };

  btn.addEventListener("click", send);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
}

// ─── PROFILE CARD ─────────────────────────────────
function openProfileCard(user) {
  state.currentProfileCard = user;
  const color = orbColor(user.mood);
  const moodLabels = { open:"Open", chill:"Chill", lost:"Lost",
                       bored:"Bored", curious:"Curious", observe:"Observing" };

  const orbEl = document.getElementById("pc-orb");
  orbEl.style.background = color;
  orbEl.textContent = nameInitial(user.displayName);

  document.getElementById("pc-name").textContent   = user.displayName;
  document.getElementById("pc-bio").textContent    = user.bio || "No bio yet";
  document.getElementById("pc-distance").textContent = `${user.distance}m away`;
  document.getElementById("pc-mood-label").textContent = user.mood ? moodLabels[user.mood] : "No mood";

  const joined = user.lastSeen?.toDate ? user.lastSeen.toDate() : new Date();
  document.getElementById("pc-time-in-zone").textContent = "in zone";

  document.getElementById("btn-pc-message").onclick = () => {
    closeProfileCard();
    openThread(user);
  };

  document.getElementById("modal-profile-card").classList.remove("hidden");
  document.getElementById("modal-profile-card").classList.add("open");
}

function closeProfileCard() {
  document.getElementById("modal-profile-card").classList.add("hidden");
  document.getElementById("modal-profile-card").classList.remove("open");
  state.currentProfileCard = null;
}

// ─── MESSAGING THREADS ────────────────────────────
function subscribeToThreads() {
  if (!state.uid) return;
  const unsub = db.collection("threads")
    .where("participants", "array-contains", state.uid)
    .orderBy("updatedAt", "desc")
    .limit(40)
    .onSnapshot(snap => {
      const threads = [];
      const ghosts  = [];
      snap.forEach(doc => {
        const t = { id: doc.id, ...doc.data() };
        if (t.isGhost) ghosts.push(t);
        else           threads.push(t);
      });
      state.threads = threads;
      state.ghosts  = ghosts;
      updateInboxBadge();
      if (state.currentView === "inbox") renderInbox();
    }, () => {});
  state.unsubscribers.push(unsub);
}

function updateInboxBadge() {
  const unread = state.threads.reduce((acc, t) => {
    return acc + ((t.unreadCounts?.[state.uid] || 0) > 0 ? 1 : 0);
  }, 0);
  const badge = document.getElementById("inbox-badge");
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

async function openThread(user) {
  // Get or create thread
  const ids = [state.uid, user.uid].sort();
  const threadId = ids.join("__");
  const ref = db.collection("threads").doc(threadId);

  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      id:           threadId,
      participants: ids,
      participantData: {
        [state.uid]: { displayName: state.user?.displayName, mood: state.user?.mood || null },
        [user.uid]:  { displayName: user.displayName, mood: user.mood || null },
      },
      isGhost:      false,
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage:  null,
      unreadCounts: { [state.uid]: 0, [user.uid]: 0 },
    });
    // Increment convos stat
    db.collection("users").doc(state.uid).update({
      totalConvos: firebase.firestore.FieldValue.increment(1),
    }).catch(() => {});
  }

  state.currentThread = { id: threadId, otherUser: user };
  renderThreadModal(user, threadId);
}

function renderThreadModal(user, threadId) {
  const color = orbColor(user.mood);
  const orbEl = document.getElementById("thread-orb");
  orbEl.style.background = color;
  orbEl.textContent = nameInitial(user.displayName);
  document.getElementById("thread-user-name").textContent = user.displayName;

  const statusEl = document.getElementById("thread-status");
  const isNearby = state.nearbyUsers.some(u => u.uid === user.uid);
  statusEl.textContent = isNearby ? "in zone" : "left zone";
  statusEl.className = "thread-status" + (isNearby ? "" : " ghost");

  const ghostNote = document.getElementById("thread-ghost-note");
  ghostNote.classList.toggle("hidden", isNearby);
  document.getElementById("thread-input-bar").style.opacity = isNearby ? "1" : "0.5";
  document.getElementById("thread-input").disabled = !isNearby;

  // Subscribe to messages
  const msgsEl = document.getElementById("thread-messages");
  msgsEl.innerHTML = "";
  if (!isNearby) msgsEl.appendChild(ghostNote.cloneNode(true));

  const unsub = db.collection("threads").doc(threadId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(100)
    .onSnapshot(snap => {
      const msgs = [];
      snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      renderMessages(msgs, msgsEl, isNearby);
    });

  // Reset unread
  db.collection("threads").doc(threadId).update({
    [`unreadCounts.${state.uid}`]: 0,
  }).catch(() => {});

  const modal = document.getElementById("modal-thread");
  modal.classList.remove("hidden");
  modal.classList.add("open");

  // Store unsub to clean on close
  modal._msgUnsub = unsub;
}

function renderMessages(msgs, container, isInZone) {
  const scrolledToBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 60;

  // Keep ghost note if present
  const note = container.querySelector(".thread-ghost-note");
  container.innerHTML = "";
  if (note) container.appendChild(note);

  msgs.forEach(msg => {
    const mine = msg.senderUid === state.uid;
    const div = document.createElement("div");
    div.className = `msg-bubble ${mine ? "mine" : "theirs"}${!isInZone ? " ghost-msg" : ""}`;
    const time = msg.createdAt?.toDate ? formatRelativeTime(msg.createdAt) : "";
    div.innerHTML = `
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <span class="msg-time">${time}</span>`;
    container.appendChild(div);
  });

  if (scrolledToBottom) container.scrollTop = container.scrollHeight;
}

function initThreadInput() {
  const btn = document.getElementById("btn-thread-send");
  const inp = document.getElementById("thread-input");
  if (!btn || !inp) return;

  const send = async () => {
    const text = inp.value.trim();
    if (!text || !state.currentThread || !state.uid) return;
    const { id: threadId, otherUser } = state.currentThread;

    const isNearby = state.nearbyUsers.some(u => u.uid === otherUser.uid);
    if (!isNearby) { showToast("They've left your zone", "ghost"); return; }

    inp.value = "";
    const msgRef = db.collection("threads").doc(threadId).collection("messages");
    await msgRef.add({
      senderUid:   state.uid,
      senderName:  state.user?.displayName || "Anonymous",
      text,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("threads").doc(threadId).update({
      lastMessage:  text,
      updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
      [`unreadCounts.${otherUser.uid}`]: firebase.firestore.FieldValue.increment(1),
    });
  };

  btn.addEventListener("click", send);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
}

function closeThread() {
  const modal = document.getElementById("modal-thread");
  if (modal._msgUnsub) { modal._msgUnsub(); modal._msgUnsub = null; }
  modal.classList.add("hidden");
  modal.classList.remove("open");
  state.currentThread = null;
}

// ─── GHOST MESSAGES ───────────────────────────────
function checkGhostReactivation() {
  state.ghosts.forEach(ghost => {
    const otherUid = ghost.participants.find(id => id !== state.uid);
    const isBack   = state.nearbyUsers.some(u => u.uid === otherUid);
    if (isBack) {
      // Reactivate
      db.collection("threads").doc(ghost.id).update({ isGhost: false }).catch(() => {});
      showToast("A ghost returned to your zone", "ghost");
    }
  });
}

function markThreadsAsGhosts() {
  if (!state.uid) return;
  // Called when user's location leaves the zone of a thread partner
  state.threads.forEach(thread => {
    const otherUid = thread.participants.find(id => id !== state.uid);
    const isNearby = state.nearbyUsers.some(u => u.uid === otherUid);
    if (!isNearby && !thread.isGhost) {
      db.collection("threads").doc(thread.id).update({
        isGhost:   true,
        ghostedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      db.collection("users").doc(state.uid).update({
        totalGhosts: firebase.firestore.FieldValue.increment(1),
      }).catch(() => {});
    }
  });
}

// ─── INBOX RENDER ─────────────────────────────────
function renderInbox() {
  renderThreadList(state.threads, "thread-list", false);
  renderThreadList(state.ghosts,  "ghost-list",  true);
}

function renderThreadList(threads, containerId, isGhost) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (threads.length === 0) {
    el.innerHTML = isGhost
      ? `<div class="empty-state">
           <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 10h.01M15 10h.01M12 2a7 7 0 0 1 7 7v8l-2-2-2 2-2-2-2 2-2-2-2 2V9a7 7 0 0 1 7-7z"/></svg></div>
           <p>No ghost messages yet</p><span>Miss a reply and see them here</span></div>`
      : `<div class="empty-state">
           <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
           <p>No active threads yet</p><span>Start a conversation on the map</span></div>`;
    return;
  }
  el.innerHTML = "";
  threads.forEach(thread => {
    const otherUid  = thread.participants?.find(id => id !== state.uid);
    const otherData = thread.participantData?.[otherUid] || {};
    const color     = orbColor(otherData.mood);
    const unread    = thread.unreadCounts?.[state.uid] || 0;
    const item = document.createElement("div");
    item.className = "thread-item";
    item.innerHTML = `
      <div class="thread-orb-sm${isGhost ? " ghost-orb" : ""}" style="background:${color};color:${color}">
        ${nameInitial(otherData.displayName || "?")}
      </div>
      <div class="thread-body">
        <div class="thread-name">${otherData.displayName || "Anonymous"}</div>
        <div class="thread-preview${isGhost ? " ghost-text" : ""}">
          ${isGhost ? "Left the zone before you replied" : escapeHtml(thread.lastMessage || "Start the conversation")}
        </div>
      </div>
      <div class="thread-meta">
        <span class="thread-time">${formatRelativeTime(thread.updatedAt)}</span>
        ${unread > 0 && !isGhost ? `<span class="thread-unread">${unread}</span>` : ""}
        ${isGhost ? `<span class="thread-ghost-badge">Ghost</span>` : ""}
      </div>`;
    item.addEventListener("click", () => {
      const nearbyUser = state.nearbyUsers.find(u => u.uid === otherUid) ||
        { uid: otherUid, displayName: otherData.displayName, mood: otherData.mood, distance: 0 };
      openThread(nearbyUser);
    });
    el.appendChild(item);
  });
}

function initInboxTabs() {
  document.querySelectorAll(".inbox-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".inbox-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".inbox-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`inbox-${tab.dataset.itab}`).classList.add("active");
    });
  });
}

// ─── PROFILE ──────────────────────────────────────
function initProfile() {
  initInboxTabs();

  // Cloudinary upload
  document.getElementById("btn-upload-photo").addEventListener("click", () => {
    if (!window.cloudinary) { showToast("Upload widget not loaded", "error"); return; }
    window.cloudinary.openUploadWidget({
      cloudName:   CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      sources:     ["local", "camera"],
      cropping:    true,
      croppingAspectRatio: 1,
      multiple:    false,
      maxFileSize: 5000000,
      styles: {
        palette: { window: "#0f0f1a", windowBorder: "#2a2a3a", tabIcon: "#7c3aed",
                   menuIcons: "#94949e", textDark: "#ffffff", textLight: "#0f0f1a",
                   link: "#7c3aed", action: "#7c3aed", inactiveTabIcon: "#64748b",
                   error: "#ef4444", inProgress: "#7c3aed", complete: "#22c55e" },
      },
    }, (err, result) => {
      if (!err && result.event === "success") {
        const url = result.info.secure_url;
        updateProfilePhoto(url);
      }
    });
  });

  // Save bio
  document.getElementById("btn-save-bio").addEventListener("click", async () => {
    const bio = document.getElementById("profile-bio-input").value.trim();
    if (!state.uid) return;
    await db.collection("users").doc(state.uid).update({ bio });
    if (state.user) state.user.bio = bio;
    showToast("Bio saved", "success");
  });

  // Logout
  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (!confirm("Sign out of Drift?")) return;
    if (state.uid) {
      db.collection("users").doc(state.uid).update({ isOnline: false }).catch(() => {});
    }
    cleanupApp();
    await auth.signOut();
  });
}

async function updateProfilePhoto(url) {
  if (!state.uid) return;
  await db.collection("users").doc(state.uid).update({ photoURL: url });
  await state.authUser?.updateProfile({ photoURL: url });
  if (state.user) state.user.photoURL = url;
  const img = document.getElementById("profile-avatar-img");
  const init = document.getElementById("profile-avatar-initial");
  img.src = url; img.style.display = "block"; init.style.display = "none";
  showToast("Photo updated", "success");
}

function renderProfile() {
  if (!state.user && !state.authUser) return;
  const name  = state.user?.displayName || state.authUser?.displayName || "Anonymous";
  const email = state.user?.email       || state.authUser?.email       || "";
  const photo = state.user?.photoURL    || state.authUser?.photoURL    || "";
  const bio   = state.user?.bio         || "";

  document.getElementById("profile-name-display").textContent  = name;
  document.getElementById("profile-email-display").textContent = email;
  document.getElementById("profile-avatar-initial").textContent = nameInitial(name);
  document.getElementById("profile-bio-input").value = bio;

  const moodDisplay = document.getElementById("profile-mood-display");
  const moodLabels = { open:"🔥 Open", chill:"💙 Chill", lost:"🌀 Lost",
                       bored:"😑 Bored", curious:"🔍 Curious", observe:"🌙 Observing" };
  const mood = state.user?.mood;
  moodDisplay.textContent = mood ? moodLabels[mood] : "No mood set";
  if (mood) moodDisplay.style.color = orbColor(mood);

  if (photo) {
    const img  = document.getElementById("profile-avatar-img");
    const init = document.getElementById("profile-avatar-initial");
    img.src = photo; img.style.display = "block"; init.style.display = "none";
  }

  // Stats — live fetch
  if (state.uid) {
    db.collection("users").doc(state.uid).get().then(snap => {
      if (!snap.exists) return;
      const d = snap.data();
      document.getElementById("stat-zones").textContent  = d.driftScore   || 0;
      document.getElementById("stat-convos").textContent = d.totalConvos  || 0;
      document.getElementById("stat-ghosts").textContent = d.totalGhosts  || 0;
    });
  }
}

// ─── SETTINGS ─────────────────────────────────────
function initSettings() {
  // Visible toggle
  document.getElementById("setting-visible").addEventListener("change", function() {
    if (!state.uid) return;
    db.collection("users").doc(state.uid).update({ isVisible: this.checked }).catch(() => {});
    showToast(this.checked ? "You are now visible on the map" : "You are hidden from the map", "info");
  });

  // Trail toggle
  document.getElementById("setting-trail").addEventListener("change", function() {
    if (!state.uid) return;
    db.collection("users").doc(state.uid).update({ showTrail: this.checked }).catch(() => {});
  });

  // Zone radius
  document.getElementById("setting-radius").addEventListener("change", function() {
    state.zoneRadius = parseInt(this.value);
    document.getElementById("radius-label").textContent = `${this.value} meters`;
    loadNearbyUsers();
  });

  // Change password
  document.getElementById("btn-change-pw").addEventListener("click", async () => {
    if (!state.authUser?.email) return;
    await auth.sendPasswordResetEmail(state.authUser.email);
    showToast("Reset email sent to " + state.authUser.email, "success");
  });

  // Delete account
  document.getElementById("btn-delete-account").addEventListener("click", async () => {
    if (!confirm("Permanently delete your account and all data? This cannot be undone.")) return;
    try {
      await db.collection("users").doc(state.uid).delete();
      await state.authUser.delete();
      showToast("Account deleted", "info");
    } catch (e) {
      if (e.code === "auth/requires-recent-login") {
        showToast("Please sign out and sign back in first, then try again.", "error");
      } else {
        showToast("Error deleting account", "error");
      }
    }
  });
}

// ─── HELPERS ──────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── SPLASH → AUTH TRANSITION ─────────────────────
window.addEventListener("load", () => {
  setTimeout(() => {
    showScreen("auth-screen");
    initAuth();
    initAuthCanvas();
  }, 2400);
});

// Clean up on tab close
window.addEventListener("beforeunload", () => {
  if (state.uid) {
    navigator.sendBeacon(
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${state.uid}`,
    );
    db.collection("users").doc(state.uid).update({ isOnline: false }).catch(() => {});
  }
});

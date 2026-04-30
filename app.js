/* ============================================================
   Orbit — SPA controller
   ============================================================ */
import {
  watchAuth, signUp, signIn, signInGoogle, signOutUser,
  getUserProfile, getUserByHandle, updateMyProfile, ensureUserProfile,
  uploadToCloudinary, grantBeacon,
  createBeam, listenBeams, toggleGlow, deleteBeam,
  getBeam, listenBeam, addEcho, listenEchoes,
  createCircle, listenCircles, getCircle, joinCircle, leaveCircle,
  openOrCreateDirectChat, listenMyChats, listenChat, listenMessages,
  sendMessage, addReaction, updateChatSettings,
  follow, unfollow, searchPeople,
  createNotification, listenNotifications, markAllNotificationsRead,
  auth, db
} from "./firebase.js";

/* ============================================================
   GLOBAL STATE
   ============================================================ */
const state = {
  user: null,        // firebase auth user
  profile: null,     // firestore profile
  route: null,
  unsub: [],         // current screen listeners to clean up
  cache: {
    profilesByUid: new Map(),
    profilesByHandle: new Map()
  },
  ui: {
    composeOpen: false,
    activeChatId: null,
    activeReply: null,
    notifBadge: 0,
    chatBadge: 0
  }
};

/* ============================================================
   SMALL HELPERS
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "data") Object.entries(v).forEach(([dk, dv]) => node.dataset[dk] = dv);
    else if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return node;
};
const refreshIcons = () => window.lucide && window.lucide.createIcons();
const escape = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function timeAgo(ts) {
  if (!ts) return "now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function dayLabel(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const that = new Date(d); that.setHours(0,0,0,0);
  const diff = (today - that) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "O";
}

/* ============================================================
   THEME / ACCENT
   ============================================================ */
const ACCENTS = {
  violet: { h: 258, s: 90, l: 76, h2: 190, s2: 90, l2: 70 },
  cyan:   { h: 190, s: 90, l: 70, h2: 258, s2: 90, l2: 76 },
  rose:   { h: 340, s: 88, l: 72, h2: 28,  s2: 92, l2: 68 },
  amber:  { h: 38,  s: 92, l: 64, h2: 14,  s2: 88, l2: 64 },
  mint:   { h: 158, s: 70, l: 62, h2: 188, s2: 78, l2: 62 },
  indigo: { h: 240, s: 84, l: 70, h2: 282, s2: 80, l2: 72 }
};
function applyAccent(name) {
  const a = ACCENTS[name] || ACCENTS.violet;
  document.documentElement.style.setProperty("--accent", `${a.h} ${a.s}% ${a.l}%`);
  document.documentElement.style.setProperty("--accent-2", `${a.h2} ${a.s2}% ${a.l2}%`);
  document.documentElement.style.setProperty("--accent-soft", `${a.h} ${a.s}% ${a.l}% / 0.16`);
  localStorage.setItem("orbit:accent", name);
}
function applyTheme(theme) {
  const t = theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : (theme || "dark");
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("orbit:theme", theme || "dark");
  // sync any visible quick-toggle icons
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    const icon = btn.querySelector('i');
    if (icon) {
      icon.setAttribute("data-lucide", t === "dark" ? "sun" : "moon");
      btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
    }
  });
  refreshIcons && refreshIcons();
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
}
applyTheme(localStorage.getItem("orbit:theme") || "dark");
applyAccent(localStorage.getItem("orbit:accent") || "violet");

/* ============================================================
   TOASTS
   ============================================================ */
function toast(message, kind = "info", icon = "sparkles") {
  const node = el("div", { class: `toast ${kind}` }, [
    el("i", { "data-lucide": icon }), message
  ]);
  $("#toasts").append(node);
  refreshIcons();
  setTimeout(() => { node.classList.add("fade"); setTimeout(() => node.remove(), 250); }, 2400);
}

/* ============================================================
   MODAL / SHEET / CTX MENU
   ============================================================ */
function openModal({ title, body, footer }) {
  const root = $("#modal-root");
  root.innerHTML = "";
  const close = () => { root.classList.remove("is-open"); root.innerHTML = ""; };
  const backdrop = el("div", { class: "modal-backdrop", onClick: close });
  const head = el("div", { class: "modal-head" }, [
    el("h2", { text: title || "" }),
    el("button", { class: "modal-close", "aria-label": "Close", onClick: close }, [el("i", { "data-lucide": "x" })])
  ]);
  const modal = el("div", { class: "modal" }, [head, body, footer].filter(Boolean));
  root.append(backdrop, modal);
  root.classList.add("is-open");
  refreshIcons();
  return close;
}
function openSheet({ body }) {
  const root = $("#sheet-root");
  root.innerHTML = "";
  const close = () => { root.classList.remove("is-open"); root.innerHTML = ""; };
  const backdrop = el("div", { class: "sheet-backdrop", onClick: close });
  const sheet = el("div", { class: "sheet" }, [el("div", { class: "sheet-handle" }), body]);
  root.append(backdrop, sheet);
  root.classList.add("is-open");
  refreshIcons();
  return close;
}
function openCtx(x, y, items) {
  const root = $("#ctx-root");
  root.innerHTML = "";
  const close = () => { root.classList.remove("is-open"); root.innerHTML = ""; };
  const backdrop = el("div", { class: "modal-backdrop", style: { background: "transparent" }, onClick: close });
  const menu = el("div", { class: "ctx" });
  items.forEach(it => {
    if (!it) return;
    menu.append(el("button", {
      class: it.danger ? "danger" : "",
      onClick: () => { close(); it.onClick && it.onClick(); }
    }, [el("i", { "data-lucide": it.icon || "circle" }), it.label]));
  });
  // position
  const w = 200, h = items.length * 38 + 8;
  menu.style.left = Math.min(x, window.innerWidth - w - 10) + "px";
  menu.style.top  = Math.min(y, window.innerHeight - h - 10) + "px";
  root.append(backdrop, menu);
  root.classList.add("is-open");
  refreshIcons();
}

/* ============================================================
   AUTH SCREEN
   ============================================================ */
function setupAuthScreen() {
  let mode = "signin";
  const screen = $("#auth-screen");
  const form = $("#auth-form");
  const errEl = $("#auth-error");
  const submitBtn = $("#auth-submit");
  const submitLabel = $(".btn-label", submitBtn);
  const spinner = $(".btn-spinner", submitBtn);
  const setMode = (m) => {
    mode = m;
    $$('.auth-tab').forEach(t => t.classList.toggle("is-active", t.dataset.authTab === m));
    screen.classList.toggle("is-signup", m === "signup");
    submitLabel.textContent = m === "signup" ? "Create account" : "Sign in";
    errEl.textContent = "";
  };
  $$('.auth-tab').forEach(t => t.addEventListener("click", () => setMode(t.dataset.authTab)));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    submitBtn.disabled = true; spinner.classList.remove("hidden"); submitLabel.classList.add("hidden");
    try {
      if (mode === "signup") {
        await signUp({
          email: $("#auth-email").value.trim(),
          password: $("#auth-pass").value,
          displayName: $("#auth-name").value.trim() || "Orbiter",
          handle: ($("#auth-handle").value.trim() || "").toLowerCase().replace(/[^a-z0-9_]/g, "")
        });
      } else {
        await signIn({ email: $("#auth-email").value.trim(), password: $("#auth-pass").value });
      }
    } catch (err) {
      errEl.textContent = friendlyError(err);
    } finally {
      submitBtn.disabled = false; spinner.classList.add("hidden"); submitLabel.classList.remove("hidden");
    }
  });

  $("#google-btn").addEventListener("click", async () => {
    errEl.textContent = "";
    try { await signInGoogle(); }
    catch (err) { errEl.textContent = friendlyError(err); }
  });
}
function friendlyError(err) {
  const msg = (err && err.message) || "Something went wrong.";
  if (msg.includes("auth/invalid")) return "Invalid email or password.";
  if (msg.includes("user-not-found")) return "No account with that email.";
  if (msg.includes("email-already-in-use")) return "That email is already in use.";
  if (msg.includes("weak-password")) return "Password should be at least 6 characters.";
  if (msg.includes("popup-closed-by-user")) return "Sign-in window was closed.";
  return msg.replace(/^Firebase:\s*/, "");
}

/* ============================================================
   ROUTING
   ============================================================ */
const ROUTES = {
  stream: renderStream,
  flicks: renderFlicks,
  circles: renderCircles,
  circle: renderCircleDetail,
  signals: renderSignals,
  profile: renderProfile,
  beam: renderBeamDetail,
  settings: renderSettings,
  notifications: renderNotifications,
  search: renderSearch,
  verify: renderVerify
};
function parseRoute() {
  const hash = location.hash || "#/stream";
  const [name, ...rest] = hash.replace(/^#\//, "").split("/");
  return { name: name || "stream", params: rest };
}
function navigate(path) { location.hash = path; }
function highlightNav(name) {
  $$('.nav-item, .bn-item').forEach(n => n.classList.toggle("is-active", n.dataset.route === name));
}
function teardown() {
  state.unsub.forEach(fn => { try { fn(); } catch {} });
  state.unsub = [];
}
async function router() {
  if (!state.user) return;
  const { name, params } = parseRoute();
  state.route = name;
  teardown();
  highlightNav(name);
  const fn = ROUTES[name] || renderStream;
  const view = $("#view");
  view.innerHTML = "";
  view.classList.remove("view-anim");
  void view.offsetWidth;
  view.classList.add("view-anim");
  try { await fn(view, params); } catch (e) { console.error(e); view.append(emptyState("compass", "Lost in space", "Could not load this view.")); }
  refreshIcons();
}
window.addEventListener("hashchange", router);

/* ============================================================
   PROFILE CACHE
   ============================================================ */
async function profileFor(uid) {
  if (!uid) return null;
  if (state.cache.profilesByUid.has(uid)) return state.cache.profilesByUid.get(uid);
  const p = await getUserProfile(uid);
  if (p) state.cache.profilesByUid.set(uid, p);
  return p;
}

/* ============================================================
   COMMON UI BITS
   ============================================================ */
function avatar(p, sizeClass = "") {
  const wrap = el("div", { class: `avatar ${sizeClass}` });
  if (p?.photoURL) wrap.append(el("img", { src: p.photoURL, alt: "" }));
  else wrap.textContent = initials(p?.displayName);
  return wrap;
}
function beaconIcon(size = "") {
  const w = el("span", { class: `beacon ${size}`, title: "Beacon verified" });
  w.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  return w;
}
function emptyState(icon, title, sub, action) {
  const wrap = el("div", { class: "empty" }, [
    el("div", { class: "empty-art" }, [el("i", { "data-lucide": icon })]),
    el("h3", { text: title }),
    el("p", { text: sub })
  ]);
  if (action) wrap.append(action);
  return wrap;
}
function viewHeader(title, right) {
  const head = el("header", { class: "view-header" }, [el("h1", { text: title })]);
  if (right) head.append(right);
  return head;
}
function skeletonBeam() {
  return el("div", { class: "beam" }, [
    el("div", { class: "beam-head" }, [
      el("div", { class: "skeleton", style: { width: "40px", height: "40px", borderRadius: "50%" } }),
      el("div", { class: "skeleton", style: { width: "120px", height: "14px" } })
    ]),
    el("div", { class: "skeleton", style: { width: "100%", height: "14px", marginBottom: "8px" } }),
    el("div", { class: "skeleton", style: { width: "75%", height: "14px" } })
  ]);
}

/* ============================================================
   SCREEN: STREAM
   ============================================================ */
function renderStream(view) {
  const inner = el("div", { class: "view-inner stream" });
  inner.append(viewHeader("Stream"));
  inner.append(composerCard());
  const list = el("div", { class: "beam-list" });
  for (let i = 0; i < 3; i++) list.append(skeletonBeam());
  inner.append(list);
  view.append(inner);

  const unsub = listenBeams((items) => {
    list.innerHTML = "";
    if (!items.length) {
      list.append(emptyState("sparkles", "Your Stream awaits", "Follow people in your Constellation or compose your first Beam.",
        el("button", { class: "btn btn-primary", onClick: () => openCompose() }, [el("i", { "data-lucide": "feather" }), "Compose Beam"])));
      refreshIcons();
      return;
    }
    items.forEach(b => list.append(renderBeam(b)));
    refreshIcons();
  });
  state.unsub.push(unsub);
}

function composerCard() {
  return el("div", { class: "composer-card", onClick: () => openCompose() }, [
    avatar(state.profile),
    el("div", { class: "quick-input", text: "Send a Beam into the Stream..." })
  ]);
}

function renderBeam(b) {
  const isGlowed = (b.glows || []).includes(state.user.uid);
  const node = el("article", {
    class: "beam" + (isGlowed ? " has-glow" : ""),
    data: { id: b.id }
  });

  const meta = el("div", { class: "beam-meta" });
  const author = el("div", { class: "beam-author" }, [
    el("a", { href: `#/profile/${b.authorHandle || ""}`, text: b.authorName || "Orbiter" })
  ]);
  if (b.authorVerified) author.append(beaconIcon());
  meta.append(author);
  const sub = el("div", { class: "beam-sub", text: timeAgo(b.createdAt) });
  meta.append(sub);

  const head = el("div", { class: "beam-head" }, [
    avatar({ displayName: b.authorName, photoURL: b.authorPhoto }, "sm"),
    meta,
    el("button", { class: "btn-icon", onClick: (e) => beamMenu(e, b) }, [el("i", { "data-lucide": "more-horizontal" })])
  ]);
  node.append(head);

  // Tappable area opens the post detail
  const openDetail = () => navigate(`/beam/${b.id}`);

  if (b.body) {
    const body = el("div", { class: "beam-body", text: b.body });
    body.style.cursor = "pointer";
    body.addEventListener("click", openDetail);
    node.append(body);
  }
  if (b.videoURL) {
    const vid = el("video", { src: b.videoURL, playsinline: "", muted: "", loop: "", preload: "metadata", controls: "" });
    const wrap = el("div", { class: "beam-image beam-video" }, [vid]);
    wrap.style.cursor = "pointer";
    wrap.addEventListener("click", (e) => { if (e.target.tagName !== "VIDEO") openDetail(); });
    node.append(wrap);
  } else if (b.imageURL) {
    const img = el("img", { src: b.imageURL, alt: "", loading: "lazy" });
    const wrap = el("div", { class: "beam-image" }, [img]);
    wrap.style.cursor = "pointer";
    wrap.addEventListener("click", openDetail);
    node.append(wrap);
  }

  const glowBtn = el("button", { class: "beam-act" + (isGlowed ? " is-glowed" : "") }, [
    el("i", { "data-lucide": "heart" }),
    el("span", { text: String(b.glowsCount || 0) })
  ]);
  glowBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    glowBtn.classList.add("glowing");
    setTimeout(() => glowBtn.classList.remove("glowing"), 600);
    const nowGlowed = await toggleGlow(b.id, state.user.uid);
    glowBtn.classList.toggle("is-glowed", nowGlowed);
    node.classList.toggle("has-glow", nowGlowed);
    if (nowGlowed && b.authorUid !== state.user.uid) {
      createNotification(b.authorUid, {
        kind: "glow", fromUid: state.user.uid, fromName: state.profile.displayName, beamId: b.id
      });
    }
    refreshIcons();
  });

  const echoBtn = el("button", { class: "beam-act", onClick: (e) => { e.stopPropagation(); openDetail(); } }, [
    el("i", { "data-lucide": "message-circle" }), el("span", { text: String(b.echoesCount || 0) })
  ]);
  const signalBtn = el("button", { class: "beam-act", onClick: (e) => { e.stopPropagation(); openSignalWith(b.authorUid); } }, [
    el("i", { "data-lucide": "send" })
  ]);
  const shareBtn = el("button", { class: "beam-act", onClick: (e) => { e.stopPropagation(); navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/beam/${b.id}`); toast("Link copied", "success", "check"); } }, [
    el("i", { "data-lucide": "share-2" })
  ]);

  node.append(el("div", { class: "beam-actions" }, [glowBtn, echoBtn, signalBtn, shareBtn]));
  node.addEventListener("contextmenu", (e) => { e.preventDefault(); beamMenu(e, b); });
  return node;
}

/* ============================================================
   SCREEN: BEAM DETAIL (post + echoes/comments)
   ============================================================ */
async function renderBeamDetail(view, params) {
  const id = params[0];
  if (!id) { navigate("/stream"); return; }
  const inner = el("div", { class: "view-inner stream" });
  const header = el("header", { class: "view-header detail-header" }, [
    el("button", { class: "btn-icon", onClick: () => history.length > 1 ? history.back() : navigate("/stream"), "aria-label": "Back" }, [el("i", { "data-lucide": "arrow-left" })]),
    el("h2", { text: "Beam" })
  ]);
  inner.append(header);
  const beamHolder = el("div");
  const echoesHolder = el("div", { class: "echo-list" });
  inner.append(beamHolder, echoesHolder);
  view.append(inner);

  const renderInto = (b) => {
    beamHolder.innerHTML = "";
    beamHolder.append(renderBeam(b));
    refreshIcons();
  };
  // Live beam updates
  const u1 = listenBeam(id, renderInto);
  state.unsub.push(u1);
  // Echoes (comments)
  const u2 = listenEchoes(id, (echoes) => {
    echoesHolder.innerHTML = "";
    echoesHolder.append(el("div", { class: "echo-head", text: `${echoes.length} ${echoes.length === 1 ? "Echo" : "Echoes"}` }));
    if (!echoes.length) {
      echoesHolder.append(el("div", { class: "muted text-sm", style: { padding: "1rem", textAlign: "center" }, text: "Be the first to Echo this Beam." }));
    } else {
      echoes.forEach(e => echoesHolder.append(renderEcho(e)));
    }
    refreshIcons();
  });
  state.unsub.push(u2);

  // Compose echo
  const composer = el("div", { class: "echo-composer" });
  const ta = el("textarea", { placeholder: "Echo this Beam...", rows: 1, maxlength: 400 });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; });
  const sendBtn = el("button", { class: "chat-send", "aria-label": "Send Echo" }, [el("i", { "data-lucide": "send" })]);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBtn.click(); } });
  sendBtn.addEventListener("click", async () => {
    const text = ta.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    try {
      await addEcho(id, { author: state.profile, text });
      const beam = await getBeam(id);
      if (beam && beam.authorUid !== state.user.uid) {
        createNotification(beam.authorUid, { kind: "echo", fromUid: state.user.uid, fromName: state.profile.displayName, beamId: id });
      }
      ta.value = ""; ta.style.height = "auto";
    } catch (err) { toast(err.message, "error", "alert-circle"); }
    finally { sendBtn.disabled = false; }
  });
  composer.append(avatar(state.profile, "sm"), ta, sendBtn);
  inner.append(composer);
  refreshIcons();
}

function renderEcho(e) {
  const row = el("div", { class: "echo" }, [
    avatar({ displayName: e.authorName, photoURL: e.authorPhoto }, "sm"),
    el("div", { class: "echo-body" }, [
      el("div", { class: "row gap-1" }, [
        el("a", { class: "fw-600", href: `#/profile/${e.authorHandle}`, text: e.authorName }),
        e.authorVerified ? beaconIcon() : null,
        el("span", { class: "text-xs muted", text: " · " + timeAgo(e.createdAt) })
      ]),
      el("div", { text: e.text, style: { marginTop: "0.15rem" } })
    ])
  ]);
  return row;
}

function beamMenu(e, b) {
  e.preventDefault(); e.stopPropagation();
  const x = e.clientX, y = e.clientY;
  const isMine = b.authorUid === state.user.uid;
  openCtx(x, y, [
    { icon: "bookmark", label: "Save Beam", onClick: () => toast("Beam saved", "success", "bookmark") },
    { icon: "copy", label: "Copy text", onClick: () => { navigator.clipboard?.writeText(b.body || ""); toast("Copied", "success", "check"); } },
    { icon: "share-2", label: "Share link", onClick: () => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/profile/${b.authorHandle}`); toast("Link copied", "success", "check"); } },
    isMine && { icon: "trash-2", label: "Delete Beam", danger: true, onClick: async () => { await deleteBeam(b.id); toast("Beam removed", "success", "trash-2"); } },
    !isMine && { icon: "flag", label: "Report", onClick: () => toast("Report sent", "success", "flag") }
  ]);
}

/* ============================================================
   COMPOSE (sheet)
   ============================================================ */
async function openCompose(presetCircleId = null) {
  let mediaFile = null;
  let mediaPreviewURL = null;
  let mediaKind = null; // 'image' | 'video'

  const textarea = el("textarea", { placeholder: "What light are you sending out?", maxlength: 600 });
  const counter = el("span", { class: "compose-counter", text: "0 / 600" });
  const previewWrap = el("div", { class: "compose-preview hidden" });
  const imgInput = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  const vidInput = el("input", { type: "file", accept: "video/*", style: { display: "none" } });
  let circleId = presetCircleId;

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 320) + "px";
    counter.textContent = `${textarea.value.length} / 600`;
    counter.classList.toggle("over", textarea.value.length > 580);
  });

  const setMedia = (f, kind) => {
    mediaFile = f; mediaKind = kind;
    if (mediaPreviewURL) URL.revokeObjectURL(mediaPreviewURL);
    mediaPreviewURL = URL.createObjectURL(f);
    previewWrap.innerHTML = "";
    previewWrap.classList.remove("hidden");
    const previewMedia = kind === "video"
      ? el("video", { src: mediaPreviewURL, controls: "", playsinline: "", muted: "" })
      : el("img", { src: mediaPreviewURL, alt: "" });
    previewWrap.append(
      previewMedia,
      el("button", { class: "remove", "aria-label": "Remove", onClick: () => { mediaFile = null; mediaKind = null; previewWrap.innerHTML = ""; previewWrap.classList.add("hidden"); } }, [el("i", { "data-lucide": "x" })])
    );
    refreshIcons();
  };
  imgInput.addEventListener("change", () => { const f = imgInput.files?.[0]; if (f) setMedia(f, "image"); });
  vidInput.addEventListener("change", () => {
    const f = vidInput.files?.[0]; if (!f) return;
    if (f.size > 80 * 1024 * 1024) { toast("Video is too large (max 80 MB)", "error", "alert-circle"); return; }
    setMedia(f, "video");
  });

  const sendBtn = el("button", { class: "btn btn-primary" }, [el("i", { "data-lucide": "send" }), "Send Beam"]);
  sendBtn.addEventListener("click", async () => {
    const body = textarea.value.trim();
    if (!body && !mediaFile) { toast("Add a thought, image, or video", "error", "alert-circle"); return; }
    sendBtn.disabled = true; sendBtn.querySelector("span")?.remove?.();
    sendBtn.append(el("span", { class: "btn-spinner" }));
    try {
      let imageURL = null, videoURL = null;
      if (mediaFile) {
        toast(mediaKind === "video" ? "Uploading video..." : "Uploading image...", "info", "upload-cloud");
        const up = await uploadToCloudinary(mediaFile, { folder: mediaKind === "video" ? "orbit/flicks" : "orbit/beams" });
        if (mediaKind === "video") videoURL = up.url; else imageURL = up.url;
      }
      await createBeam({
        author: state.profile, body, imageURL, videoURL, circleId,
        kind: mediaKind === "video" ? "flick" : "beam"
      });
      toast(mediaKind === "video" ? "Flick posted" : "Beam sent", "success", "send");
      close();
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not send", "error", "alert-circle");
      sendBtn.disabled = false;
    }
  });

  const tools = el("div", { class: "compose-tools" }, [
    el("button", { class: "tool", onClick: () => imgInput.click() }, [el("i", { "data-lucide": "image" }), "Image"]),
    el("button", { class: "tool", onClick: () => vidInput.click() }, [el("i", { "data-lucide": "video" }), "Video"]),
    el("button", { class: "tool", onClick: async () => {
      const c = await pickCirclePrompt();
      if (c) { circleId = c.id; toast(`Posting to ${c.name}`, "info", "users-round"); }
    } }, [el("i", { "data-lucide": "users-round" }), "Circle"]),
    el("div", { style: { flex: "1" } }),
    counter
  ]);

  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendBtn.click();
  });

  const body = el("div", { class: "compose-area" }, [
    el("div", { style: { display: "flex", gap: "0.75rem", alignItems: "flex-start" } }, [avatar(state.profile, "sm"), textarea]),
    previewWrap, tools, imgInput, vidInput,
    el("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" } }, [sendBtn])
  ]);
  const close = openSheet({ body });
  setTimeout(() => textarea.focus(), 100);
}

async function pickCirclePrompt() {
  return new Promise(resolve => {
    const list = el("div");
    const close = openSheet({ body: el("div", {}, [
      el("h3", { text: "Post into a Circle", style: { marginBottom: "0.75rem" } }),
      list
    ]) });
    const unsub = listenCircles(items => {
      list.innerHTML = "";
      if (!items.length) list.append(emptyState("users-round", "No Circles yet", "Create one from the Circles tab."));
      items.forEach(c => {
        list.append(el("button", {
          class: "signal-item",
          style: { width: "100%" },
          onClick: () => { unsub(); close(); resolve(c); }
        }, [
          el("div", { class: "avatar", style: { background: `linear-gradient(135deg, hsl(var(--accent)), hsl(var(--accent-2)))` } }, [el("i", { "data-lucide": "users-round" })]),
          el("div", { class: "meta" }, [
            el("div", { class: "name", text: c.name }),
            el("div", { class: "preview", text: `${c.membersCount || 1} members` })
          ])
        ]));
      });
      refreshIcons();
    });
  });
}

/* ============================================================
   SCREEN: FLICKS
   ============================================================ */
function renderFlicks(view) {
  const wrap = el("div", { class: "flicks" });
  view.append(wrap);
  const unsub = listenBeams((items) => {
    const flicks = items.filter(b => b.videoURL || b.kind === "flick" || b.imageURL);
    wrap.innerHTML = "";
    if (!flicks.length) {
      wrap.append(emptyState("play-circle", "No Flicks yet", "Compose a Beam with a video and it will appear here as a Flick.",
        el("button", { class: "btn btn-primary", onClick: () => openCompose() }, [el("i", { "data-lucide": "video" }), "Record / Upload"])));
      refreshIcons(); return;
    }
    flicks.forEach(b => wrap.append(renderFlick(b)));
    refreshIcons();
    // Auto-play first visible video
    setupFlickAutoplay(wrap);
  });
  state.unsub.push(unsub);
}
function setupFlickAutoplay(wrap) {
  const vids = wrap.querySelectorAll("video");
  if (!vids.length || !("IntersectionObserver" in window)) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target;
      if (e.intersectionRatio > 0.6) v.play().catch(()=>{});
      else v.pause();
    });
  }, { threshold: [0, 0.6, 1] });
  vids.forEach(v => obs.observe(v));
}
function renderFlick(b) {
  const node = el("section", { class: "flick" });
  if (b.videoURL) {
    const v = el("video", { src: b.videoURL, playsinline: "", loop: "", muted: "", preload: "metadata", style: { objectFit: "cover", width: "100%", height: "100%" } });
    v.addEventListener("click", () => { v.muted = !v.muted; });
    node.append(v);
  } else if (b.imageURL) {
    node.append(el("img", { src: b.imageURL, alt: "", loading: "lazy", style: { objectFit: "cover", width: "100%", height: "100%" } }));
  } else {
    node.append(el("div", { class: "flick-fallback", text: (b.body || "").slice(0, 60) }));
  }
  node.append(el("div", { class: "flick-overlay" }));
  const meta = el("div", { class: "flick-meta" }, [
    el("div", { class: "who" }, [
      el("a", { href: `#/profile/${b.authorHandle}`, text: "@" + (b.authorHandle || "orbiter"), style: { color: "white" } }),
      b.authorVerified ? beaconIcon() : null
    ]),
    el("div", { class: "what", text: b.body || "" })
  ]);
  const isGlowed = (b.glows || []).includes(state.user.uid);
  const glowBtn = el("button", { class: isGlowed ? "is-glowed" : "" }, [
    el("i", { "data-lucide": "heart" }), el("span", { text: String(b.glowsCount || 0) })
  ]);
  glowBtn.addEventListener("click", async () => {
    const nowG = await toggleGlow(b.id, state.user.uid);
    glowBtn.classList.toggle("is-glowed", nowG);
    glowBtn.querySelectorAll("span")[0].textContent = String((b.glowsCount || 0) + (nowG ? 1 : -1));
  });
  const side = el("div", { class: "flick-side" }, [
    glowBtn,
    el("button", { onClick: () => openSignalWith(b.authorUid) }, [el("i", { "data-lucide": "message-square" }), el("span", { text: "Signal" })]),
    el("button", { onClick: () => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/profile/${b.authorHandle}`); toast("Link copied", "success", "check"); } }, [el("i", { "data-lucide": "share-2" }), el("span", { text: "Share" })])
  ]);
  node.append(meta, side);
  return node;
}

/* ============================================================
   SCREEN: CIRCLES
   ============================================================ */
function renderCircles(view) {
  const inner = el("div", { class: "view-inner wide" });
  const newBtn = el("button", { class: "btn btn-primary", onClick: () => openCreateCircle() }, [el("i", { "data-lucide": "plus" }), "New Circle"]);
  inner.append(viewHeader("Circles", newBtn));
  const grid = el("div", { class: "circles-grid" });
  inner.append(grid);
  view.append(inner);
  const unsub = listenCircles(items => {
    grid.innerHTML = "";
    if (!items.length) {
      grid.append(emptyState("users-round", "No Circles yet", "Create the first Circle to gather your community.",
        el("button", { class: "btn btn-primary", onClick: () => openCreateCircle() }, [el("i", { "data-lucide": "plus" }), "Create Circle"])));
    } else {
      items.forEach(c => grid.append(renderCircleCard(c)));
    }
    refreshIcons();
  });
  state.unsub.push(unsub);
}
function renderCircleCard(c) {
  const node = el("div", { class: "circle-card", onClick: () => navigate(`/circle/${c.id}`) });
  const cover = el("div", { class: "circle-cover", style: c.coverURL ? { backgroundImage: `url(${c.coverURL})`, backgroundSize: "cover", backgroundPosition: "center" } : {} });
  cover.append(el("div", { class: "vibe", style: { background: `linear-gradient(135deg, hsl(var(--accent)), hsl(var(--accent-2)))` } }));
  const body = el("div", { class: "circle-body" }, [
    el("h3", { text: c.name }),
    el("div", { class: "members", text: `${c.membersCount || 1} satellites${c.isPrivate ? " · private" : ""}` }),
    c.description ? el("p", { class: "muted", style: { marginTop: "0.5rem", fontSize: "0.85rem" }, text: c.description }) : null
  ]);
  node.append(cover, body);
  return node;
}
function openCreateCircle() {
  let coverFile = null;
  let coverURL = null;
  const name = el("input", { placeholder: "Circle name", maxlength: 60 });
  const desc = el("textarea", { placeholder: "What's this Circle about?", maxlength: 200, rows: 3 });
  const coverPreview = el("div", { class: "circle-cover", style: { borderRadius: "12px", marginBottom: "0.75rem" } });
  const fileInput = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  fileInput.addEventListener("change", () => {
    coverFile = fileInput.files?.[0]; if (!coverFile) return;
    coverURL = URL.createObjectURL(coverFile);
    coverPreview.style.backgroundImage = `url(${coverURL})`;
    coverPreview.style.backgroundSize = "cover";
    coverPreview.style.backgroundPosition = "center";
  });
  const privateToggle = el("div", { class: "toggle", onClick: (e) => e.currentTarget.classList.toggle("on") });
  const submit = el("button", { class: "btn btn-primary btn-block" }, ["Create Circle"]);
  submit.addEventListener("click", async () => {
    if (!name.value.trim()) { toast("Name your Circle", "error", "alert-circle"); return; }
    submit.disabled = true;
    try {
      let cover = null;
      if (coverFile) {
        const up = await uploadToCloudinary(coverFile, { folder: "orbit/circles" });
        cover = up.url;
      }
      const id = await createCircle({
        name: name.value.trim(),
        description: desc.value.trim(),
        coverURL: cover,
        isPrivate: privateToggle.classList.contains("on"),
        owner: state.profile
      });
      toast("Circle created", "success", "users-round");
      close();
      navigate(`/circle/${id}`);
    } catch (err) { toast(err.message, "error", "alert-circle"); submit.disabled = false; }
  });
  const body = el("div", {}, [
    coverPreview,
    el("button", { class: "btn btn-ghost", style: { marginBottom: "1rem" }, onClick: () => fileInput.click() }, [el("i", { "data-lucide": "image" }), "Upload cover"]),
    fileInput,
    el("div", { class: "field" }, [el("label", { text: "Name" }), name]),
    el("div", { class: "field" }, [el("label", { text: "Description" }), desc]),
    el("div", { class: "setting-row" }, [
      el("div", { class: "label" }, [el("div", { text: "Private Circle" }), el("div", { class: "desc", text: "Only members can see Beams" })]),
      privateToggle
    ]),
    submit
  ]);
  const close = openModal({ title: "Create a Circle", body });
}

async function renderCircleDetail(view, params) {
  const id = params[0]; if (!id) return navigate("/circles");
  const c = await getCircle(id);
  if (!c) { view.append(emptyState("compass", "Circle not found", "Maybe it drifted away.")); return; }
  const inner = el("div", { class: "view-inner wide" });
  const cover = el("div", { class: "circle-detail-cover", style: c.coverURL ? { backgroundImage: `linear-gradient(180deg, transparent, hsl(232 50% 3% / 0.6)), url(${c.coverURL})`, backgroundSize: "cover", backgroundPosition: "center" } : {} }, [
    el("div", {}, [el("h2", { text: c.name }), el("div", { class: "members", text: `${c.membersCount || 1} satellites${c.isPrivate ? " · private" : ""}` })])
  ]);
  inner.append(cover);

  const isMember = (c.members || []).includes(state.user.uid);
  const actions = el("div", { class: "row", style: { marginBottom: "1rem", gap: "0.5rem" } });
  const joinBtn = el("button", { class: isMember ? "btn btn-ghost" : "btn btn-primary" }, [isMember ? "Leave" : "Join"]);
  joinBtn.addEventListener("click", async () => {
    if (isMember) { await leaveCircle(id, state.user.uid); toast("Left Circle", "info", "users-round"); }
    else { await joinCircle(id, state.user.uid); toast("Joined Circle", "success", "users-round"); }
    router();
  });
  actions.append(joinBtn,
    el("button", { class: "btn btn-soft", onClick: () => openCompose(id) }, [el("i", { "data-lucide": "feather" }), "Beam in Circle"])
  );
  inner.append(actions);
  if (c.description) inner.append(el("p", { class: "muted", style: { marginBottom: "1rem" }, text: c.description }));

  const list = el("div");
  inner.append(list);
  view.append(inner);
  const unsub = listenBeams(items => {
    list.innerHTML = "";
    if (!items.length) list.append(emptyState("sparkles", "Quiet in here", "Be the first to send a Beam in this Circle."));
    items.forEach(b => list.append(renderBeam(b)));
    refreshIcons();
  }, { circleId: id });
  state.unsub.push(unsub);
}

/* ============================================================
   SCREEN: SIGNALS (chat)
   ============================================================ */
async function renderSignals(view, params) {
  const layout = el("div", { class: "signals-layout" });
  view.append(layout);
  view.style.padding = "0";

  const list = el("div", { class: "signals-list" });
  const head = el("div", { class: "signals-list-head" }, [
    el("h2", { text: "Signals" }),
    el("input", { class: "signals-search", placeholder: "Search Signals" })
  ]);
  list.append(head);
  const itemsWrap = el("div");
  list.append(itemsWrap);
  const pane = el("div", { class: "chat-pane" });
  pane.append(el("div", { class: "empty", style: { margin: "auto" } }, [
    el("div", { class: "empty-art" }, [el("i", { "data-lucide": "message-square" })]),
    el("h3", { text: "Pick a Signal" }),
    el("p", { text: "Or start one from a profile." })
  ]));
  layout.append(list, pane);
  refreshIcons();

  const activeId = params[0] || null;
  if (activeId) layout.classList.add("has-active");

  const unsub = listenMyChats(state.user.uid, async (chats) => {
    itemsWrap.innerHTML = "";
    if (!chats.length) itemsWrap.append(emptyState("message-square", "No Signals yet", "Tap a profile and send a Signal."));
    for (const c of chats) {
      const otherUid = (c.members || []).find(u => u !== state.user.uid);
      const other = await profileFor(otherUid) || { displayName: "Orbiter" };
      const item = el("div", {
        class: "signal-item" + (c.id === activeId ? " is-active" : ""),
        onClick: () => navigate(`/signals/${c.id}`)
      }, [
        avatar(other),
        el("div", { class: "meta" }, [
          el("div", { class: "top" }, [
            (() => {
              const n = el("div", { class: "name", text: other.displayName });
              if (other.verified) n.append(beaconIcon());
              return n;
            })(),
            el("div", { class: "time", text: timeAgo(c.lastAt) })
          ]),
          el("div", { class: "preview" }, [
            el("span", { class: "txt", text: c.lastMessage?.text || "Say hi" }),
            (c.unread?.[state.user.uid] > 0) ? el("span", { class: "badge", text: String(c.unread[state.user.uid]) }) : null
          ])
        ])
      ]);
      itemsWrap.append(item);
    }
    refreshIcons();
  });
  state.unsub.push(unsub);

  if (activeId) renderChatPane(pane, activeId);
}

async function renderChatPane(pane, chatId) {
  pane.innerHTML = "";
  const chatSnap = await new Promise(res => {
    const u = listenChat(chatId, c => { u(); res(c); });
  });
  if (!chatSnap) { pane.append(emptyState("compass", "Signal not found", "")); return; }
  const otherUid = (chatSnap.members || []).find(u => u !== state.user.uid);
  const other = await profileFor(otherUid) || { displayName: "Orbiter" };

  const settings = chatSnap.settings || {};
  const themeBg = settings.bg || null;
  const accent = settings.accent || null;
  const bubbleR = settings.bubble === "square" ? "8px" : "18px";
  pane.style.setProperty("--bubble-r", bubbleR);
  if (themeBg) pane.style.setProperty("--chat-bg", themeBg);

  const head = el("div", { class: "chat-head" }, [
    el("button", { class: "btn-icon", onClick: () => { history.back(); } }, [el("i", { "data-lucide": "arrow-left" })]),
    avatar(other, "sm"),
    el("div", {}, [
      (() => { const n = el("div", { class: "name", text: other.displayName }); if (other.verified) n.append(beaconIcon()); return n; })(),
      el("div", { class: "pres", text: other.locationLabel || "online" })
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "btn-icon", onClick: () => openChatCustomize(chatId, settings) }, [el("i", { "data-lucide": "palette" })]),
      el("button", { class: "btn-icon", onClick: () => navigate(`/profile/${other.handle}`) }, [el("i", { "data-lucide": "user" })])
    ])
  ]);
  const body = el("div", { class: "chat-body" });
  const compose = renderChatCompose(chatId, other);
  pane.append(head, body, compose);
  refreshIcons();

  let stickToBottom = true;
  body.addEventListener("scroll", () => {
    stickToBottom = (body.scrollHeight - body.scrollTop - body.clientHeight) < 80;
  });

  const unsubMsgs = listenMessages(chatId, (msgs) => {
    body.innerHTML = "";
    let lastDay = "";
    msgs.forEach(m => {
      const d = dayLabel(m.createdAt);
      if (d && d !== lastDay) { body.append(el("div", { class: "chat-day", text: d })); lastDay = d; }
      body.append(renderMessage(m, chatId));
    });
    refreshIcons();
    if (stickToBottom) body.scrollTop = body.scrollHeight;
  });
  state.unsub.push(unsubMsgs);
}

function renderMessage(m, chatId) {
  const mine = m.authorUid === state.user.uid;
  const row = el("div", { class: "msg-row" + (mine ? " me" : "") });
  if (!mine) row.append(avatar({ displayName: m.authorName }, "xs"));
  const bubble = el("div", { class: "msg" });
  if (m.replyTo) {
    bubble.append(el("div", { class: "reply-quote" }, [
      el("div", { class: "fw-600", text: m.replyTo.authorName || "Reply" }),
      el("div", { class: "truncate", text: m.replyTo.text || "" })
    ]));
  }
  if (m.text) bubble.append(el("div", { text: m.text }));
  if (m.attachmentURL) bubble.append(el("img", { src: m.attachmentURL, style: { maxWidth: "240px", borderRadius: "10px", marginTop: "0.4rem" } }));

  const reactions = m.reactions || {};
  if (Object.keys(reactions).length) {
    const wrap = el("div", { class: "reactions" });
    Object.entries(reactions).forEach(([key, list]) => {
      wrap.append(el("span", {}, [el("i", { "data-lucide": REACTIONS[key]?.icon || "sparkle" }), el("span", { text: String(list.length) })]));
    });
    bubble.append(wrap);
  }
  bubble.addEventListener("click", () => openMessageActions(m, chatId));
  bubble.addEventListener("contextmenu", (e) => { e.preventDefault(); openMessageActions(m, chatId); });
  row.append(bubble, el("div", { class: "msg-time", text: timeAgo(m.createdAt) }));
  return row;
}

const REACTIONS = {
  spark:  { icon: "sparkles" },
  glow:   { icon: "sun" },
  star:   { icon: "star" },
  comet:  { icon: "rocket" },
  heart:  { icon: "heart" },
  laugh:  { icon: "smile" }
};
function openMessageActions(m, chatId) {
  const picker = el("div", { class: "reaction-picker" });
  Object.entries(REACTIONS).forEach(([key, r]) => {
    picker.append(el("button", { onClick: async () => { await addReaction(chatId, m.id, state.user.uid, key); close(); } }, [el("i", { "data-lucide": r.icon })]));
  });
  const items = el("div", { class: "col", style: { gap: "0.25rem", marginTop: "0.75rem" } }, [
    el("button", { class: "ctx-btn signal-item", onClick: () => { state.ui.activeReply = m; close(); document.dispatchEvent(new CustomEvent("orbit:reply", { detail: m })); } }, [el("i", { "data-lucide": "reply", style: { marginRight: "0.5rem" } }), "Reply"]),
    el("button", { class: "ctx-btn signal-item", onClick: () => { navigator.clipboard?.writeText(m.text || ""); toast("Copied", "success", "check"); close(); } }, [el("i", { "data-lucide": "copy", style: { marginRight: "0.5rem" } }), "Copy"]),
  ]);
  const body = el("div", {}, [picker, items]);
  const close = openSheet({ body });
}

function openChatCustomize(chatId, settings) {
  const themes = [
    { name: "night", bg: "hsl(232 28% 11%)" },
    { name: "lavender", bg: "linear-gradient(135deg, hsl(258 40% 22%), hsl(280 40% 18%))" },
    { name: "ocean", bg: "linear-gradient(135deg, hsl(210 60% 18%), hsl(190 60% 14%))" },
    { name: "rose", bg: "linear-gradient(135deg, hsl(340 35% 22%), hsl(20 40% 18%))" },
    { name: "mint", bg: "linear-gradient(135deg, hsl(158 30% 18%), hsl(188 35% 16%))" },
    { name: "paper", bg: "hsl(40 20% 95%)" }
  ];
  const swatches = el("div", { class: "theme-swatches" });
  themes.forEach(t => {
    const b = el("button", { style: { background: t.bg }, onClick: async () => {
      await updateChatSettings(chatId, { ...settings, bg: t.bg });
      swatches.querySelectorAll("button").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
      document.querySelector(".chat-pane")?.style.setProperty("--chat-bg", t.bg);
    } });
    if (settings.bg === t.bg) b.classList.add("is-active");
    swatches.append(b);
  });
  const shapes = el("div", { class: "bubble-shapes" });
  ["round", "square"].forEach(shape => {
    const sBtn = el("button", { class: settings.bubble === shape ? "is-active" : "", text: shape, onClick: async () => {
      await updateChatSettings(chatId, { ...settings, bubble: shape });
      shapes.querySelectorAll("button").forEach(x => x.classList.remove("is-active"));
      sBtn.classList.add("is-active");
      document.querySelector(".chat-pane")?.style.setProperty("--bubble-r", shape === "square" ? "8px" : "18px");
    } });
    shapes.append(sBtn);
  });
  const body = el("div", {}, [
    el("h3", { text: "Customize this Signal", style: { marginBottom: "0.75rem" } }),
    el("div", { class: "muted text-sm", style: { marginBottom: "0.5rem" }, text: "Wallpaper" }),
    swatches,
    el("div", { class: "muted text-sm", style: { margin: "0.75rem 0 0.5rem" }, text: "Bubble shape" }),
    shapes
  ]);
  openSheet({ body });
}

function renderChatCompose(chatId, other) {
  const wrap = el("div", { class: "chat-compose" });
  const replyBar = el("div", { class: "reply-bar hidden" });
  const ta = el("textarea", { class: "chat-input", placeholder: "Send a Signal", rows: 1 });
  const send = el("button", { class: "chat-send", "aria-label": "Send" }, [el("i", { "data-lucide": "send" })]);
  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send.click(); }
  });
  const showReply = (m) => {
    replyBar.innerHTML = "";
    replyBar.classList.remove("hidden");
    replyBar.append(
      el("i", { "data-lucide": "reply" }),
      el("span", {}, [el("span", { class: "who", text: "Replying to " + (m.authorName || "them") + " · " }), el("span", { class: "muted truncate", text: (m.text || "").slice(0, 60) })]),
      el("button", { class: "close", onClick: () => { state.ui.activeReply = null; replyBar.classList.add("hidden"); refreshIcons(); } }, [el("i", { "data-lucide": "x" })])
    );
    refreshIcons();
  };
  document.addEventListener("orbit:reply", (e) => showReply(e.detail));
  send.addEventListener("click", async () => {
    const text = ta.value.trim();
    if (!text) return;
    send.classList.add("sending");
    setTimeout(() => send.classList.remove("sending"), 500);
    const reply = state.ui.activeReply ? { authorName: state.ui.activeReply.authorName, text: state.ui.activeReply.text || "" } : null;
    state.ui.activeReply = null;
    replyBar.classList.add("hidden");
    ta.value = ""; ta.style.height = "auto";
    try {
      await sendMessage(chatId, { author: state.profile, text, replyTo: reply });
      if (other?.uid && other.uid !== state.user.uid) {
        createNotification(other.uid, { kind: "signal", fromUid: state.user.uid, fromName: state.profile.displayName, chatId });
      }
    } catch (err) { toast(err.message, "error", "alert-circle"); }
  });
  wrap.append(replyBar, el("div", { class: "chat-input-row" }, [ta, send]));
  refreshIcons();
  return wrap;
}

async function openSignalWith(uid) {
  if (!uid || uid === state.user.uid) return;
  const id = await openOrCreateDirectChat(state.user.uid, uid);
  navigate(`/signals/${id}`);
}

/* ============================================================
   SCREEN: PROFILE
   ============================================================ */
async function renderProfile(view, params) {
  const handle = params[0];
  let profile;
  if (!handle || handle === state.profile.handle) profile = state.profile;
  else profile = await getUserByHandle(handle);
  if (!profile) { view.append(emptyState("compass", "Profile not found", "")); return; }

  const inner = el("div", { class: "view-inner wide" });
  inner.append(el("div", { class: "profile-cover" }));
  const head = el("div", { class: "profile-head" }, [
    avatar(profile, "xl"),
    el("div", { class: "profile-info" }, [
      (() => { const n = el("div", { class: "profile-name", text: profile.displayName }); if (profile.verified) n.append(beaconIcon("lg")); return n; })(),
      el("div", { class: "profile-handle", text: "@" + profile.handle }),
      profile.locationLabel ? el("div", { class: "muted text-sm row", style: { marginTop: "0.25rem" } }, [el("i", { "data-lucide": "map-pin" }), profile.locationLabel]) : null
    ]),
    el("div", { style: { paddingBottom: "0.5rem" } }, profileActions(profile))
  ]);
  inner.append(head);
  if (profile.bio) inner.append(el("p", { class: "profile-bio", text: profile.bio }));
  inner.append(el("div", { class: "profile-stats" }, [
    el("div", { class: "profile-stat" }, [el("span", { class: "n", text: String((profile.constellation || []).length) }), el("span", { class: "l", text: "Constellation" })]),
    el("div", { class: "profile-stat" }, [el("span", { class: "n", text: String(profile.satellites || 0) }), el("span", { class: "l", text: "Satellites" })])
  ]));

  // Tabs
  const tabs = el("div", { class: "profile-tabs" });
  const beamsBtn = el("button", { class: "profile-tab is-active", text: "Beams" });
  const flicksBtn = el("button", { class: "profile-tab", text: "Flicks" });
  tabs.append(beamsBtn, flicksBtn);
  inner.append(tabs);
  const list = el("div");
  inner.append(list);
  view.append(inner);

  let kind = "beams";
  const subscribe = () => {
    teardown();
    list.innerHTML = "";
    const u = listenBeams(items => {
      list.innerHTML = "";
      const filtered = kind === "flicks" ? items.filter(b => b.imageURL) : items;
      if (!filtered.length) list.append(emptyState("sparkles", "No " + kind + " yet", "Send a Beam to brighten this profile."));
      else if (kind === "flicks") {
        const grid = el("div", { class: "media-grid" });
        filtered.forEach(b => {
          const tile = el("div", { class: "tile", onClick: () => navigate(`/beam/${b.id}`) });
          if (b.videoURL) {
            tile.append(el("video", { src: b.videoURL, muted: "", playsinline: "", preload: "metadata" }));
            tile.append(el("span", { class: "tile-play" }, [el("i", { "data-lucide": "play" })]));
          } else {
            tile.append(el("img", { src: b.imageURL, alt: "" }));
          }
          grid.append(tile);
        });
        list.append(grid);
      } else {
        filtered.forEach(b => list.append(renderBeam(b)));
      }
      refreshIcons();
    }, { authorUid: profile.uid });
    state.unsub.push(u);
  };
  beamsBtn.addEventListener("click", () => { kind = "beams"; beamsBtn.classList.add("is-active"); flicksBtn.classList.remove("is-active"); subscribe(); });
  flicksBtn.addEventListener("click", () => { kind = "flicks"; flicksBtn.classList.add("is-active"); beamsBtn.classList.remove("is-active"); subscribe(); });
  subscribe();
}
function profileActions(profile) {
  if (profile.uid === state.user.uid) {
    return [el("button", { class: "btn btn-ghost", onClick: openEditProfile }, [el("i", { "data-lucide": "pencil" }), "Edit"])];
  }
  const following = (state.profile.constellation || []).includes(profile.uid);
  const followBtn = el("button", { class: following ? "btn btn-ghost" : "btn btn-primary" }, [following ? "Following" : "Add to Constellation"]);
  followBtn.addEventListener("click", async () => {
    if (following) { await unfollow(state.user.uid, profile.uid); toast("Removed from Constellation", "info", "user-minus"); }
    else { await follow(state.user.uid, profile.uid); toast("Added to your Constellation", "success", "user-plus");
      createNotification(profile.uid, { kind: "follow", fromUid: state.user.uid, fromName: state.profile.displayName });
    }
    state.profile = await getUserProfile(state.user.uid);
    router();
  });
  const signalBtn = el("button", { class: "btn btn-soft", onClick: () => openSignalWith(profile.uid) }, [el("i", { "data-lucide": "message-square" }), "Signal"]);
  return [followBtn, signalBtn];
}
function openEditProfile() {
  const name = el("input", { value: state.profile.displayName });
  const bio = el("textarea", { rows: 3, value: state.profile.bio || "" });
  const photoInput = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
  let photoFile = null;
  let photoPreview = state.profile.photoURL;
  const ava = el("div", { class: "avatar lg", style: { margin: "0 auto 1rem" } });
  if (photoPreview) ava.append(el("img", { src: photoPreview }));
  else ava.textContent = initials(state.profile.displayName);
  photoInput.addEventListener("change", () => {
    photoFile = photoInput.files?.[0]; if (!photoFile) return;
    const u = URL.createObjectURL(photoFile);
    ava.innerHTML = ""; ava.append(el("img", { src: u }));
  });
  const submit = el("button", { class: "btn btn-primary btn-block" }, ["Save"]);
  submit.addEventListener("click", async () => {
    submit.disabled = true;
    try {
      let photoURL = state.profile.photoURL;
      if (photoFile) { const u = await uploadToCloudinary(photoFile, { folder: "orbit/avatars" }); photoURL = u.url; }
      await updateMyProfile(state.user.uid, { displayName: name.value.trim(), bio: bio.value.trim(), photoURL });
      state.profile = await getUserProfile(state.user.uid);
      state.cache.profilesByUid.set(state.user.uid, state.profile);
      renderSidebarMe();
      toast("Profile updated", "success", "check");
      close(); router();
    } catch (e) { toast(e.message, "error", "alert-circle"); submit.disabled = false; }
  });
  const body = el("div", {}, [
    ava,
    el("div", { style: { textAlign: "center", marginBottom: "1rem" } }, [el("button", { class: "btn btn-ghost", onClick: () => photoInput.click() }, [el("i", { "data-lucide": "image" }), "Change photo"])]),
    photoInput,
    el("div", { class: "field" }, [el("label", { text: "Display name" }), name]),
    el("div", { class: "field" }, [el("label", { text: "Bio" }), bio]),
    submit
  ]);
  const close = openModal({ title: "Edit profile", body });
}

/* ============================================================
   SCREEN: SETTINGS
   ============================================================ */
function renderSettings(view) {
  const inner = el("div", { class: "view-inner" });
  inner.append(viewHeader("Settings"));

  // Appearance
  const themeRow = el("div", { class: "setting-row" }, [
    el("div", { class: "label" }, [el("div", { text: "Theme" }), el("div", { class: "desc", text: "Light, dark, or follow system" })]),
    (() => {
      const sel = el("select");
      ["dark", "light", "system"].forEach(v => sel.append(el("option", { value: v, text: v })));
      sel.value = localStorage.getItem("orbit:theme") || "dark";
      sel.addEventListener("change", () => applyTheme(sel.value));
      return sel;
    })()
  ]);
  const accentRow = el("div", { class: "setting-row" }, [
    el("div", { class: "label" }, [el("div", { text: "Accent" }), el("div", { class: "desc", text: "Tints highlights, buttons, and Glows" })]),
    (() => {
      const wrap = el("div", { class: "accent-row" });
      Object.keys(ACCENTS).forEach(name => {
        const a = ACCENTS[name];
        const dot = el("button", { class: "accent-dot" + (localStorage.getItem("orbit:accent") === name ? " is-active" : ""), style: { background: `linear-gradient(135deg, hsl(${a.h} ${a.s}% ${a.l}%), hsl(${a.h2} ${a.s2}% ${a.l2}%))` } });
        dot.addEventListener("click", () => { applyAccent(name); updateMyProfile(state.user.uid, { accent: name }); wrap.querySelectorAll(".accent-dot").forEach(x => x.classList.remove("is-active")); dot.classList.add("is-active"); });
        wrap.append(dot);
      });
      return wrap;
    })()
  ]);
  inner.append(el("div", { class: "settings-section" }, [el("h3", { text: "Appearance" }), themeRow, accentRow]));

  // Beacon
  const beaconStatus = state.profile.verified
    ? el("div", { class: "row gap-1" }, [beaconIcon(), "Beacon active" + (state.profile.locationLabel ? ` · ${state.profile.locationLabel}` : "")])
    : el("button", { class: "btn btn-primary", onClick: () => navigate("/verify") }, [el("i", { "data-lucide": "shield-check" }), "Get my Beacon"]);
  inner.append(el("div", { class: "settings-section" }, [
    el("h3", { text: "Beacon" }),
    el("div", { class: "setting-row" }, [
      el("div", { class: "label" }, [el("div", { text: "Verification" }), el("div", { class: "desc", text: "We use your approximate location once to confirm you're real." })]),
      beaconStatus
    ])
  ]));

  // Account
  inner.append(el("div", { class: "settings-section" }, [
    el("h3", { text: "Account" }),
    el("div", { class: "setting-row" }, [
      el("div", { class: "label" }, [el("div", { text: state.user.email || "—" }), el("div", { class: "desc", text: "Signed in as @" + state.profile.handle })]),
      el("button", { class: "btn btn-danger", onClick: async () => { await signOutUser(); } }, [el("i", { "data-lucide": "log-out" }), "Sign out"])
    ])
  ]));

  view.append(inner);
}

/* ============================================================
   SCREEN: NOTIFICATIONS
   ============================================================ */
function renderNotifications(view) {
  const inner = el("div", { class: "view-inner" });
  inner.append(viewHeader("Notifications", el("button", { class: "btn btn-ghost", onClick: async () => { await markAllNotificationsRead(state.user.uid); toast("All marked read", "success", "check"); } }, ["Mark all read"])));
  const list = el("div");
  inner.append(list);
  view.append(inner);
  const u = listenNotifications(state.user.uid, items => {
    list.innerHTML = "";
    if (!items.length) { list.append(emptyState("bell", "All quiet", "When people Glow, Signal, or join your Constellation, you'll see it here.")); refreshIcons(); return; }
    items.forEach(n => {
      const labels = {
        glow: `${n.fromName} sent a Glow on your Beam`,
        echo: `${n.fromName} Echoed your Beam`,
        signal: `${n.fromName} sent you a Signal`,
        follow: `${n.fromName} added you to their Constellation`
      };
      const icons = { glow: "heart", echo: "message-circle", signal: "message-square", follow: "user-plus" };
      const item = el("div", { class: "notif-item", onClick: () => {
        if (n.kind === "signal") navigate(`/signals/${n.chatId}`);
        else if (n.kind === "follow") navigate(`/profile/${n.fromName}`);
        else if (n.kind === "glow" || n.kind === "echo") navigate(`/beam/${n.beamId}`);
      } }, [
        el("div", { class: "icn-wrap" }, [el("i", { "data-lucide": icons[n.kind] || "bell" })]),
        el("div", { class: "flex-1" }, [el("div", { text: labels[n.kind] || "New activity" }), el("div", { class: "when", text: timeAgo(n.createdAt) })])
      ]);
      list.append(item);
    });
    refreshIcons();
  });
  state.unsub.push(u);
}

/* ============================================================
   SCREEN: SEARCH
   ============================================================ */
function renderSearch(view) {
  const inner = el("div", { class: "view-inner" });
  inner.append(viewHeader("Search"));
  const input = el("input", { class: "signals-search", placeholder: "Search people..." });
  const list = el("div", { style: { marginTop: "1rem" } });
  inner.append(input, list);
  view.append(inner);
  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const results = await searchPeople(input.value.trim());
      list.innerHTML = "";
      if (!results.length) { list.append(emptyState("search", "No matches", "Try a different name or handle.")); refreshIcons(); return; }
      results.forEach(p => {
        const row = el("div", { class: "signal-item", onClick: () => navigate(`/profile/${p.handle}`) }, [
          avatar(p),
          el("div", { class: "meta" }, [
            (() => { const n = el("div", { class: "name", text: p.displayName }); if (p.verified) n.append(beaconIcon()); return n; })(),
            el("div", { class: "preview", text: "@" + p.handle })
          ])
        ]);
        list.append(row);
      });
      refreshIcons();
    }, 250);
  });
  setTimeout(() => input.focus(), 50);
}

/* ============================================================
   SCREEN: BEACON / VERIFY
   ============================================================ */
function renderVerify(view) {
  const inner = el("div", { class: "view-inner" });
  const card = el("div", { class: "card verify-card" }, [
    el("div", { class: "verify-orb" }, [el("i", { "data-lucide": "shield-check" })]),
    el("h2", { text: state.profile.verified ? "You already have a Beacon" : "Earn your Beacon" }),
    el("p", { class: "muted", style: { maxWidth: "420px", margin: "0.5rem auto 1.25rem", lineHeight: "1.5" }, text: state.profile.verified
      ? "Your profile is verified — the Beacon shows next to your name everywhere."
      : "We'll ask your browser for your approximate location. We use it once to confirm you're a real person in a real place. We don't track you afterward."
    }),
    state.profile.verified ? null : el("button", { class: "btn btn-primary", onClick: doVerify }, [el("i", { "data-lucide": "shield-check" }), "Enable Location & Get My Beacon"])
  ]);
  inner.append(card);
  view.append(inner);
}
async function doVerify() {
  if (!navigator.geolocation) { toast("Your browser doesn't support location", "error", "alert-circle"); return; }
  toast("Asking for location…", "info", "map-pin");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    let label = null;
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`);
      const data = await r.json();
      label = [data.city, data.principalSubdivision, data.countryName].filter(Boolean).join(", ");
    } catch {}
    await grantBeacon(state.user.uid, label);
    state.profile = await getUserProfile(state.user.uid);
    celebrate();
    toast("Beacon granted", "success", "shield-check");
    setTimeout(() => router(), 600);
  }, (err) => {
    toast(err.code === 1 ? "Location permission denied" : "Could not get location", "error", "alert-circle");
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}
function celebrate() {
  const root = el("div", { class: "celebrate" });
  document.body.append(root);
  const colors = ["hsl(var(--accent))", "hsl(var(--accent-2))", "white"];
  for (let i = 0; i < 60; i++) {
    const p = el("div", { class: "particle", style: {
      left: Math.random() * 100 + "vw",
      top: -10 + "px",
      background: colors[i % colors.length],
      animationDelay: (Math.random() * 0.4) + "s",
      animationDuration: (1.2 + Math.random() * 1.4) + "s"
    } });
    root.append(p);
  }
  setTimeout(() => root.remove(), 2400);
}

/* ============================================================
   SIDEBAR ME (signed-in card)
   ============================================================ */
function renderSidebarMe() {
  const wrap = $("#sidebar-me");
  if (!wrap || !state.profile) return;
  wrap.innerHTML = "";
  wrap.append(el("div", { class: "row gap-1", style: { padding: "0.5rem", background: "hsl(var(--surface))", borderRadius: "12px", border: "1px solid hsl(var(--border-soft))" } }, [
    avatar(state.profile, "sm"),
    el("div", { class: "flex-1", style: { minWidth: 0 } }, [
      (() => { const n = el("div", { class: "fw-600 truncate", text: state.profile.displayName }); if (state.profile.verified) n.append(beaconIcon()); return n; })(),
      el("div", { class: "text-xs muted truncate", text: "@" + state.profile.handle })
    ]),
    el("button", { class: "btn-icon", onClick: async () => await signOutUser(), title: "Sign out" }, [el("i", { "data-lucide": "log-out" })])
  ]));
  refreshIcons();
}

/* ============================================================
   GLOBAL LISTENERS (badges)
   ============================================================ */
let globalUnsubs = [];
function startGlobalListeners() {
  stopGlobalListeners();
  // Notifications badge
  globalUnsubs.push(listenNotifications(state.user.uid, items => {
    const unread = items.filter(n => !n.read).length;
    const b = $("#nav-notif-badge");
    b.textContent = String(unread);
    b.classList.toggle("hidden", unread === 0);
  }));
  // Chat badge
  globalUnsubs.push(listenMyChats(state.user.uid, chats => {
    const total = chats.reduce((sum, c) => sum + (c.unread?.[state.user.uid] || 0), 0);
    const b = $("#nav-signals-badge");
    b.textContent = String(total);
    b.classList.toggle("hidden", total === 0);
    $("#bn-signals-dot").classList.toggle("hidden", total === 0);
  }));
}
function stopGlobalListeners() { globalUnsubs.forEach(u => u()); globalUnsubs = []; }

/* ============================================================
   BOOT
   ============================================================ */
function showAuthScreen() {
  $("#boot").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
  $("#app-shell").classList.add("hidden");
}
function showAppShell() {
  $("#boot").classList.add("hidden");
  $("#auth-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  refreshIcons();
}

setupAuthScreen();

$("#btn-compose").addEventListener("click", () => openCompose());
$("#bn-compose").addEventListener("click", () => openCompose());
$("#btn-theme")?.addEventListener("click", toggleTheme);
// Run once on boot to sync the toggle icon
applyTheme(localStorage.getItem("orbit:theme") || "dark");

// Default route
if (!location.hash) location.hash = "#/stream";

watchAuth(async (user) => {
  if (!user) {
    state.user = null;
    state.profile = null;
    teardown();
    stopGlobalListeners();
    showAuthScreen();
    return;
  }
  state.user = user;
  state.profile = await ensureUserProfile(user);
  state.cache.profilesByUid.set(user.uid, state.profile);
  if (state.profile.accent) applyAccent(state.profile.accent);
  showAppShell();
  renderSidebarMe();
  startGlobalListeners();
  router();
});

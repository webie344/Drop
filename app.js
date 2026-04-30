// =========================================================================
// Orbit — app.js
// Firebase init + Auth + Cloudinary + Router + Feed + Reels + Groups +
// Profile + Settings + Theme + Verified-by-location.
// Chat + DM logic lives in chat.js (it imports state from this file).
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, GoogleAuthProvider,
  signInWithPopup, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, onSnapshot, getDocs,
  serverTimestamp, increment, arrayUnion, arrayRemove, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// =========================================================================
// 1. CONFIG — REPLACE THESE BEFORE HOSTING
// =========================================================================

// Firebase: get from https://console.firebase.google.com → Project Settings → Your apps
export const firebaseConfig = {
  apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

// Cloudinary: get from https://cloudinary.com → Settings → Upload → Upload presets
// 1) Create an UNSIGNED preset (recommended for client-side uploads)
// 2) Put your cloud name + the preset name below
export const cloudinaryConfig = {
  cloudName:    "ddtdqrh1b",
  uploadPreset: "profile-pictures",
};

// =========================================================================
// 2. INIT
// =========================================================================
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Globals shared with chat.js
export const state = {
  me: null,           // current user profile doc (from /users/{uid})
  uid: null,          // current uid
  chatsUnsub: null,   // unsubscribe for chats list listener
  chatUnsub: null,    // unsubscribe for active chat messages listener
  activeChat: null,   // currently open chat doc id
  cache: {
    users: new Map(), // uid -> profile snapshot
  },
};

// =========================================================================
// 3. UTILITIES
// =========================================================================
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "data") for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
};

export const fmtTime = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const fmtDay = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
};

export const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

export const linkify = (s = "") =>
  escapeHtml(s).replace(/(https?:\/\/[^\s]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);

export const toast = (msg, ms = 2200) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
};

export const avatarFor = (u) =>
  u?.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(u?.uid || u?.username || "x")}`;

export const fetchUser = async (uid) => {
  if (!uid) return null;
  if (state.cache.users.has(uid)) return state.cache.users.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? { uid, ...snap.data() } : null;
  if (data) state.cache.users.set(uid, data);
  return data;
};

// =========================================================================
// 4. CLOUDINARY UPLOAD
// =========================================================================
export const uploadToCloudinary = async (file, kind = "image") => {
  if (!file) return null;
  if (cloudinaryConfig.cloudName.startsWith("YOUR_")) {
    toast("Cloudinary not configured — set cloudName + uploadPreset in app.js");
    throw new Error("Cloudinary not configured");
  }
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${kind === "video" ? "video" : "image"}/upload`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", cloudinaryConfig.uploadPreset);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error("Upload failed");
  const json = await res.json();
  return { url: json.secure_url, publicId: json.public_id, type: kind, width: json.width, height: json.height, duration: json.duration };
};

// =========================================================================
// 5. THEME
// =========================================================================
const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("orbit:theme", theme);
  $("#themeToggle")?.querySelector("i")?.classList.toggle("ri-sun-line", theme === "dark");
  $("#themeToggle")?.querySelector("i")?.classList.toggle("ri-moon-line", theme === "light");
};
const initTheme = () => applyTheme(localStorage.getItem("orbit:theme") || "dark");
const toggleTheme = () =>
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

// =========================================================================
// 6. AUTH FLOW
// =========================================================================
const showAuth = () => { $("#auth").classList.remove("hidden"); $("#app").classList.add("hidden"); $("#boot").classList.add("hidden"); };
const showApp  = () => { $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden"); $("#boot").classList.add("hidden"); };

const ensureUserDoc = async (user, extras = {}) => {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const username = (extras.username || (user.email?.split("@")[0]) || `u${Date.now()}`).toLowerCase().replace(/[^a-z0-9_]/g, "");
    const profile = {
      uid: user.uid,
      name: extras.name || user.displayName || username,
      username,
      email: user.email || null,
      photoURL: user.photoURL || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.uid}`,
      bio: "",
      verified: false,                // becomes true after location grant
      verifiedAt: null,
      location: null,                 // { lat, lng, city }
      followers: [],
      following: [],
      themePref: "dark",
      online: true,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return profile;
  }
  // mark online + lastSeen
  await updateDoc(ref, { online: true, lastSeen: serverTimestamp() });
  return { uid: user.uid, ...snap.data(), online: true };
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    state.me = null; state.uid = null;
    showAuth();
    return;
  }
  state.uid = user.uid;
  state.me = await ensureUserDoc(user);
  $("#meAvatar").src = avatarFor(state.me);
  showApp();
  startMyProfileListener();
  startSuggestions();
  router(); // initial route
  watchOfflineOnUnload();
  // Notify chat module
  document.dispatchEvent(new CustomEvent("orbit:auth-ready", { detail: state.me }));
});

const watchOfflineOnUnload = () => {
  const off = async () => {
    try { await updateDoc(doc(db, "users", state.uid), { online: false, lastSeen: serverTimestamp() }); } catch {}
  };
  window.addEventListener("beforeunload", off);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") off();
    else if (state.uid) updateDoc(doc(db, "users", state.uid), { online: true, lastSeen: serverTimestamp() }).catch(() => {});
  });
};

const startMyProfileListener = () => {
  return onSnapshot(doc(db, "users", state.uid), (snap) => {
    if (snap.exists()) {
      state.me = { uid: state.uid, ...snap.data() };
      $("#meAvatar").src = avatarFor(state.me);
    }
  });
};

// Auth UI bindings
$$(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".auth-tab").forEach((t) => t.classList.toggle("active", t === tab));
    const which = tab.dataset.tab;
    $("#signinForm").classList.toggle("hidden", which !== "signin");
    $("#signupForm").classList.toggle("hidden", which !== "signup");
  });
});

$("#signinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await signInWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
  } catch (err) { toast(err.message.replace("Firebase: ", "")); }
});

$("#signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = fd.get("name"), username = fd.get("username");
  try {
    const cred = await createUserWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user, { name, username });
  } catch (err) { toast(err.message.replace("Firebase: ", "")); }
});

$("#googleBtn").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (err) { toast(err.message.replace("Firebase: ", "")); }
});

$("#signOutBtn").addEventListener("click", async () => {
  try {
    if (state.uid) await updateDoc(doc(db, "users", state.uid), { online: false, lastSeen: serverTimestamp() });
  } catch {}
  await signOut(auth);
});

$("#themeToggle").addEventListener("click", toggleTheme);
$("#themeAuthToggle")?.addEventListener("click", toggleTheme);

// =========================================================================
// 7. ROUTER
// =========================================================================
const routes = ["feed", "reels", "chats", "groups", "explore", "saved", "settings", "profile"];

const router = () => {
  const hash = (location.hash || "#feed").replace(/^#/, "");
  const [route, ...rest] = hash.split("/");
  const target = routes.includes(route) ? route : "feed";

  $$(".nav-item, .bn").forEach((b) => b.classList.toggle("active", b.dataset.route === target));

  const content = $("#content");
  content.innerHTML = "";

  switch (target) {
    case "feed":     return renderFeed(content);
    case "reels":    return renderReels(content);
    case "chats":    return document.dispatchEvent(new CustomEvent("orbit:open-chats", { detail: { peerUid: rest[0] || null } }));
    case "groups":   return renderGroups(content);
    case "explore":  return renderExplore(content);
    case "saved":    return renderSaved(content);
    case "settings": return renderSettings(content);
    case "profile":  return renderProfile(content, rest[0] || state.uid);
  }
};
window.addEventListener("hashchange", router);
$$(".nav-item, .bn, .brand").forEach((b) => {
  if (!b.dataset.route) return;
  b.addEventListener("click", () => { location.hash = "#" + b.dataset.route; });
});
$("#meBtn").addEventListener("click", () => { location.hash = "#profile"; });
$("#openSidebar")?.addEventListener("click", () => { $("#sidebar").classList.toggle("hidden"); });

// =========================================================================
// 8. FEED — flat IG/FB style with separator lines + Trending lane
// =========================================================================
const renderFeed = (root) => {
  const wrap = el("div", { class: "feed-wrap" });

  const stub = el("div", { class: "composer-stub" },
    el("img", { class: "avatar sm", src: avatarFor(state.me) }),
    el("button", { onclick: () => openCompose("post") }, `What's orbiting your mind, ${state.me.name.split(" ")[0]}?`)
  );
  wrap.appendChild(stub);

  // Trending lane container (filled later)
  const trendingLane = el("div", { class: "trending-lane hidden" });
  trendingLane.appendChild(el("div", { class: "trending-head" },
    el("i", { class: "ri-fire-fill" }), "Trending in your orbit"
  ));
  const trendingScroller = el("div", { class: "trending-scroller" });
  trendingLane.appendChild(trendingScroller);
  wrap.appendChild(trendingLane);

  // Posts container
  const list = el("div", { class: "feed-list" });
  list.appendChild(el("div", { class: "empty" },
    el("i", { class: "ri-loader-4-line" }),
    el("div", { class: "t" }, "Loading your orbit"),
  ));
  wrap.appendChild(list);
  root.appendChild(wrap);

  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  const unsub = onSnapshot(q, async (snap) => {
    list.innerHTML = "";
    trendingScroller.innerHTML = "";
    if (snap.empty) {
      list.appendChild(el("div", { class: "empty" },
        el("i", { class: "ri-planet-line" }),
        el("div", { class: "t" }, "Your orbit is quiet"),
        el("div", {}, "Be the first to post — tap Create above."),
      ));
      return;
    }

    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // resolve authors
    const authors = await Promise.all([...new Set(posts.map((p) => p.authorUid))].map(fetchUser));
    const byUid = Object.fromEntries(authors.filter(Boolean).map((u) => [u.uid, u]));

    // Trending = top 5 by orbitCount with at least 3 orbits
    const trending = [...posts].filter((p) => (p.orbitCount || 0) >= 3)
      .sort((a, b) => (b.orbitCount || 0) - (a.orbitCount || 0)).slice(0, 5);
    if (trending.length) {
      trendingLane.classList.remove("hidden");
      trending.forEach((p) => trendingScroller.appendChild(renderTrendingCard(p, byUid[p.authorUid])));
    } else {
      trendingLane.classList.add("hidden");
    }

    posts.forEach((p) => list.appendChild(renderPost(p, byUid[p.authorUid])));
  });

  // store unsub on root so route changes clean up
  root._unsub = unsub;
};

const renderTrendingCard = (p, author) => {
  return el("div", { class: "trending-card", onclick: () => location.hash = `#feed` /* stays; could open detail */ },
    el("div", { class: "t-head" },
      el("img", { class: "avatar xs", src: avatarFor(author) }),
      el("div", { class: "t-name" }, author?.name || "User"),
    ),
    el("div", { class: "t-text", text: (p.text || "").slice(0, 140) }),
    el("div", { class: "t-meta" },
      el("i", { class: "ri-fire-fill", style: "color: var(--grad-2);" }),
      `${p.orbitCount || 0} Orbits · ${fmtTime(p.createdAt)}`
    ),
  );
};

const renderPost = (p, author) => {
  const iOrbited = (p.orbits || []).includes(state.uid);
  const isMine = p.authorUid === state.uid;
  const trending = (p.orbitCount || 0) >= 3;

  const post = el("article", { class: `post${trending ? " is-trending" : ""}` });

  const head = el("div", { class: "post-head" },
    el("img", { class: "avatar md", src: avatarFor(author), onclick: () => location.hash = `#profile/${author?.uid}` }),
    el("div", { class: "meta" },
      el("div", { class: "name" },
        author?.name || "User",
        author?.verified ? el("span", { class: "verified", title: "Location verified", html: '<i class="ri-check-line"></i>' }) : null,
      ),
      el("div", { class: "sub" },
        `@${author?.username || "user"}`,
        el("span", { class: "dot" }, "·"),
        fmtTime(p.createdAt),
      )
    ),
    isMine ? el("button", { class: "icon-btn more", onclick: async () => {
      if (confirm("Delete this post?")) {
        await deleteDoc(doc(db, "posts", p.id));
        toast("Post deleted");
      }
    }}, el("i", { class: "ri-more-2-line" })) : null,
  );
  post.appendChild(head);

  if (p.text) {
    const body = el("div", { class: "post-text" });
    body.innerHTML = linkify(p.text);
    post.appendChild(body);
  }
  if (p.media?.url) {
    const m = el("div", { class: "post-media" }, el("img", { src: p.media.url, loading: "lazy" }));
    post.appendChild(m);
  }

  // Actions
  const actions = el("div", { class: "post-actions" },
    el("button", { class: "post-act", onclick: () => focusComment(p.id) },
      el("i", { class: "ri-chat-1-line" }),
      String(p.commentCount || 0),
    ),
    el("button", { class: "post-act", onclick: async () => {
      const url = `${location.origin}${location.pathname}#feed`;
      try { await navigator.share?.({ title: "Orbit", text: p.text || "Check this out", url }); }
      catch { await navigator.clipboard.writeText(url); toast("Link copied"); }
    }},
      el("i", { class: "ri-share-forward-line" }),
      "Share",
    ),
    el("button", { class: "post-act", onclick: () => toggleSave(p.id) },
      el("i", { class: (state.me?.saved || []).includes(p.id) ? "ri-bookmark-fill" : "ri-bookmark-line" }),
    ),
    // The special "Orbit" reaction — separates posts in the feed
    el("button", { class: `post-act orbit${iOrbited ? " active" : ""}`, onclick: () => toggleOrbit(p) },
      el("i", { class: iOrbited ? "ri-fire-fill" : "ri-fire-line" }),
      "Orbit · ", String(p.orbitCount || 0),
    ),
  );
  post.appendChild(actions);

  // Comments preview (top 2)
  const cBox = el("div", { class: "comments hidden" });
  post.appendChild(cBox);

  const cForm = el("form", { class: "comment-form" },
    el("img", { class: "avatar xs", src: avatarFor(state.me) }),
    el("input", { type: "text", placeholder: "Write a comment…" }),
    el("button", { class: "icon-btn", type: "submit" }, el("i", { class: "ri-send-plane-fill" })),
  );
  cForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = cForm.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await addDoc(collection(db, "posts", p.id, "comments"), {
      text, authorUid: state.uid, createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "posts", p.id), { commentCount: increment(1) });
  });
  post.appendChild(cForm);

  // Live comments
  onSnapshot(query(collection(db, "posts", p.id, "comments"), orderBy("createdAt", "desc"), limit(20)),
    async (snap) => {
      cBox.innerHTML = "";
      if (snap.empty) { cBox.classList.add("hidden"); return; }
      cBox.classList.remove("hidden");
      const comments = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      const authors = await Promise.all([...new Set(comments.map((c) => c.authorUid))].map(fetchUser));
      const map = Object.fromEntries(authors.filter(Boolean).map((u) => [u.uid, u]));
      comments.forEach((c) => {
        const a = map[c.authorUid];
        cBox.appendChild(el("div", { class: "comment" },
          el("img", { class: "avatar xs", src: avatarFor(a) }),
          el("div", { class: "body" },
            el("div", { class: "name" }, a?.name || "User",
              a?.verified ? el("span", { class: "verified", html: '<i class="ri-check-line"></i>' }) : null),
            el("div", { class: "text", text: c.text }),
          ),
        ));
      });
    });

  post._focusComment = () => cForm.querySelector("input").focus();
  return post;
};

const focusComment = (postId) => {
  const node = $$(`.post`).find((n) => n._postId === postId);
  node?._focusComment?.();
};

const toggleOrbit = async (p) => {
  const ref = doc(db, "posts", p.id);
  const has = (p.orbits || []).includes(state.uid);
  await updateDoc(ref, {
    orbits: has ? arrayRemove(state.uid) : arrayUnion(state.uid),
    orbitCount: increment(has ? -1 : 1),
  });
};

const toggleSave = async (postId) => {
  const ref = doc(db, "users", state.uid);
  const has = (state.me.saved || []).includes(postId);
  await updateDoc(ref, { saved: has ? arrayRemove(postId) : arrayUnion(postId) });
  toast(has ? "Removed from Saved" : "Saved");
};

// =========================================================================
// 9. REELS
// =========================================================================
const renderReels = (root) => {
  const wrap = el("div", { class: "reels-wrap" });
  root.appendChild(wrap);

  const q = query(collection(db, "reels"), orderBy("createdAt", "desc"), limit(30));
  onSnapshot(q, async (snap) => {
    wrap.innerHTML = "";
    if (snap.empty) {
      wrap.appendChild(el("div", { class: "empty", style: "color:white;height:100%;display:grid;place-items:center;" },
        el("i", { class: "ri-film-line" }),
        el("div", { class: "t" }, "No reels yet"),
        el("div", {}, "Tap Create → Reel to upload one."),
      ));
      return;
    }
    const reels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const authors = await Promise.all([...new Set(reels.map((r) => r.authorUid))].map(fetchUser));
    const map = Object.fromEntries(authors.filter(Boolean).map((u) => [u.uid, u]));
    reels.forEach((r) => wrap.appendChild(renderReel(r, map[r.authorUid])));
    // Autoplay first, intersection-pause others
    const vids = wrap.querySelectorAll("video");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.intersectionRatio > 0.7) v.play().catch(() => {});
        else v.pause();
      });
    }, { threshold: [0, 0.7, 1] });
    vids.forEach((v) => io.observe(v));
  });
};

const renderReel = (r, author) => {
  const liked = (r.likes || []).includes(state.uid);
  const node = el("div", { class: "reel" },
    el("video", { src: r.media.url, loop: true, playsinline: "", muted: "true", "webkit-playsinline": "", onclick: (e) => {
      e.target.muted = !e.target.muted;
    }}),
    el("div", { class: "reel-overlay" }),
    el("div", { class: "reel-info" },
      el("div", { class: "name" },
        el("img", { class: "avatar xs", src: avatarFor(author) }),
        author?.name || "User",
        author?.verified ? el("span", { class: "verified", html: '<i class="ri-check-line"></i>' }) : null,
      ),
      el("div", { class: "caption", text: r.caption || "" }),
    ),
    el("div", { class: "reel-actions" },
      el("button", { class: `reel-act${liked ? " active" : ""}`, onclick: async () => {
        await updateDoc(doc(db, "reels", r.id), {
          likes: liked ? arrayRemove(state.uid) : arrayUnion(state.uid),
          likeCount: increment(liked ? -1 : 1),
        });
      }},
        el("i", { class: liked ? "ri-heart-fill" : "ri-heart-line" }),
        String(r.likeCount || 0),
      ),
      el("button", { class: "reel-act", onclick: () => toast("Comments coming soon for reels — they live on the post page.") },
        el("i", { class: "ri-chat-3-line" }),
        String(r.commentCount || 0),
      ),
      el("button", { class: "reel-act", onclick: async () => {
        try { await navigator.share?.({ title: "Reel on Orbit", url: r.media.url }); }
        catch { await navigator.clipboard.writeText(r.media.url); toast("Link copied"); }
      }},
        el("i", { class: "ri-share-forward-line" }),
        "Share",
      ),
    ),
  );
  return node;
};

// =========================================================================
// 10. GROUPS
// =========================================================================
const renderGroups = (root) => {
  const head = el("div", { class: "section-head" },
    el("h2", {}, "Groups"),
    el("div", { class: "right" },
      el("button", { class: "btn primary", onclick: () => openCompose("group") },
        el("i", { class: "ri-add-line" }), "New group"),
    ),
  );
  root.appendChild(head);

  const grid = el("div", { class: "group-grid" });
  root.appendChild(grid);

  onSnapshot(query(collection(db, "groups"), orderBy("createdAt", "desc"), limit(60)), (snap) => {
    grid.innerHTML = "";
    if (snap.empty) {
      grid.appendChild(el("div", { class: "empty", style: "grid-column:1/-1;" },
        el("i", { class: "ri-group-2-line" }),
        el("div", { class: "t" }, "No groups yet"),
        el("div", {}, "Create a group to chat with multiple people in real time."),
      ));
      return;
    }
    snap.docs.forEach((d) => {
      const g = { id: d.id, ...d.data() };
      const member = (g.members || []).includes(state.uid);
      const card = el("div", { class: "group-card" },
        el("div", { class: "group-cover", text: (g.name || "?").slice(0, 1).toUpperCase() }),
        el("div", { class: "group-name", text: g.name }),
        el("div", { class: "group-meta", text: `${(g.members || []).length} members${g.isPublic ? " · public" : " · private"}` }),
        el("div", { class: "group-actions" },
          el("button", { class: `btn ${member ? "ghost" : "primary"}`, onclick: async () => {
            const ref = doc(db, "groups", g.id);
            if (member) {
              await updateDoc(ref, { members: arrayRemove(state.uid) });
              toast("Left group");
            } else {
              await updateDoc(ref, { members: arrayUnion(state.uid) });
              toast("Joined group");
            }
          }}, member ? "Leave" : "Join"),
          member ? el("button", { class: "btn ghost", onclick: () => location.hash = `#chats/${g.id}` },
            el("i", { class: "ri-chat-3-line" }), "Open") : null,
        ),
      );
      grid.appendChild(card);
    });
  });
};

// =========================================================================
// 11. EXPLORE / SAVED
// =========================================================================
const renderExplore = (root) => {
  const head = el("div", { class: "section-head" }, el("h2", {}, "Explore"));
  root.appendChild(head);
  const grid = el("div", { class: "grid-3" });
  root.appendChild(grid);

  onSnapshot(query(collection(db, "posts"), orderBy("orbitCount", "desc"), limit(60)), (snap) => {
    grid.innerHTML = "";
    if (snap.empty) {
      grid.appendChild(el("div", { class: "empty", style: "grid-column:1/-1;" },
        el("i", { class: "ri-compass-3-line" }), el("div", { class: "t" }, "Nothing to explore yet")));
      return;
    }
    snap.docs.forEach((d) => {
      const p = d.data();
      const cell = el("div", { class: "cell", onclick: () => location.hash = "#feed" });
      if (p.media?.url) cell.appendChild(el("img", { src: p.media.url, loading: "lazy" }));
      else cell.appendChild(el("div", {
        style: "padding:12px;font-size:13px;color:var(--text-dim);width:100%;height:100%;display:grid;place-items:center;text-align:center;",
        text: (p.text || "").slice(0, 80),
      }));
      grid.appendChild(cell);
    });
  });
};

const renderSaved = (root) => {
  const head = el("div", { class: "section-head" }, el("h2", {}, "Saved"));
  root.appendChild(head);
  const list = el("div", { class: "feed-wrap" });
  root.appendChild(list);

  const ids = state.me.saved || [];
  if (!ids.length) {
    list.appendChild(el("div", { class: "empty" },
      el("i", { class: "ri-bookmark-line" }),
      el("div", { class: "t" }, "Nothing saved yet"),
      el("div", {}, "Tap the bookmark on any post to save it here.")));
    return;
  }
  Promise.all(ids.map((id) => getDoc(doc(db, "posts", id)))).then(async (docs) => {
    const posts = docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() }));
    const authors = await Promise.all([...new Set(posts.map((p) => p.authorUid))].map(fetchUser));
    const map = Object.fromEntries(authors.filter(Boolean).map((u) => [u.uid, u]));
    posts.forEach((p) => list.appendChild(renderPost(p, map[p.authorUid])));
  });
};

// =========================================================================
// 12. PROFILE
// =========================================================================
const renderProfile = async (root, uid) => {
  const u = await fetchUser(uid);
  if (!u) {
    root.appendChild(el("div", { class: "empty" }, el("i", { class: "ri-user-line" }), el("div", { class: "t" }, "User not found")));
    return;
  }
  const isMe = uid === state.uid;
  const iFollow = (state.me.following || []).includes(uid);

  root.appendChild(el("div", { class: "profile-head" },
    el("img", { class: "avatar xl", src: avatarFor(u) }),
    el("div", {},
      el("div", { class: "name-row" }, u.name,
        u.verified ? el("span", { class: "verified lg", title: "Location verified", html: '<i class="ri-check-line"></i>' }) : null),
      el("div", { class: "uname" }, "@" + u.username),
      el("div", { class: "stats" },
        el("div", { class: "stat" }, el("strong", {}, String((u.followers || []).length)), el("span", {}, "followers")),
        el("div", { class: "stat" }, el("strong", {}, String((u.following || []).length)), el("span", {}, "following")),
      ),
      u.bio ? el("div", { class: "bio", text: u.bio }) : null,
      el("div", { class: "profile-actions" },
        isMe
          ? el("button", { class: "btn ghost", onclick: editProfile }, el("i", { class: "ri-edit-line" }), "Edit profile")
          : el("button", { class: "btn primary", onclick: async () => {
              const meRef = doc(db, "users", state.uid);
              const themRef = doc(db, "users", uid);
              const batch = writeBatch(db);
              if (iFollow) {
                batch.update(meRef, { following: arrayRemove(uid) });
                batch.update(themRef, { followers: arrayRemove(state.uid) });
              } else {
                batch.update(meRef, { following: arrayUnion(uid) });
                batch.update(themRef, { followers: arrayUnion(state.uid) });
              }
              await batch.commit();
              router();
            }}, iFollow ? "Following" : "Follow"),
        !isMe ? el("button", { class: "btn ghost", onclick: () => location.hash = `#chats/${uid}` },
          el("i", { class: "ri-chat-3-line" }), "Message") : null,
        isMe && !u.verified ? el("button", { class: "btn ghost", onclick: requestLocationVerification },
          el("i", { class: "ri-shield-check-line" }), "Get verified") : null,
      ),
    ),
  ));

  const tabs = el("div", { class: "profile-tabs" },
    el("button", { class: "profile-tab active", "data-ptab": "posts" }, "Posts"),
    el("button", { class: "profile-tab", "data-ptab": "reels" }, "Reels"),
    el("button", { class: "profile-tab", "data-ptab": "tagged" }, "About"),
  );
  root.appendChild(tabs);
  const body = el("div", {});
  root.appendChild(body);

  const renderTab = async (which) => {
    body.innerHTML = "";
    if (which === "posts") {
      const grid = el("div", { class: "grid-3" }); body.appendChild(grid);
      const qs = await getDocs(query(collection(db, "posts"), where("authorUid", "==", uid), orderBy("createdAt", "desc"), limit(60)));
      if (qs.empty) {
        body.appendChild(el("div", { class: "empty" }, el("i", { class: "ri-image-line" }), el("div", { class: "t" }, "No posts yet"))); return;
      }
      qs.forEach((d) => {
        const p = d.data();
        const cell = el("div", { class: "cell" });
        if (p.media?.url) cell.appendChild(el("img", { src: p.media.url, loading: "lazy" }));
        else cell.appendChild(el("div", { style: "padding:10px;font-size:13px;", text: (p.text || "").slice(0, 80) }));
        grid.appendChild(cell);
      });
    } else if (which === "reels") {
      const grid = el("div", { class: "grid-3" }); body.appendChild(grid);
      const qs = await getDocs(query(collection(db, "reels"), where("authorUid", "==", uid), orderBy("createdAt", "desc"), limit(30)));
      if (qs.empty) { body.appendChild(el("div", { class: "empty" }, el("i", { class: "ri-film-line" }), el("div", { class: "t" }, "No reels yet"))); return; }
      qs.forEach((d) => {
        const r = d.data();
        const cell = el("div", { class: "cell" }, el("video", { src: r.media.url, muted: "true", playsinline: "" }));
        grid.appendChild(cell);
      });
    } else {
      body.appendChild(el("div", { class: "settings" },
        el("div", { class: "group" },
          el("h3", {}, "About"),
          el("div", { class: "row" }, el("div", { class: "label" }, el("div", { class: "t" }, "Joined"), el("div", { class: "d" }, fmtTime(u.createdAt) || "—"))),
          u.location ? el("div", { class: "row" }, el("div", { class: "label" }, el("div", { class: "t" }, "Verified location"), el("div", { class: "d" }, u.location.city || `${u.location.lat?.toFixed(2)}, ${u.location.lng?.toFixed(2)}`))) : null,
          el("div", { class: "row" }, el("div", { class: "label" }, el("div", { class: "t" }, "Status"), el("div", { class: "d" }, u.online ? "Online now" : `Last seen ${fmtTime(u.lastSeen)}`))),
        ),
      ));
    }
  };
  renderTab("posts");
  $$(".profile-tab", tabs).forEach((t) => t.addEventListener("click", () => {
    $$(".profile-tab", tabs).forEach((x) => x.classList.toggle("active", x === t));
    renderTab(t.dataset.ptab);
  }));
};

const editProfile = async () => {
  const name = prompt("Name", state.me.name); if (name == null) return;
  const bio = prompt("Bio (1-line)", state.me.bio || ""); if (bio == null) return;
  await updateDoc(doc(db, "users", state.uid), { name, bio });
  toast("Profile updated");
  router();
};

// =========================================================================
// 13. SETTINGS — theme, verification, notifications
// =========================================================================
const renderSettings = (root) => {
  const wrap = el("div", { class: "settings" },
    el("h2", { style: "margin-top:0;font-family:var(--font-display);" }, "Settings"),

    el("div", { class: "group" },
      el("h3", {}, "Appearance"),
      el("div", { class: "row" },
        el("div", { class: "label" },
          el("div", { class: "t" }, "Theme"),
          el("div", { class: "d" }, "Choose between light and dark — saved across devices."),
        ),
        el("div", { class: `switch ${document.documentElement.getAttribute("data-theme") === "dark" ? "on" : ""}`, onclick: (e) => {
          toggleTheme();
          e.currentTarget.classList.toggle("on");
          updateDoc(doc(db, "users", state.uid), { themePref: document.documentElement.getAttribute("data-theme") }).catch(() => {});
        }}),
      ),
    ),

    el("div", { class: "group" },
      el("h3", {}, "Verification"),
      el("div", { class: "row" },
        el("div", { class: "label" },
          el("div", { class: "t" }, state.me.verified ? "Verified ✓" : "Get verified by location"),
          el("div", { class: "d" }, state.me.verified
            ? `You're verified${state.me.location?.city ? " in " + state.me.location.city : ""}.`
            : "Allow Orbit to read your location once. We only store an approximate area, never live tracking."),
        ),
        state.me.verified
          ? el("button", { class: "btn ghost", onclick: async () => {
              await updateDoc(doc(db, "users", state.uid), { verified: false, location: null });
              toast("Verification removed");
              router();
            }}, "Remove")
          : el("button", { class: "btn primary", onclick: requestLocationVerification }, "Verify"),
      ),
    ),

    el("div", { class: "group" },
      el("h3", {}, "Notifications"),
      el("div", { class: "row" },
        el("div", { class: "label" },
          el("div", { class: "t" }, "Browser notifications"),
          el("div", { class: "d" }, "Get pings for new messages and Orbits.")),
        el("button", { class: "btn ghost", onclick: async () => {
          const p = await Notification.requestPermission();
          toast(p === "granted" ? "Notifications enabled" : "Notifications denied");
        }}, "Enable"),
      ),
    ),

    el("div", { class: "group" },
      el("h3", {}, "Account"),
      el("div", { class: "row" }, el("div", { class: "label" }, el("div", { class: "t" }, "Email"), el("div", { class: "d" }, state.me.email || "—"))),
      el("div", { class: "row" }, el("div", { class: "label" }, el("div", { class: "t" }, "Username"), el("div", { class: "d" }, "@" + state.me.username))),
      el("div", { class: "row" },
        el("div", { class: "label" }, el("div", { class: "t" }, "Sign out"), el("div", { class: "d" }, "End your session on this device.")),
        el("button", { class: "btn ghost", onclick: () => $("#signOutBtn").click() }, "Sign out"),
      ),
    ),

    el("div", { class: "group" },
      el("h3", {}, "Storage"),
      el("div", { class: "row" }, el("div", { class: "label" },
        el("div", { class: "t" }, "Cloudinary"),
        el("div", { class: "d" }, cloudinaryConfig.cloudName.startsWith("YOUR_")
          ? "Not configured — uploads will fail until you set cloudName + uploadPreset in app.js."
          : `Connected to "${cloudinaryConfig.cloudName}"`)),
      ),
    ),
  );
  root.appendChild(wrap);
};

// Verification by location (one-time geolocation)
const requestLocationVerification = () => {
  if (!("geolocation" in navigator)) { toast("Location not available on this device"); return; }
  toast("Requesting location…");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    let city = null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
      const j = await r.json();
      city = j.address?.city || j.address?.town || j.address?.state || j.display_name?.split(",")[0] || null;
    } catch {}
    await updateDoc(doc(db, "users", state.uid), {
      verified: true,
      verifiedAt: serverTimestamp(),
      location: { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, city },
    });
    toast("✓ You're verified");
    router();
  }, (err) => {
    toast("Location denied — verification not granted");
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
};

// =========================================================================
// 14. COMPOSE MODAL — posts, reels, groups
// =========================================================================
const composeModal = $("#composeModal");
const openCompose = (which = "post") => {
  composeModal.classList.remove("hidden");
  $$(".ct").forEach((b) => b.classList.toggle("active", b.dataset.ctab === which));
  $$(".compose-pane").forEach((p) => p.classList.toggle("hidden", !p.id.startsWith(which)));
};
$("#composeBtn")?.addEventListener("click", () => openCompose("post"));
$("#composeBtnMobile")?.addEventListener("click", () => openCompose("post"));
$$(".ct").forEach((b) => b.addEventListener("click", () => openCompose(b.dataset.ctab)));

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]") || e.target.closest("[data-close-modal]")) {
    composeModal.classList.add("hidden");
  }
  if (e.target.matches("[data-close-drawer]") || e.target.closest("[data-close-drawer]")) {
    $("#chatCustomize").classList.add("hidden");
  }
});

// Post media preview
let postFile = null;
$("#postPickMedia").addEventListener("click", () => $("#postMedia").click());
$("#postMedia").addEventListener("change", (e) => {
  postFile = e.target.files[0] || null;
  const prev = $("#postPreview");
  prev.innerHTML = "";
  if (postFile) {
    const url = URL.createObjectURL(postFile);
    prev.appendChild(el("img", { src: url }));
  }
});

$("#postForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = e.target.text.value.trim();
  if (!text && !postFile) return;
  let media = null;
  if (postFile) {
    toast("Uploading…");
    media = await uploadToCloudinary(postFile, "image");
  }
  await addDoc(collection(db, "posts"), {
    authorUid: state.uid, text, media,
    orbits: [], orbitCount: 0, commentCount: 0,
    createdAt: serverTimestamp(),
  });
  e.target.reset();
  postFile = null; $("#postPreview").innerHTML = "";
  composeModal.classList.add("hidden");
  toast("Posted");
});

$("#reelForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = $("#reelMedia").files[0];
  if (!file) return;
  toast("Uploading reel…");
  const media = await uploadToCloudinary(file, "video");
  await addDoc(collection(db, "reels"), {
    authorUid: state.uid, caption: e.target.caption.value.trim(), media,
    likes: [], likeCount: 0, commentCount: 0,
    createdAt: serverTimestamp(),
  });
  e.target.reset();
  composeModal.classList.add("hidden");
  toast("Reel uploaded");
  location.hash = "#reels";
});

$("#groupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const ref = await addDoc(collection(db, "groups"), {
    name: fd.get("name"),
    about: fd.get("about") || "",
    isPublic: fd.get("isPublic") === "on",
    ownerUid: state.uid,
    admins: [state.uid],
    members: [state.uid],
    createdAt: serverTimestamp(),
  });
  // Seed first system message in subcollection
  await addDoc(collection(db, "groups", ref.id, "messages"), {
    type: "system", text: `${state.me.name} created the group`,
    createdAt: serverTimestamp(),
  });
  e.target.reset();
  composeModal.classList.add("hidden");
  toast("Group created");
  location.hash = `#chats/${ref.id}`;
});

// =========================================================================
// 15. SUGGESTIONS + TRENDING right rail
// =========================================================================
const startSuggestions = () => {
  // Suggested users (latest accounts I don't follow)
  onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(8)), (snap) => {
    const list = $("#suggestList"); if (!list) return;
    list.innerHTML = "";
    snap.docs.forEach((d) => {
      const u = { uid: d.id, ...d.data() };
      if (u.uid === state.uid) return;
      const iFollow = (state.me.following || []).includes(u.uid);
      list.appendChild(el("div", { class: "suggest-row" },
        el("img", { class: "avatar sm", src: avatarFor(u), onclick: () => location.hash = `#profile/${u.uid}` }),
        el("div", { class: "meta" },
          el("div", { class: "name" }, u.name,
            u.verified ? el("span", { class: "verified", html: '<i class="ri-check-line"></i>' }) : null),
          el("div", { class: "uname" }, "@" + u.username),
        ),
        el("button", { class: `btn sm ${iFollow ? "ghost" : "primary"}`, onclick: async () => {
          const meRef = doc(db, "users", state.uid);
          const themRef = doc(db, "users", u.uid);
          const batch = writeBatch(db);
          if (iFollow) {
            batch.update(meRef, { following: arrayRemove(u.uid) });
            batch.update(themRef, { followers: arrayRemove(state.uid) });
          } else {
            batch.update(meRef, { following: arrayUnion(u.uid) });
            batch.update(themRef, { followers: arrayUnion(state.uid) });
          }
          await batch.commit();
        }}, iFollow ? "Following" : "Follow"),
      ));
    });
  });

  // Trending posts
  onSnapshot(query(collection(db, "posts"), orderBy("orbitCount", "desc"), limit(5)), (snap) => {
    const list = $("#trendList"); if (!list) return;
    list.innerHTML = "";
    snap.docs.forEach((d) => {
      const p = d.data();
      list.appendChild(el("div", {},
        el("div", { class: "trend-tag", text: (p.text || "Untitled").slice(0, 60) }),
        el("div", { class: "trend-meta" }, `${p.orbitCount || 0} Orbits · ${fmtTime(p.createdAt)}`),
      ));
    });
  });
};

// Search
$("#globalSearch").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const q1 = e.target.value.trim().toLowerCase().replace(/^@/, "");
  if (!q1) return;
  const qs = await getDocs(query(collection(db, "users"), where("username", ">=", q1), where("username", "<=", q1 + "\uf8ff"), limit(1)));
  if (qs.empty) { toast("No user found"); return; }
  location.hash = `#profile/${qs.docs[0].id}`;
});

// =========================================================================
// 16. INIT
// =========================================================================
initTheme();
// Hide boot once auth state resolved (handled in onAuthStateChanged)
setTimeout(() => $("#boot").classList.add("hidden"), 1200);

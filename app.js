/* =========================================================
   Halo — app.js
   Routing, views, interactions, customization
   ========================================================= */
(function () {
  "use strict";

  /* ============ tiny helpers ============ */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  };
  const escapeHtml = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
    const now = Date.now();
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const fmtClock = (ts) => {
    const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  const fmtDay = (ts) => {
    const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
    const that  = new Date(d); that.setHours(0, 0, 0, 0);
    if (that.getTime() === today.getTime()) return "Today";
    if (that.getTime() === yest.getTime())  return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  };
  const sameDay = (a, b) => {
    const da = new Date(a.seconds ? a.seconds * 1000 : a);
    const db = new Date(b.seconds ? b.seconds * 1000 : b);
    return da.toDateString() === db.toDateString();
  };

  /* ============ THEME ============ */
  const Theme = {
    set(mode) {
      document.documentElement.setAttribute("data-theme", mode);
      localStorage.setItem("halo.theme", mode);
    },
    toggle() {
      const cur = document.documentElement.getAttribute("data-theme") || "dark";
      Theme.set(cur === "dark" ? "light" : "dark");
    },
    init() {
      const saved = localStorage.getItem("halo.theme");
      if (saved) Theme.set(saved);
      else {
        const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
        Theme.set(prefersLight ? "light" : "dark");
      }
    }
  };
  Theme.init();

  /* ============ TOAST ============ */
  const Toast = (msg, ms = 2200) => {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(Toast._t);
    Toast._t = setTimeout(() => t.classList.remove("show"), ms);
  };

  /* ============ STATE ============ */
  const State = {
    user: null,
    users: [],
    usersById: {},
    beams: [],
    rooms: [],
    activeRoom: null,
    pendingReply: null,
    pendingImage: null,
    streamScroll: 0
  };
  function refreshUserMap() {
    State.usersById = {};
    State.users.forEach((u) => { State.usersById[u.uid] = u; });
    if (State.user) State.usersById[State.user.uid] = State.user;
  }
  function userOf(uid) { return State.usersById[uid] || { displayName: "Someone", handle: "?", photoURL: null, halo: false, uid }; }

  /* ============ ROUTER (hash) ============ */
  const Router = {
    routes: {},
    on(path, handler) { this.routes[path] = handler; return this; },
    onMatch(re, handler) { (this._regex = this._regex || []).push({ re, handler }); return this; },
    go(path) { window.location.hash = "#" + path; },
    current() { return window.location.hash.replace(/^#/, "") || "/"; },
    handle() {
      const path = this.current();
      // mark active nav
      $$(".nav-item, .bn-item").forEach((n) => {
        const r = n.getAttribute("data-route");
        if (!r) return;
        n.classList.toggle("active", r === path || (r !== "/" && path.startsWith(r)));
      });
      if (path === "/") {
        $$(".nav-item, .bn-item").forEach((n) => n.classList.toggle("active", n.getAttribute("data-route") === "/"));
      }
      if (this.routes[path]) return this.routes[path]();
      for (const { re, handler } of this._regex || []) {
        const m = path.match(re);
        if (m) return handler(...m.slice(1));
      }
      this.routes["/"] && this.routes["/"]();
    }
  };
  window.addEventListener("hashchange", () => Router.handle());

  /* ============ AVATAR / BADGES helpers ============ */
  function avatarHTML(u, size = "") {
    const img = u && u.photoURL
      ? `<img class="avatar ${size}" src="${u.photoURL}" alt="" />`
      : `<div class="avatar ${size}" style="display:grid;place-items:center;font-weight:700;color:var(--gold);background:var(--gold-soft);">${(u && u.displayName ? u.displayName[0] : "?").toUpperCase()}</div>`;
    const wrapClass = "avatar-wrap" + (u && u.halo ? " haloed" : "");
    return `<span class="${wrapClass}">${img}</span>`;
  }
  const haloBadge = (u) => (u && u.halo) ? `<span class="halo-badge" title="Halo'd"></span>` : "";

  /* ============ AUTH FLOW ============ */
  function bindAuthUI() {
    const tabs = $$(".auth-tab");
    const ind = $(".auth-tabs");
    const form = $("#auth-form");
    let mode = "signin";
    tabs.forEach((t) => {
      t.addEventListener("click", () => {
        mode = t.dataset.mode;
        tabs.forEach((x) => x.classList.toggle("active", x === t));
        ind.dataset.mode = mode;
        form.dataset.mode = mode;
        $("#auth-error").textContent = "";
      });
    });
    form.dataset.mode = "signin";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#auth-email").value.trim();
      const pass  = $("#auth-pass").value;
      const name  = $("#auth-name").value.trim() || email.split("@")[0];
      const submit = $(".auth-submit");
      submit.classList.add("loading");
      $("#auth-error").textContent = "";
      try {
        if (mode === "signup") await Halo.auth.signUp(email, pass, name);
        else await Halo.auth.signIn(email, pass);
      } catch (err) {
        $("#auth-error").textContent = (err && err.message) || "Couldn't continue.";
      } finally {
        submit.classList.remove("loading");
      }
    });
  }

  /* ============ MOUNT helpers ============ */
  const View = $("#view");
  function mount(node) {
    View.innerHTML = "";
    View.appendChild(node);
    window.scrollTo(0, 0);
  }
  function showSkeleton(count = 3) {
    const wrap = el("div", { class: "page" }, [
      el("div", { class: "page-head" }, [
        el("div", {}, [el("h1", { class: "page-title", text: "Loading…" })])
      ])
    ]);
    for (let i = 0; i < count; i++) wrap.appendChild(el("div", { class: "skeleton skel-beam" }));
    mount(wrap);
  }

  /* ============ STREAM PAGE ============ */
  let beamsUnsub = null;
  function renderStream() {
    showSkeleton(3);
    const me = State.user;

    const page = el("div", { class: "page stream-page" });
    const head = el("div", { class: "page-head" }, [
      el("div", {}, [
        el("h1", { class: "page-title", text: "Stream" }),
        el("p", { class: "page-sub", text: "Beams from people in your Orbit." })
      ]),
      el("button", {
        class: "refresh-btn",
        onclick: async (e) => {
          e.currentTarget.classList.add("spinning");
          State.beams = await Halo.beams.list();
          drawStream();
          setTimeout(() => e.currentTarget.classList.remove("spinning"), 600);
          Toast("Stream refreshed");
        },
        html: `<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> Refresh`
      })
    ]);
    const stream = el("div", { class: "stream", id: "stream-list" });
    page.appendChild(head); page.appendChild(stream);

    function drawStream() {
      stream.innerHTML = "";
      if (!State.beams.length) {
        stream.appendChild(el("div", { class: "empty", html:
          `<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6l4 4M5 19l4-4m6-6l4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div>
           <h3>Your Stream is quiet for now.</h3>
           <p>Add someone to your Orbit to see their Beams here.</p>`
        }));
        return;
      }
      State.beams.forEach((b, i) => {
        if (i > 0) stream.appendChild(el("div", { class: "beam-sep" }));
        stream.appendChild(beamCard(b));
      });
    }

    function beamCard(b) {
      const author = userOf(b.authorId);
      const sparkedByMe = (b.sparks || []).includes(me.uid);
      const card = el("article", { class: "beam", "data-beam": b.id });

      // head
      const head = el("div", { class: "beam-head" });
      head.innerHTML = `
        ${avatarHTML(author)}
        <div class="beam-author">
          <div class="beam-author-line">
            <span class="beam-author-name">${escapeHtml(author.displayName)}</span>
            ${haloBadge(author)}
            <span class="beam-handle">@${escapeHtml(author.handle || "you")}</span>
            <span class="beam-time">· ${fmtTime(b.createdAt)}</span>
          </div>
        </div>
      `;
      card.appendChild(head);

      // text
      if (b.text) card.appendChild(el("div", { class: "beam-text", text: b.text }));
      // image
      if (b.image) {
        const img = el("img", { class: "beam-image", src: b.image, alt: "", loading: "lazy" });
        img.addEventListener("click", () => window.open(b.image, "_blank"));
        card.appendChild(img);
      }

      // actions
      const sparkBtn = el("button", { class: "action-btn" + (sparkedByMe ? " sparked" : "") });
      sparkBtn.innerHTML = `
        <svg class="spark-ic" viewBox="0 0 24 24"><path d="M12 2.5l2.5 6 6.5.5-5 4.3 1.6 6.4L12 16.7 6.4 19.7 8 13.3 3 9l6.5-.5L12 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="${sparkedByMe ? "currentColor" : "none"}"/></svg>
        <span>${(b.sparks || []).length || ""}</span> Spark`;
      sparkBtn.addEventListener("click", async () => {
        const sparks = b.sparks || [];
        const i = sparks.indexOf(me.uid);
        if (i >= 0) sparks.splice(i, 1); else sparks.push(me.uid);
        b.sparks = sparks;
        const idx = State.beams.findIndex((x) => x.id === b.id);
        if (idx >= 0) State.beams[idx] = b;
        // optimistic re-render of just this card
        card.replaceWith(beamCard(b));
        await Halo.beams.toggleSpark(b.id, me.uid);
      });

      const commentBtn = el("button", { class: "action-btn" });
      commentBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg><span>${(b.comments || []).length || ""}</span> Reply`;
      commentBtn.addEventListener("click", () => commentsBox.classList.toggle("open"));

      const shareBtn = el("button", { class: "action-btn" });
      shareBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> Share`;
      shareBtn.addEventListener("click", async () => {
        const url = window.location.origin + window.location.pathname + "#/?beam=" + b.id;
        try { await navigator.clipboard.writeText(url); Toast("Link copied"); } catch { Toast("Couldn't copy"); }
      });

      const actions = el("div", { class: "beam-actions" }, [sparkBtn, commentBtn, shareBtn]);
      card.appendChild(actions);

      // comments
      const commentsBox = el("div", { class: "comments" });
      (b.comments || []).forEach((c) => commentsBox.appendChild(commentNode(c)));
      const cf = el("form", { class: "comment-form" });
      const cinput = el("input", { type: "text", placeholder: "Write a reply…" });
      const cbtn = el("button", { type: "submit", text: "Send" });
      cf.appendChild(cinput); cf.appendChild(cbtn);
      cf.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = cinput.value.trim();
        if (!text) return;
        cinput.value = "";
        const optimistic = { id: "opt" + Date.now(), authorId: me.uid, text, createdAt: Date.now() };
        commentsBox.insertBefore(commentNode(optimistic), cf);
        const saved = await Halo.beams.addComment(b.id, { authorId: me.uid, text });
        b.comments = b.comments || [];
        b.comments.push(saved);
      });
      commentsBox.appendChild(cf);
      card.appendChild(commentsBox);
      return card;
    }

    function commentNode(c) {
      const a = userOf(c.authorId);
      const node = el("div", { class: "comment" });
      node.innerHTML = `
        ${avatarHTML(a, "sm")}
        <div class="comment-body">
          <div class="comment-author">${escapeHtml(a.displayName)} ${haloBadge(a)}</div>
          <div class="comment-text">${escapeHtml(c.text)}</div>
        </div>
      `;
      return node;
    }

    // Initial mount once first data arrives
    setTimeout(() => {
      mount(page);
      drawStream();
      // restore scroll
      if (State.streamScroll) window.scrollTo(0, State.streamScroll);
    }, 280);

    // Subscribe to live updates
    if (beamsUnsub) beamsUnsub();
    beamsUnsub = Halo.beams.subscribe((list) => {
      State.beams = list;
      drawStream();
    });
  }

  // remember scroll on the stream page
  window.addEventListener("scroll", () => {
    if (Router.current() === "/") State.streamScroll = window.scrollY;
  }, { passive: true });

  /* ============ LOOPS PAGE ============ */
  async function renderLoops() {
    showSkeleton(1);
    const loops = await Halo.loops.list();
    const wrap = el("div", { class: "loops-wrap" });
    let muted = true;

    loops.forEach((loop) => {
      const author = userOf(loop.authorId);
      const sparkedByMe = (loop.sparks || []).includes(State.user.uid);
      const node = el("section", { class: "loop", "data-loop": loop.id });
      const video = el("video", {
        src: loop.videoUrl,
        poster: loop.posterUrl || "",
        muted: true,
        loop: true,
        playsinline: "",
        preload: "metadata"
      });
      node.appendChild(video);
      node.appendChild(el("div", { class: "loop-overlay" }));

      const back = el("button", { class: "loop-mobile-back", onclick: () => Router.go("/"), html: `<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` });
      node.appendChild(back);

      const meta = el("div", { class: "loop-meta" });
      meta.innerHTML = `
        <div class="loop-author">${avatarHTML(author, "sm")} <div><div class="loop-author-name">${escapeHtml(author.displayName)} ${haloBadge(author)}</div><div style="font-size:12px;opacity:.8">@${escapeHtml(author.handle)}</div></div></div>
        <div class="loop-caption">${escapeHtml(loop.caption || "")}</div>`;
      node.appendChild(meta);

      const sparkAct = el("div", { class: "loop-action" + (sparkedByMe ? " sparked" : "") });
      sparkAct.innerHTML = `<button><svg viewBox="0 0 24 24"><path d="M12 2.5l2.5 6 6.5.5-5 4.3 1.6 6.4L12 16.7 6.4 19.7 8 13.3 3 9l6.5-.5L12 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="${sparkedByMe ? "currentColor" : "none"}"/></svg></button><span>${(loop.sparks || []).length}</span>`;
      sparkAct.querySelector("button").addEventListener("click", async () => {
        await Halo.loops.toggleSpark(loop.id, State.user.uid);
        const i = (loop.sparks || []).indexOf(State.user.uid);
        if (i >= 0) loop.sparks.splice(i, 1); else (loop.sparks = loop.sparks || []).push(State.user.uid);
        const next = sparkAct.cloneNode(false);
        next.classList.toggle("sparked", loop.sparks.includes(State.user.uid));
        next.innerHTML = `<button><svg viewBox="0 0 24 24"><path d="M12 2.5l2.5 6 6.5.5-5 4.3 1.6 6.4L12 16.7 6.4 19.7 8 13.3 3 9l6.5-.5L12 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="${loop.sparks.includes(State.user.uid) ? "currentColor" : "none"}"/></svg></button><span>${loop.sparks.length}</span>`;
        sparkAct.replaceWith(next);
        next.querySelector("button").addEventListener("click", sparkAct.querySelector("button").onclick);
      });

      const commentAct = el("div", { class: "loop-action" });
      commentAct.innerHTML = `<button><svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg></button><span>Reply</span>`;
      commentAct.querySelector("button").addEventListener("click", () => Toast("Loop replies coming soon"));

      const shareAct = el("div", { class: "loop-action" });
      shareAct.innerHTML = `<button><svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span>Share</span>`;
      shareAct.querySelector("button").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(window.location.href); Toast("Link copied"); } catch {}
      });

      const followAct = el("div", { class: "loop-action" });
      followAct.innerHTML = `<button><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button><span>Orbit</span>`;
      followAct.querySelector("button").addEventListener("click", async () => {
        const inOrbit = await Halo.users.toggleOrbit(State.user.uid, loop.authorId);
        Toast(inOrbit ? "Added to your Orbit" : "Removed from your Orbit");
      });

      const actions = el("div", { class: "loop-actions" }, [sparkAct, commentAct, shareAct, followAct]);
      node.appendChild(actions);

      const muteBtn = el("button", { class: "loop-mute" });
      const setMuteIcon = () => {
        muteBtn.innerHTML = muted
          ? `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4V5zM18 9l4 6m0-6l-4 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          : `<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M19 6c3 3 3 9 0 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
      };
      setMuteIcon();
      muteBtn.addEventListener("click", () => {
        muted = !muted;
        wrap.querySelectorAll("video").forEach((v) => (v.muted = muted));
        $$(".loop-mute", wrap).forEach((b) => b.replaceWith(muteBtn.cloneNode(true)));
        $$(".loop-mute", wrap).forEach((b) => b.addEventListener("click", muteBtn.onclick));
        setMuteIcon();
      });
      muteBtn.onclick = muteBtn.onclick || (() => {});
      node.appendChild(muteBtn);

      // Tap video to toggle play
      video.addEventListener("click", () => video.paused ? video.play() : video.pause());
      wrap.appendChild(node);
    });

    mount(wrap);

    // IntersectionObserver autoplay
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target.querySelector("video");
        if (!v) return;
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          v.muted = muted; v.play().catch(() => {});
        } else {
          v.pause();
        }
      });
    }, { root: wrap, threshold: [0, 0.6, 1] });
    $$(".loop", wrap).forEach((n) => io.observe(n));
  }

  /* ============ ROOMS LIST ============ */
  let roomsUnsub = null;
  function renderRooms() {
    showSkeleton(2);
    const page = el("div", { class: "page rooms-page" });
    const head = el("div", { class: "page-head" }, [
      el("div", {}, [
        el("h1", { class: "page-title", text: "Rooms" }),
        el("p", { class: "page-sub", text: "Conversations that breathe." })
      ]),
      el("button", {
        class: "btn btn-soft",
        onclick: () => openCreateRoom(),
        html: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> New room`
      })
    ]);
    const list = el("div", { class: "rooms-list", id: "rooms-list" });
    page.appendChild(head); page.appendChild(list);

    function draw(rooms) {
      list.innerHTML = "";
      if (!rooms.length) {
        list.replaceWith(el("div", { class: "empty", html:
          `<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg></div>
           <h3>No rooms yet.</h3>
           <p>Start a Room to begin a conversation.</p>`
        }));
        return;
      }
      // pinned first
      rooms.sort((a, b) => (b.pinned - a.pinned) || ((b.lastAt || 0) - (a.lastAt || 0)));
      rooms.forEach((r) => {
        const isDM = r.memberIds.length === 2;
        const otherUid = isDM ? r.memberIds.find((u) => u !== State.user.uid) : null;
        const other = otherUid ? userOf(otherUid) : null;
        const cover = isDM
          ? avatarHTML(other)
          : (r.cover ? `<img src="${r.cover}" alt="" />` : `<span>${r.emoji || "✨"}</span>`);
        const lastUser = r.messages && r.messages.length ? userOf(r.messages[r.messages.length - 1].authorId) : null;
        const lastPrefix = lastUser ? (lastUser.uid === State.user.uid ? "You: " : (isDM ? "" : `${lastUser.displayName.split(" ")[0]}: `)) : "";
        const row = el("div", { class: "room-row", onclick: () => Router.go("/rooms/" + r.id) });
        row.innerHTML = `
          <div class="room-cover">${cover}</div>
          <div class="room-info">
            <div class="room-line1">
              <div class="room-name">${escapeHtml(isDM ? (other ? other.displayName : r.name) : r.name)} ${isDM ? haloBadge(other) : ""} ${r.pinned ? `<svg class="room-pin" viewBox="0 0 24 24"><path d="M12 2v8l4 4-2 2v6m0-12L8 8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}</div>
              <div class="room-time">${fmtTime(r.lastAt || r.createdAt)}</div>
            </div>
            <div class="room-line2">
              <div class="room-preview">${escapeHtml(lastPrefix + (r.lastMessage || "Quiet so far…"))}</div>
            </div>
          </div>`;
        list.appendChild(row);
      });
    }

    setTimeout(() => mount(page), 200);
    if (roomsUnsub) roomsUnsub();
    roomsUnsub = Halo.rooms.subscribe(State.user.uid, (rooms) => {
      State.rooms = rooms;
      draw(rooms);
    });
  }

  /* ============ ROOM (chat) ============ */
  let roomOneUnsub = null;
  let typingTimer = null;
  function renderRoom(roomId) {
    showSkeleton(2);
    const me = State.user;

    const view = el("div", { class: "room-view" });
    const header = el("header", { class: "room-header" });
    const messages = el("div", { class: "messages" });
    const messagesInner = el("div", { class: "messages-inner" });
    messages.appendChild(messagesInner);

    const composer = el("div", { class: "composer" });
    const composerInner = el("div", { class: "composer-inner" });
    composer.appendChild(composerInner);

    // composer reply preview
    const cReply = el("div", { class: "composer-reply" });
    const cReplyInfo = el("div", { class: "composer-reply-info" });
    cReply.innerHTML = `
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;color:var(--gold)"><path d="M9 7l-5 5 5 5M4 12h11a5 5 0 015 5v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    cReply.appendChild(cReplyInfo);
    const cReplyCancel = el("button", { class: "composer-reply-cancel", title: "Cancel reply (Esc)", html: `<svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` });
    cReply.appendChild(cReplyCancel);
    cReplyCancel.addEventListener("click", () => { State.pendingReply = null; cReply.classList.remove("shown"); });
    composerInner.appendChild(cReply);

    // image preview
    const imgPrev = el("div", { class: "composer-image-preview" });
    composerInner.appendChild(imgPrev);

    // composer row
    const cRow = el("div", { class: "composer-row" });
    const emojiBtn = el("button", { class: "composer-tool", title: "Emoji", html: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>` });
    const attachBtn = el("button", { class: "composer-tool", title: "Attach image", html: `<svg viewBox="0 0 24 24"><path d="M14 6l-7.5 7.5a4 4 0 105.7 5.7L20 11" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` });
    const fileInput = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const url = await Halo.uploadImage(f);
      State.pendingImage = url;
      imgPrev.classList.add("shown");
      imgPrev.innerHTML = `<img src="${url}" alt="" /><button class="composer-image-cancel"><svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
      imgPrev.querySelector(".composer-image-cancel").addEventListener("click", () => {
        State.pendingImage = null;
        imgPrev.classList.remove("shown");
        imgPrev.innerHTML = "";
      });
    });
    const ta = el("textarea", { class: "composer-input", placeholder: "Write a message…", rows: "1" });
    const sendBtn = el("button", { class: "composer-send", title: "Send", html: `<svg viewBox="0 0 24 24"><path d="M3 12l18-9-7 18-2-8-9-1z" stroke="currentColor" stroke-width="1.6" fill="currentColor" stroke-linejoin="round"/></svg>` });
    cRow.appendChild(emojiBtn); cRow.appendChild(attachBtn); cRow.appendChild(ta); cRow.appendChild(sendBtn); cRow.appendChild(fileInput);
    composerInner.appendChild(cRow);

    // autoresize textarea
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(140, ta.scrollHeight) + "px";
    });

    // Enter to send
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      } else if (e.key === "Escape") {
        State.pendingReply = null;
        cReply.classList.remove("shown");
      }
    });

    sendBtn.addEventListener("click", send);
    async function send() {
      const text = ta.value.trim();
      if (!text && !State.pendingImage) return;
      const payload = {
        authorId: me.uid,
        text,
        image: State.pendingImage || null
      };
      if (State.pendingReply) payload.replyToId = State.pendingReply;
      ta.value = ""; ta.style.height = "auto";
      State.pendingImage = null; imgPrev.classList.remove("shown"); imgPrev.innerHTML = "";
      State.pendingReply = null; cReply.classList.remove("shown");
      // optimistic append
      const optMsg = { ...payload, id: "opt" + Date.now(), reactions: [], status: "sent", createdAt: Date.now() };
      State.activeRoom.messages.push(optMsg);
      drawMessages(State.activeRoom);
      scrollToBottom();
      const saved = await Halo.rooms.sendMessage(roomId, payload);
      // replace opt id
      const idx = State.activeRoom.messages.findIndex((m) => m.id === optMsg.id);
      if (idx >= 0) State.activeRoom.messages[idx] = saved;
    }

    // emoji popover
    emojiBtn.addEventListener("click", (e) => {
      openEmojiPopover(emojiBtn, (em) => {
        const start = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + em + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + em.length;
        ta.focus();
      });
    });

    composerInner.appendChild(cRow);

    view.appendChild(header);
    view.appendChild(messages);
    view.appendChild(composer);
    setTimeout(() => mount(view), 200);

    function applyTheme(room) {
      const t = room.theme || { wallpaper: "aurora", bubbleColor: "#e7c07b", bubbleShape: "rounded" };
      view.setAttribute("data-wp", t.wallpaper);
      view.setAttribute("data-shape", t.bubbleShape);
      view.style.setProperty("--bubble-color", t.bubbleColor);
      // calc readable fg color
      const fg = pickReadable(t.bubbleColor);
      view.style.setProperty("--bubble-color-fg", fg);
    }

    function drawHeader(room) {
      const isDM = room.memberIds.length === 2;
      const other = isDM ? userOf(room.memberIds.find((u) => u !== me.uid)) : null;
      const title = isDM && other ? other.displayName : room.name;
      const haloIc = isDM && other && other.halo ? haloBadge(other) : "";
      const subtitle = isDM
        ? (other ? `@${escapeHtml(other.handle)}` : "")
        : `${room.memberIds.length} members`;
      header.innerHTML = `
        <button class="room-back" onclick="window.history.length > 1 ? history.back() : (window.location.hash='#/rooms')">
          <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="room-cover" style="width:38px;height:38px;font-size:18px">${isDM ? avatarHTML(other, "sm") : `<span>${room.emoji || "✨"}</span>`}</div>
        <div class="room-header-info">
          <div class="room-header-name">${escapeHtml(title)} ${haloIc}</div>
          <div class="room-header-meta">${subtitle}</div>
        </div>
        <div class="room-header-actions">
          <button class="icon-btn" title="Customize">
            <svg viewBox="0 0 24 24"><path d="M3 21l3-1 11-11-2-2L4 18l-1 3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 7l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
        </div>`;
      header.querySelector(".room-header-actions .icon-btn").addEventListener("click", () => openChatTheme(room));
    }

    function drawMessages(room) {
      messagesInner.innerHTML = "";
      let lastTs = 0;
      let lastAuthor = null;
      const msgs = room.messages || [];
      msgs.forEach((m, i) => {
        if (!sameDay(lastTs || m.createdAt, m.createdAt) || lastTs === 0) {
          messagesInner.appendChild(el("div", { class: "msg-day", text: fmtDay(m.createdAt) }));
          lastAuthor = null;
        }
        const isFirst = lastAuthor !== m.authorId;
        messagesInner.appendChild(messageNode(m, room, isFirst));
        lastAuthor = m.authorId;
        lastTs = m.createdAt;
      });
      // typing
      if (room._typing) {
        const tp = userOf(room._typing);
        const node = el("div", { class: "typing" });
        node.innerHTML = `${avatarHTML(tp, "sm")}<div class="typing-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
        messagesInner.appendChild(node);
      }
    }

    function messageNode(m, room, isFirst) {
      const author = userOf(m.authorId);
      const mine = m.authorId === me.uid;
      const row = el("div", { class: "msg-row" + (mine ? " mine" : "") + (isFirst ? " first-in-group" : "") + (mine && m.status === "seen" ? " seen" : ""), "data-msg": m.id });
      if (!mine) {
        const wrap = el("span", { class: "msg-avatar-wrap", style: { width: "30px", height: "30px", flex: "0 0 auto" } });
        if (author.photoURL) {
          wrap.appendChild(el("img", { class: "msg-avatar", src: author.photoURL, alt: "" }));
        } else {
          const ph = el("span", { class: "msg-avatar", style: { display: "grid", placeItems: "center", borderRadius: "999px", background: "var(--gold-soft)", color: "var(--gold)", fontWeight: "700", fontSize: "12px" }, text: (author.displayName || "?")[0].toUpperCase() });
          wrap.appendChild(ph);
        }
        row.appendChild(wrap);
      } else {
        row.appendChild(el("span", { class: "msg-avatar" }));
      }

      const stack = el("div", { class: "msg-stack" });
      if (isFirst && !mine) stack.appendChild(el("div", { class: "msg-author", text: author.displayName }));

      // bubble
      const bubble = el("div", { class: "bubble" + (m.image ? " has-image" : "") });

      // reply preview inside bubble
      if (m.replyToId) {
        const orig = (room.messages || []).find((x) => x.id === m.replyToId);
        if (orig) {
          const origAuthor = userOf(orig.authorId);
          const rep = el("div", { class: "bubble-reply" });
          rep.innerHTML = `
            <div class="bubble-reply-author">${escapeHtml(origAuthor.displayName)}</div>
            <div class="bubble-reply-text">${escapeHtml(orig.text || (orig.image ? "📷 Photo" : ""))}</div>`;
          rep.addEventListener("click", () => jumpToMessage(orig.id));
          bubble.appendChild(rep);
        }
      }

      if (m.image) bubble.appendChild(el("img", { class: "bubble-image", src: m.image, alt: "", loading: "lazy" }));
      if (m.text)  bubble.appendChild(el("div", { class: "msg-text", text: m.text }));

      // long-press on touch / contextmenu / right-click → menu
      let pressTimer = null;
      const openMenu = (x, y) => openMsgMenu(x, y, m, room, mine);
      bubble.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY); });
      bubble.addEventListener("touchstart", (e) => {
        pressTimer = setTimeout(() => {
          const t = e.touches[0];
          openMenu(t.clientX, t.clientY);
        }, 480);
      });
      bubble.addEventListener("touchend",   () => clearTimeout(pressTimer));
      bubble.addEventListener("touchmove",  () => clearTimeout(pressTimer));
      bubble.addEventListener("dblclick",   () => { State.pendingReply = m.id; setReplyPreview(m); });

      // hover quick action: small reply chip on hover (desktop only)
      const quickBtn = el("button", {
        class: "icon-btn",
        title: "Reply",
        style: { position: "absolute", top: "-14px", [mine ? "left" : "right"]: "-30px", width: "26px", height: "26px", borderRadius: "999px", background: "var(--bg-elev)", boxShadow: "var(--shadow-md)", opacity: "0", transition: "opacity .2s" }
      });
      quickBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M9 7l-5 5 5 5M4 12h11a5 5 0 015 5v2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      quickBtn.addEventListener("click", (e) => { e.stopPropagation(); State.pendingReply = m.id; setReplyPreview(m); });
      bubble.style.position = "relative";
      bubble.appendChild(quickBtn);
      bubble.addEventListener("mouseenter", () => { quickBtn.style.opacity = "1"; });
      bubble.addEventListener("mouseleave", () => { quickBtn.style.opacity = "0"; });

      stack.appendChild(bubble);

      // reactions
      if (m.reactions && m.reactions.length) {
        const rx = el("div", { class: "msg-reactions" });
        m.reactions.forEach((r) => {
          const chip = el("button", { class: "msg-reaction" + (r.userIds.includes(me.uid) ? " mine" : ""), html: `<span>${r.emoji}</span><span>${r.userIds.length}</span>` });
          chip.addEventListener("click", async () => { await Halo.rooms.toggleReaction(roomId, m.id, r.emoji, me.uid); });
          rx.appendChild(chip);
        });
        stack.appendChild(rx);
      }

      // meta
      const meta = el("div", { class: "msg-meta" });
      meta.innerHTML = `${m.editedAt ? `<span class="msg-edited">edited · </span>` : ""}<span>${fmtClock(m.createdAt)}</span>` + (mine ? ` <span class="msg-ticks">${ticksSvg(m.status)}</span>` : "");
      stack.appendChild(meta);

      row.appendChild(stack);
      return row;
    }

    function ticksSvg(status) {
      if (status === "sent")
        return `<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      if (status === "delivered" || status === "seen")
        return `<svg viewBox="0 0 24 24"><path d="M2 13l5 5L18 7M9 13l5 5L24 7" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>`;
    }

    function setReplyPreview(m) {
      const author = userOf(m.authorId);
      cReplyInfo.innerHTML = `
        <div class="composer-reply-author">Replying to ${escapeHtml(author.displayName)}</div>
        <div class="composer-reply-text">${escapeHtml(m.text || (m.image ? "📷 Photo" : ""))}</div>`;
      cReply.classList.add("shown");
      ta.focus();
    }

    function jumpToMessage(id) {
      const node = messagesInner.querySelector(`[data-msg="${CSS.escape(id)}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.classList.add("flash");
      setTimeout(() => node.classList.remove("flash"), 1500);
    }

    function scrollToBottom(smooth = true) {
      messages.scrollTo({ top: messages.scrollHeight + 999, behavior: smooth ? "smooth" : "auto" });
    }

    // subscribe
    if (roomOneUnsub) roomOneUnsub();
    roomOneUnsub = Halo.rooms.subscribeOne(roomId, (room) => {
      if (!room) return;
      State.activeRoom = room;
      applyTheme(room);
      drawHeader(room);
      drawMessages(room);
      // scroll on first paint
      if (!view._firstPaint) {
        view._firstPaint = true;
        setTimeout(() => scrollToBottom(false), 60);
      } else {
        // if we're already near bottom, snap to it
        const nearBottom = messages.scrollTop + messages.clientHeight + 200 > messages.scrollHeight;
        if (nearBottom) scrollToBottom();
      }
    });

    // expose for menu
    view._jumpToMessage = jumpToMessage;
    view._setReplyPreview = setReplyPreview;
  }

  function pickReadable(hex) {
    if (!hex || hex[0] !== "#") return "#1a140a";
    const c = hex.slice(1);
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 160 ? "#1a140a" : "#fff7e8";
  }

  /* ============ MESSAGE MENU ============ */
  function openMsgMenu(x, y, m, room, mine) {
    const menu = $("#msg-menu");
    menu.classList.toggle("is-mine", !!mine);

    // Build quick-react row at top (rebuild every open)
    let quick = menu.querySelector(".msg-quick-react");
    if (quick) quick.remove();
    quick = el("div", { class: "msg-quick-react" });
    ["❤️", "🔥", "😂", "😮", "💛", "🙏"].forEach((em) => {
      const b = el("button", { text: em });
      b.addEventListener("click", async () => {
        await Halo.rooms.toggleReaction(room.id, m.id, em, State.user.uid);
        closeMsgMenu();
      });
      quick.appendChild(b);
    });
    menu.insertBefore(quick, menu.firstChild);

    // wire actions
    menu.querySelector('[data-act="reply"]').onclick = () => {
      State.pendingReply = m.id;
      const view = $(".room-view");
      if (view && view._setReplyPreview) view._setReplyPreview(m);
      closeMsgMenu();
    };
    menu.querySelector('[data-act="react"]').onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      openEmojiPopover(e.currentTarget, async (em) => {
        await Halo.rooms.toggleReaction(room.id, m.id, em, State.user.uid);
      });
      closeMsgMenu();
    };
    menu.querySelector('[data-act="copy"]').onclick = async () => {
      try { await navigator.clipboard.writeText(m.text || ""); Toast("Copied"); } catch {}
      closeMsgMenu();
    };
    menu.querySelector('[data-act="edit"]').onclick = async () => {
      const next = prompt("Edit message", m.text || "");
      if (next != null && next.trim() !== m.text) await Halo.rooms.editMessage(room.id, m.id, next.trim());
      closeMsgMenu();
    };
    menu.querySelector('[data-act="delete"]').onclick = async () => {
      if (confirm("Delete this message?")) await Halo.rooms.deleteMessage(room.id, m.id);
      closeMsgMenu();
    };

    // position
    menu.classList.add("open");
    menu.style.left = "0px"; menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - rect.width - 12);
    const py = Math.min(y, window.innerHeight - rect.height - 12);
    menu.style.left = px + "px";
    menu.style.top = py + "px";
  }
  function closeMsgMenu() { $("#msg-menu").classList.remove("open"); }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#msg-menu") && !e.target.closest(".bubble"))
      closeMsgMenu();
  });

  /* ============ EMOJI POPOVER ============ */
  const EMOJIS = "😀 😃 😄 😁 😆 🥹 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 ❤️ 🧡 💛 💚 💙 💜 🤍 🤎 🖤 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✨ 🌟 ⭐ 🌙 ☀️ 🔥 💧 🌊 🌈 🍞 🍰 🎵 🎶 📷 📸 ✈️ 🚀 🏝️ 🌲 🌸 🌹 🌻 🍀 🍃".split(" ");
  function openEmojiPopover(anchor, onPick) {
    const pop = $("#emoji-popover");
    const grid = $("#emoji-grid");
    grid.innerHTML = "";
    EMOJIS.forEach((em) => {
      const b = el("button", { text: em });
      b.addEventListener("click", () => { onPick(em); pop.classList.remove("open"); });
      grid.appendChild(b);
    });
    pop.classList.add("open");
    const r = anchor.getBoundingClientRect();
    const popR = pop.getBoundingClientRect();
    let left = r.left;
    if (left + popR.width > window.innerWidth - 8) left = window.innerWidth - popR.width - 8;
    let top = r.top - popR.height - 8;
    if (top < 8) top = r.bottom + 8;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#emoji-popover") && !e.target.closest(".composer-tool") && !e.target.closest('[data-act="react"]'))
      $("#emoji-popover").classList.remove("open");
  });

  /* ============ CHAT THEME PICKER ============ */
  const WALLPAPERS = [
    { id: "aurora",  name: "Aurora",  preview: "linear-gradient(135deg,#3a2a6b,#1a4060)" },
    { id: "dusk",    name: "Dusk",    preview: "linear-gradient(180deg,#1a1426,#0f0a18)" },
    { id: "paper",   name: "Paper",   preview: "radial-gradient(circle at 1px 1px, rgba(0,0,0,.12) 1px, #f6f1e6 1px)" },
    { id: "forest",  name: "Forest",  preview: "linear-gradient(180deg,#0e1a18,#0a1110)" },
    { id: "rose",    name: "Rose",    preview: "linear-gradient(180deg,#1f1318,#160d10)" },
    { id: "ocean",   name: "Ocean",   preview: "linear-gradient(180deg,#0c1825,#08111a)" },
    { id: "plain",   name: "Plain",   preview: "var(--bg-2)" }
  ];
  const BUBBLE_COLORS = ["#e7c07b", "#8a7cff", "#6bd29a", "#5a90c8", "#d97a8c", "#1b1814", "#f4d59a", "#ff8e6b"];

  function openChatTheme(room) {
    const modal = $("#chat-theme-modal");
    const wpGrid = $("#wallpaper-grid");
    const cGrid = $("#bubble-color-grid");
    const sGrid = $$(".bubble-shape-btn");
    let theme = JSON.parse(JSON.stringify(room.theme || { wallpaper: "aurora", bubbleColor: "#e7c07b", bubbleShape: "rounded" }));
    wpGrid.innerHTML = "";
    WALLPAPERS.forEach((w) => {
      const sw = el("div", { class: "wallpaper-swatch" + (theme.wallpaper === w.id ? " active" : ""), style: { background: w.preview }, title: w.name });
      sw.addEventListener("click", () => {
        theme.wallpaper = w.id;
        $$(".wallpaper-swatch", wpGrid).forEach((n) => n.classList.toggle("active", n === sw));
      });
      wpGrid.appendChild(sw);
    });
    cGrid.innerHTML = "";
    BUBBLE_COLORS.forEach((c) => {
      const sw = el("div", { class: "bubble-color-swatch" + (theme.bubbleColor === c ? " active" : ""), style: { background: c } });
      sw.addEventListener("click", () => {
        theme.bubbleColor = c;
        $$(".bubble-color-swatch", cGrid).forEach((n) => n.classList.toggle("active", n === sw));
      });
      cGrid.appendChild(sw);
    });
    sGrid.forEach((b) => {
      b.classList.toggle("active", b.dataset.shape === theme.bubbleShape);
      b.onclick = () => {
        theme.bubbleShape = b.dataset.shape;
        sGrid.forEach((x) => x.classList.toggle("active", x === b));
      };
    });
    $("#save-theme-btn").onclick = async () => {
      await Halo.rooms.updateTheme(room.id, theme);
      modal.classList.remove("open");
      Toast("Look saved");
    };
    modal.classList.add("open");
  }

  /* ============ HALO PAGE ============ */
  function renderHalo() {
    const me = State.user;
    const hero = `<div class="halo-hero ${me.halo ? "granted" : ""}" id="halo-hero">
      <svg class="halo-ring-svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="90"></circle></svg>
      ${avatarHTML(me, "xl")}
    </div>`;
    const page = el("div", { class: "page halo-page", html: `
      ${hero}
      <h1>${me.halo ? "You're Halo'd." : "Earn your Halo."}</h1>
      <p class="lede">${me.halo ? "Your ring is yours, forever. It will appear next to your name across Rooms, Beams, and Loops." : "A Halo is granted to members who anchor themselves to a place. Share your location once and the ring is yours, forever."}</p>
      <button class="btn btn-primary halo-grant" id="halo-grant-btn">${me.halo ? "Halo confirmed" : "Earn your Halo"}</button>
      <p class="halo-status" id="halo-status"></p>
    `});
    mount(page);

    if (me.halo) { $("#halo-grant-btn").disabled = true; return; }
    $("#halo-grant-btn").addEventListener("click", () => {
      const status = $("#halo-status");
      status.className = "halo-status";
      status.textContent = "Asking your device for a location…";
      if (!navigator.geolocation) {
        status.classList.add("error"); status.textContent = "Your device doesn't support location. Try another browser?";
        return;
      }
      navigator.geolocation.getCurrentPosition(async () => {
        await Halo.users.grantHalo(me.uid);
        State.user.halo = true;
        $("#halo-hero").classList.add("granted");
        status.classList.add("success"); status.textContent = "Welcome to the Halo'd. The ring is yours.";
        $("#halo-grant-btn").textContent = "Halo confirmed"; $("#halo-grant-btn").disabled = true;
        // refresh user list cache
        const u = State.users.find((u) => u.uid === me.uid); if (u) u.halo = true;
      }, () => {
        status.classList.add("error"); status.textContent = "No pressure — try again whenever you're ready.";
      }, { enableHighAccuracy: false, timeout: 10000 });
    });
  }

  /* ============ PROFILE PAGE ============ */
  function renderProfile() {
    const me = State.user;
    const myBeams = State.beams.filter((b) => b.authorId === me.uid);
    const myRooms = State.rooms;

    const page = el("div", { class: "page profile-page" });
    const head = el("div", { class: "profile-head" });
    head.innerHTML = `
      ${avatarHTML(me, "lg")}
      <div class="profile-info">
        <div class="profile-name-line">
          <h2 class="profile-name">${escapeHtml(me.displayName)}</h2>
          ${haloBadge(me)}
        </div>
        <div class="profile-handle">@${escapeHtml(me.handle || me.email.split("@")[0])}</div>
        <div class="profile-bio">${escapeHtml(me.bio || "Tell people what you're listening for.")}</div>
        <div class="profile-stats">
          <div class="stat"><span class="stat-num">${myBeams.length}</span><span class="stat-label">beams</span></div>
          <div class="stat"><span class="stat-num">${(me.orbit || []).length}</span><span class="stat-label">in orbit</span></div>
          <div class="stat"><span class="stat-num">${myRooms.length}</span><span class="stat-label">rooms</span></div>
        </div>
        <button class="profile-edit" id="edit-profile-btn">Edit profile</button>
      </div>`;
    page.appendChild(head);

    const tabs = el("div", { class: "profile-tabs" });
    ["Beams", "Rooms", "Orbit"].forEach((t, i) => {
      const b = el("button", { class: "profile-tab" + (i === 0 ? " active" : ""), text: t });
      b.addEventListener("click", () => {
        $$(".profile-tab", tabs).forEach((n) => n.classList.remove("active"));
        b.classList.add("active");
        drawTab(t);
      });
      tabs.appendChild(b);
    });
    page.appendChild(tabs);
    const tabBody = el("div", { class: "stream" });
    page.appendChild(tabBody);

    function drawTab(t) {
      tabBody.innerHTML = "";
      if (t === "Beams") {
        if (!myBeams.length) tabBody.appendChild(el("div", { class: "empty", html: "<p>You haven't sent a Beam yet.</p>" }));
        else myBeams.forEach((b, i) => {
          if (i > 0) tabBody.appendChild(el("div", { class: "beam-sep" }));
          const card = el("article", { class: "beam" });
          card.innerHTML = `
            <div class="beam-text">${escapeHtml(b.text || "")}</div>
            ${b.image ? `<img class="beam-image" src="${b.image}" alt="" />` : ""}
            <div class="beam-actions">
              <span class="action-btn">${(b.sparks||[]).length} Sparks</span>
              <span class="action-btn">${(b.comments||[]).length} Replies</span>
              <span class="action-btn">${fmtTime(b.createdAt)}</span>
            </div>`;
          tabBody.appendChild(card);
        });
      } else if (t === "Rooms") {
        if (!myRooms.length) tabBody.appendChild(el("div", { class: "empty", html: "<p>You haven't joined any rooms yet.</p>" }));
        else myRooms.forEach((r) => {
          const row = el("div", { class: "room-row", onclick: () => Router.go("/rooms/" + r.id), style: { background: "var(--bg-2)", border: "var(--hairline)", borderRadius: "var(--radius)", marginBottom: "8px" } });
          row.innerHTML = `<div class="room-cover"><span>${r.emoji || "✨"}</span></div><div class="room-info"><div class="room-line1"><div class="room-name">${escapeHtml(r.name)}</div><div class="room-time">${r.memberIds.length} members</div></div><div class="room-line2"><div class="room-preview">${escapeHtml(r.lastMessage || "")}</div></div></div>`;
          tabBody.appendChild(row);
        });
      } else {
        const orbit = (me.orbit || []).map(userOf);
        if (!orbit.length) tabBody.appendChild(el("div", { class: "empty", html: "<p>Your Orbit is empty. Start adding people you want to hear from.</p>" }));
        else orbit.forEach((u) => {
          const row = el("div", { style: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "var(--bg-2)", border: "var(--hairline)", borderRadius: "var(--radius)", marginBottom: "8px" } });
          row.innerHTML = `${avatarHTML(u)}<div style="flex:1"><div style="font-weight:600">${escapeHtml(u.displayName)} ${haloBadge(u)}</div><div style="font-size:13px;color:var(--fg-3)">@${escapeHtml(u.handle)}</div></div>`;
          tabBody.appendChild(row);
        });
      }
    }
    drawTab("Beams");

    // settings
    const settings = el("div", { class: "settings-section" });
    settings.innerHTML = `
      <div class="settings-row"><div><div class="settings-label">Light theme</div><div class="settings-desc">Toggle between dark and light surfaces.</div></div><div class="toggle ${document.documentElement.getAttribute("data-theme") === "light" ? "on" : ""}" id="set-theme-toggle"></div></div>
      <div class="settings-row"><div><div class="settings-label">Sound on send</div><div class="settings-desc">Play a soft chime when sending a message.</div></div><div class="toggle ${localStorage.getItem("halo.sound") === "1" ? "on" : ""}" id="set-sound-toggle"></div></div>
      <div class="settings-row"><div><div class="settings-label">Reduce motion</div><div class="settings-desc">Tone down animations across Halo.</div></div><div class="toggle ${localStorage.getItem("halo.reduce") === "1" ? "on" : ""}" id="set-reduce-toggle"></div></div>
    `;
    page.appendChild(settings);

    settings.querySelector("#set-theme-toggle").addEventListener("click", () => Theme.toggle());
    settings.querySelector("#set-sound-toggle").addEventListener("click", (e) => {
      const on = e.currentTarget.classList.toggle("on");
      localStorage.setItem("halo.sound", on ? "1" : "0");
    });
    settings.querySelector("#set-reduce-toggle").addEventListener("click", (e) => {
      const on = e.currentTarget.classList.toggle("on");
      localStorage.setItem("halo.reduce", on ? "1" : "0");
      document.documentElement.style.setProperty("--motion", on ? "0" : "1");
    });

    mount(page);

    $("#edit-profile-btn").addEventListener("click", async () => {
      const name = prompt("Display name", me.displayName) || me.displayName;
      const bio = prompt("Bio", me.bio || "");
      await Halo.users.update(me.uid, { displayName: name, bio: bio || "" });
      State.user.displayName = name;
      State.user.bio = bio || "";
      Toast("Profile saved");
      renderProfile();
    });
  }

  /* ============ COMPOSE BEAM MODAL ============ */
  function openCompose() {
    const m = $("#compose-modal");
    m.classList.add("open");
    $("#compose-text").value = "";
    $("#compose-image").value = "";
    $("#compose-image-preview").classList.remove("shown");
    $("#compose-image-preview").innerHTML = "";
    setTimeout(() => $("#compose-text").focus(), 50);
  }
  function bindCompose() {
    let pendingImage = null;
    $("#open-compose").addEventListener("click", openCompose);
    $("#open-compose-mobile").addEventListener("click", openCompose);
    $("#compose-image").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = await Halo.uploadImage(f);
      pendingImage = url;
      const prev = $("#compose-image-preview");
      prev.classList.add("shown");
      prev.innerHTML = `<img src="${url}" alt="" />`;
    });
    $("#compose-publish").addEventListener("click", async () => {
      const text = $("#compose-text").value.trim();
      if (!text && !pendingImage) return;
      const btn = $("#compose-publish");
      btn.classList.add("loading");
      try {
        await Halo.beams.create({ authorId: State.user.uid, text, image: pendingImage });
        Toast("Beam sent");
        $("#compose-modal").classList.remove("open");
        pendingImage = null;
      } finally {
        btn.classList.remove("loading");
      }
    });
  }

  /* ============ CREATE ROOM MODAL ============ */
  function openCreateRoom() {
    const m = $("#create-room-modal");
    $("#room-name").value = "";
    $("#room-emoji").value = "✨";
    $("#room-members").value = "";
    m.classList.add("open");
  }
  function bindCreateRoom() {
    $("#create-room-btn").addEventListener("click", async () => {
      const name = $("#room-name").value.trim();
      const emoji = $("#room-emoji").value.trim() || "✨";
      const handles = $("#room-members").value.split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
      if (!name) { Toast("Give the room a name"); return; }
      const all = await Halo.users.listAll();
      const memberIds = [State.user.uid, ...handles.map((h) => (all.find((u) => u.handle === h) || {}).uid).filter(Boolean)];
      const room = await Halo.rooms.create({ name, emoji, memberIds });
      $("#create-room-modal").classList.remove("open");
      Router.go("/rooms/" + room.id);
    });
  }

  /* ============ COMMAND PALETTE ============ */
  function openCmd() {
    const m = $("#command-palette");
    m.classList.add("open");
    const inp = $("#cmd-input");
    inp.value = "";
    drawCmd("");
    setTimeout(() => inp.focus(), 50);
  }
  function drawCmd(q) {
    const list = $("#cmd-list");
    list.innerHTML = "";
    const items = [];
    items.push({ icon: "✦", title: "New beam", sub: "Compose a new post", run: openCompose });
    items.push({ icon: "✦", title: "New room", sub: "Start a conversation", run: openCreateRoom });
    items.push({ icon: "✦", title: "Toggle theme", sub: "Switch light / dark", run: Theme.toggle });
    State.rooms.forEach((r) => items.push({ icon: r.emoji || "✦", title: r.name, sub: "Open room", run: () => Router.go("/rooms/" + r.id) }));
    State.users.forEach((u) => {
      if (u.uid === State.user.uid) return;
      items.push({ icon: "@", title: u.displayName, sub: "@" + u.handle, run: () => {
        // open or create a DM
        const dm = State.rooms.find((r) => r.memberIds.length === 2 && r.memberIds.includes(u.uid));
        if (dm) Router.go("/rooms/" + dm.id);
        else Halo.rooms.create({ name: u.displayName, emoji: "💬", memberIds: [State.user.uid, u.uid] }).then((r) => Router.go("/rooms/" + r.id));
      }});
    });
    const ql = q.toLowerCase();
    const filtered = items.filter((it) => !ql || it.title.toLowerCase().includes(ql) || it.sub.toLowerCase().includes(ql));
    filtered.slice(0, 14).forEach((it, i) => {
      const li = el("li", { class: i === 0 ? "active" : "", onclick: () => { it.run(); $("#command-palette").classList.remove("open"); } });
      li.innerHTML = `<span class="cmd-title">${escapeHtml(it.title)}</span><span class="cmd-sub">${escapeHtml(it.sub)}</span>`;
      list.appendChild(li);
    });
  }
  function bindCmd() {
    $("#open-cmd").addEventListener("click", openCmd);
    $("#cmd-input").addEventListener("input", (e) => drawCmd(e.target.value));
    $("#cmd-input").addEventListener("keydown", (e) => {
      const list = $("#cmd-list");
      const items = $$("li", list);
      const idx = items.findIndex((n) => n.classList.contains("active"));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (items[idx]) items[idx].classList.remove("active");
        const n = items[Math.min(idx + 1, items.length - 1)];
        if (n) n.classList.add("active");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (items[idx]) items[idx].classList.remove("active");
        const n = items[Math.max(idx - 1, 0)];
        if (n) n.classList.add("active");
      } else if (e.key === "Enter") {
        e.preventDefault();
        const n = items[idx >= 0 ? idx : 0];
        if (n) n.click();
      }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        $("#command-palette").classList.contains("open")
          ? $("#command-palette").classList.remove("open")
          : openCmd();
      }
      if (e.key === "Escape") {
        $$(".modal.open").forEach((m) => m.classList.remove("open"));
        $("#emoji-popover").classList.remove("open");
        closeMsgMenu();
      }
    });
  }

  /* ============ MODAL CLOSE handlers ============ */
  function bindModals() {
    $$(".modal").forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target.matches("[data-close], .modal-scrim")) m.classList.remove("open");
      });
    });
  }

  /* ============ ROUTES ============ */
  Router
    .on("/", () => renderStream())
    .on("/loops", () => renderLoops())
    .on("/rooms", () => renderRooms())
    .on("/halo", () => renderHalo())
    .on("/me", () => renderProfile())
    .on("/compose", () => { openCompose(); Router.go(Router._lastBeforeCompose || "/"); })
    .onMatch(/^\/rooms\/([^\/?#]+)/, (id) => renderRoom(id));

  /* ============ APP BOOT ============ */
  function bootApp() {
    bindModals();
    bindCompose();
    bindCreateRoom();
    bindCmd();
    $("#toggle-theme").addEventListener("click", Theme.toggle);
    $("#signout-btn").addEventListener("click", async () => { await Halo.auth.signOut(); });

    // Initial routing
    Router.handle();
  }

  /* ============ AUTH BOOT ============ */
  bindAuthUI();
  setTimeout(() => $("#splash").classList.add("gone"), 600);

  Halo.auth.onChange(async (user) => {
    if (!user) {
      $("#auth").classList.remove("hidden");
      $("#app").classList.add("hidden");
      // unsub
      if (beamsUnsub) { beamsUnsub(); beamsUnsub = null; }
      if (roomsUnsub) { roomsUnsub(); roomsUnsub = null; }
      if (roomOneUnsub) { roomOneUnsub(); roomOneUnsub = null; }
      return;
    }
    State.user = user;
    State.users = await Halo.users.listAll();
    refreshUserMap();
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    bootApp();
  });

})();

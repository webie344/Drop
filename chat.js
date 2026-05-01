// =========================================================================
// Orbit — chat.js  (FIXED: optimistic message sending)
// =========================================================================

import {
  state, db, auth, $, $$, el, fmtTime, fmtDay, escapeHtml, linkify,
  toast, avatarFor, fetchUser, uploadToCloudinary,
} from "./app.js";

import {
  doc, setDoc, getDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, onSnapshot, getDocs,
  serverTimestamp, increment, arrayUnion, arrayRemove, deleteField,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// =========================================================================
// 1. WALLPAPER + COLOR PRESETS
// =========================================================================
const WALLPAPERS = [
  { id: "none",   name: "None",    css: null },
  { id: "aurora", name: "Aurora",  css: "linear-gradient(135deg, #7c5cff, #ff5cae, #5cd3ff)" },
  { id: "night",  name: "Night",   css: "radial-gradient(circle at 30% 20%, #1f2657 0%, #0b0b1c 70%)" },
  { id: "paper",  name: "Paper",   css: "repeating-linear-gradient(90deg, #f7f3ee 0 24px, #efe9e1 24px 25px)" },
  { id: "mesh",   name: "Mesh",    css: "radial-gradient(circle at 20% 30%, #ff8aa8 0, transparent 40%), radial-gradient(circle at 80% 70%, #6cf 0, transparent 40%), #1c1830" },
  { id: "mint",   name: "Mint",    css: "linear-gradient(135deg, #b9f7d8, #6cd4a4)" },
  { id: "ink",    name: "Ink",     css: "radial-gradient(circle at 50% 50%, #2b2b44, #08080f)" },
  { id: "sun",    name: "Sun",     css: "linear-gradient(135deg, #ffd58a, #ff8a5a)" },
];
const BUBBLE_COLORS = [
  "linear-gradient(135deg, #7c5cff, #ff5cae)",
  "linear-gradient(135deg, #5cd3ff, #7c5cff)",
  "linear-gradient(135deg, #3fdca0, #5cd3ff)",
  "linear-gradient(135deg, #ff8a5a, #ff5cae)",
  "linear-gradient(135deg, #ffb04a, #ff5c7a)",
  "#2563eb", "#10b981", "#ef4444", "#f59e0b", "#0ea5e9",
];
const FONT_MAP = {
  inter:   '"Inter", sans-serif',
  jakarta: '"Plus Jakarta Sans", sans-serif',
  mono:    '"JetBrains Mono", monospace',
};
const EMOJIS = "😀 😅 😂 🤣 😊 😍 🥰 😘 😎 🤩 🤔 😴 🤤 😭 😢 😤 😡 🥺 😳 🤯 🤗 🤝 👍 👏 🙌 🙏 💯 🔥 ✨ 💖 💔 💞 💪 🎉 🎊 🥳 🎁 ☕ 🍕 🍔 🍣 🍜 🍩 🍰 🍷 🍺 ⚽ 🏀 🎮 🎧 🎤 🎬 📷 📚 ✈️ 🚗 🌍 🌙 ☀️ 🌧️ 🌈 ⭐".split(" ");

// =========================================================================
// 2. ENTRY — open the chats route
// =========================================================================
document.addEventListener("orbit:open-chats", (e) => openChats(e.detail?.peerUid || null));

// =========================================================================
// 3. SHELL
// =========================================================================
const openChats = (target) => {
  const content = $("#content");
  content.innerHTML = "";

  content.classList.add("chat-active");

  const removeActive = () => {
    content.classList.remove("chat-active");
  };
  window.addEventListener("hashchange", removeActive, { once: true });

  const route = el("div", { class: "chats-route", id: "chatsRoute" });
  content.appendChild(route);

  const list = el("div", { class: "chats-list" },
    el("div", { class: "head" },
      el("h2", {}, "Chats"),
      el("div", { class: "right" },
        el("button", { class: "icon-btn", title: "New chat", onclick: openNewChatPicker },
          el("i", { class: "ri-edit-box-line" })),
      )),
    el("div", { class: "search" },
      el("input", { type: "text", id: "chatSearch", placeholder: "Search chats" })),
    el("div", { class: "chats-scroll", id: "chatsScroll" },
      el("div", { class: "empty" },
        el("i", { class: "ri-loader-4-line" }),
        el("div", { class: "t" }, "Loading"))),
  );
  route.appendChild(list);

  const view = el("div", { class: "chat-view", id: "chatView" },
    el("div", { class: "chat-empty" },
      el("i", { class: "ri-chat-3-line" }),
      el("div", {}, "Select a chat to start messaging"),
      el("div", { style: "margin-top:6px;color:var(--text-mute);font-size:13px;" }, "or tap the pencil icon to start a new one")),
  );
  route.appendChild(view);

  loadChatsList();

  if (target) {
    openChatById(target);
  }
};

// =========================================================================
// 4. CHAT LIST
// =========================================================================
const loadChatsList = () => {
  const scroll = $("#chatsScroll");
  if (state.chatsUnsub) { state.chatsUnsub(); state.chatsUnsub = null; }

  state.chatsUnsub = onSnapshot(
    query(collection(db, "users", state.uid, "chats"), orderBy("updatedAt", "desc"), limit(80)),
    async (snap) => {
      const groupQs = await getDocs(query(collection(db, "groups"), where("members", "array-contains", state.uid)));
      const groups = groupQs.docs.map((d) => ({
        id: d.id, kind: "group", ...d.data(),
        updatedAt: d.data().lastMessageAt || d.data().createdAt,
      }));

      const dms = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        const peer = await fetchUser(data.peerUid);
        return { id: d.id, kind: "dm", peer, ...data };
      }));

      const all = [...dms, ...groups].sort((a, b) => {
        const av = a.updatedAt?.toMillis?.() || 0, bv = b.updatedAt?.toMillis?.() || 0;
        return bv - av;
      });

      scroll.innerHTML = "";
      if (!all.length) {
        scroll.appendChild(el("div", { class: "empty" },
          el("i", { class: "ri-chat-3-line" }),
          el("div", { class: "t" }, "No chats yet"),
          el("div", {}, "Tap the pencil to start one.")));
        return;
      }

      let totalUnread = 0;
      all.forEach((c) => {
        const node = renderChatRow(c);
        if (c.kind === "dm") totalUnread += c.unread || 0;
        scroll.appendChild(node);
      });
      const pill = $("#chatsPill");
      if (pill) { pill.hidden = totalUnread === 0; pill.textContent = String(totalUnread); }
    });

  $("#chatSearch")?.addEventListener("input", (e) => {
    const q1 = e.target.value.toLowerCase();
    $$("#chatsScroll .chat-row").forEach((row) => {
      const txt = row.dataset.search || "";
      row.style.display = txt.includes(q1) ? "" : "none";
    });
  });
};

const renderChatRow = (c) => {
  const isGroup = c.kind === "group";
  const name = isGroup ? c.name : c.peer?.name || "Unknown";
  const verified = !isGroup && c.peer?.verified;
  const sub = isGroup ? `${(c.members || []).length} members` : (c.peer?.online ? "online" : c.peer?.lastSeen ? `last seen ${fmtTime(c.peer.lastSeen)}` : "");
  const preview = c.lastMessage || (isGroup ? "Tap to open group" : "Say hi");
  const time = fmtTime(c.updatedAt || c.lastMessageAt || c.createdAt);
  const pinned = (state.me.pinnedChats || []).includes(c.id);
  const muted = (state.me.mutedChats || []).includes(c.id);
  const unread = c.unread || 0;

  const row = el("div", {
    class: `chat-row ${pinned ? "pinned" : ""} ${state.activeChat === c.id ? "active" : ""}`,
    data: { search: (name + " " + preview).toLowerCase() },
    onclick: () => openChatById(isGroup ? c.id : c.peerUid),
    oncontextmenu: (e) => { e.preventDefault(); chatRowMenu(c); },
  },
    el("div", { class: "av" },
      el("img", { class: "avatar md",
        src: isGroup
          ? `https://api.dicebear.com/7.x/shapes/svg?seed=${c.id}`
          : avatarFor(c.peer) }),
      !isGroup && c.peer?.online ? el("span", { class: "online" }) : null,
    ),
    el("div", { class: "meta" },
      el("div", { class: "name" }, name,
        verified ? el("span", { class: "verified", html: '<i class="ri-check-line"></i>' }) : null,
        isGroup ? el("i", { class: "ri-group-2-line", style: "color:var(--text-mute);font-size:12px;" }) : null),
      el("div", { class: c.typing ? "preview typing" : "preview" },
        c.typing ? "typing…" : (c.lastFromMe ? el("span", { class: "you" }, "You: ") : null),
        c.typing ? "" : preview),
    ),
    el("div", { class: "right" },
      el("div", { class: "time" }, time),
      muted ? el("i", { class: "ri-notification-off-line muted-icon" }) : null,
      unread > 0 ? el("div", { class: "badge" }, String(unread)) : null,
    ),
  );
  return row;
};

const chatRowMenu = (c) => {
  const pinned = (state.me.pinnedChats || []).includes(c.id);
  const muted = (state.me.mutedChats || []).includes(c.id);
  const opts = [
    { label: pinned ? "Unpin" : "Pin", action: async () =>
        updateDoc(doc(db, "users", state.uid), { pinnedChats: pinned ? arrayRemove(c.id) : arrayUnion(c.id) }) },
    { label: muted ? "Unmute" : "Mute", action: async () =>
        updateDoc(doc(db, "users", state.uid), { mutedChats: muted ? arrayRemove(c.id) : arrayUnion(c.id) }) },
  ];
  if (c.kind === "dm") opts.push({ label: "Delete chat", action: async () => {
    if (!confirm("Delete this chat for you?")) return;
    await deleteDoc(doc(db, "users", state.uid, "chats", c.id));
  }});
  const choice = prompt(opts.map((o, i) => `${i + 1}. ${o.label}`).join("\n") + "\n\nEnter number:");
  const idx = parseInt(choice) - 1;
  if (opts[idx]) opts[idx].action();
};

// =========================================================================
// 5. NEW CHAT PICKER
// =========================================================================
const openNewChatPicker = async () => {
  const u = prompt("Username to message (without @):");
  if (!u) return;
  const qs = await getDocs(query(collection(db, "users"), where("username", "==", u.toLowerCase().replace(/^@/, ""))));
  if (qs.empty) { toast("User not found"); return; }
  openChatById(qs.docs[0].id);
};

// =========================================================================
// 6. OPEN CHAT (DM by uid, or group by id)
// =========================================================================
const dmChatId = (a, b) => [a, b].sort().join("__");

const openChatById = async (target) => {
  if (!target) return;

  let isGroup = false;
  let chatId = null;
  let peer = null;

  const groupSnap = await getDoc(doc(db, "groups", target));
  if (groupSnap.exists()) {
    isGroup = true; chatId = target;
  } else {
    peer = await fetchUser(target);
    if (!peer) { toast("User not found"); return; }
    chatId = dmChatId(state.uid, peer.uid);
    const myChatRef = doc(db, "users", state.uid, "chats", chatId);
    const exists = (await getDoc(myChatRef)).exists();
    if (!exists) {
      await setDoc(myChatRef, {
        peerUid: peer.uid, lastMessage: "", lastFromMe: false, unread: 0,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await updateDoc(myChatRef, { unread: 0 });
  }

  state.activeChat = chatId;
  $("#chatsRoute")?.classList.add("is-open");
  renderChatView({ isGroup, chatId, peer, group: isGroup ? { id: groupSnap.id, ...groupSnap.data() } : null });
  $$("#chatsScroll .chat-row").forEach((r) => r.classList.remove("active"));
};

// =========================================================================
// 7. RENDER CHAT VIEW
// =========================================================================
let typingDebounce = null;
let replyingTo = null;

const renderChatView = ({ isGroup, chatId, peer, group }) => {
  const view = $("#chatView");
  view.innerHTML = "";

  const messagesPath = isGroup ? ["groups", chatId, "messages"] : ["chats", chatId, "messages"];

  const cust = (state.me.chatCustomization || {})[chatId] || {};
  applyChatCustomization(view, cust);

  const head = el("div", { class: "chat-head" },
    el("button", { class: "icon-btn back", onclick: () => $("#chatsRoute").classList.remove("is-open") },
      el("i", { class: "ri-arrow-left-line" })),
    el("img", { class: "avatar md",
      src: isGroup ? `https://api.dicebear.com/7.x/shapes/svg?seed=${chatId}` : avatarFor(peer),
      onclick: () => isGroup ? null : (location.hash = `#profile/${peer.uid}`),
    }),
    el("div", { class: "info" },
      el("div", { class: "name" }, isGroup ? group.name : peer.name,
        !isGroup && peer.verified ? el("span", { class: "verified", html: '<i class="ri-check-line"></i>' }) : null),
      el("div", { class: "sub", id: "chatSub" },
        isGroup ? `${(group.members || []).length} members` :
          (peer.online ? "online" : (peer.lastSeen ? `last seen ${fmtTime(peer.lastSeen)}` : ""))),
    ),
    el("div", { class: "right" },
      el("button", { class: "icon-btn", title: "Search in chat", onclick: () => searchInChat(chatId, isGroup) },
        el("i", { class: "ri-search-line" })),
      el("button", { class: "btn ghost", style: "padding:6px 12px;font-size:13px;gap:6px;", title: "Customize", onclick: () => openCustomize(chatId) },
        el("i", { class: "ri-palette-line" }), el("span", { class: "hide-xs" }, "Customize")),
      el("button", { class: "icon-btn", title: "More options", onclick: () => chatHeaderMenu({ isGroup, chatId, peer, group }) },
        el("i", { class: "ri-more-2-line" })),
    ),
  );
  view.appendChild(head);

  const messages = el("div", { class: "messages", id: "messages" });
  view.appendChild(messages);

  const bottomBar = el("div", { class: "chat-bottom-bar", id: "chatBottomBar" });

  const replyPreview = el("div", { class: "reply-preview hidden", id: "replyPreview" });
  bottomBar.appendChild(replyPreview);

  const attachPreview = el("div", { class: "attach-preview hidden", id: "attachPreviewStrip" });
  bottomBar.appendChild(attachPreview);

  const composerField = el("div", { class: "field", id: "composerField", contenteditable: "true",
    "data-placeholder": "Message", spellcheck: "true" });
  composerField.addEventListener("input", () => {
    const hasText = composerField.textContent.trim().length > 0;
    const sendBtn = bottomBar.querySelector("#sendBtn");
    if (sendBtn) sendBtn.disabled = !hasText && !pendingAttachment;
    if (!isGroup) {
      updateDoc(doc(db, "chats", chatId), { typing: { [state.uid]: serverTimestamp() } }, { merge: true }).catch(async () => {
        await setDoc(doc(db, "chats", chatId), { typing: { [state.uid]: serverTimestamp() } }, { merge: true });
      });
      clearTimeout(typingDebounce);
      typingDebounce = setTimeout(() => {
        updateDoc(doc(db, "chats", chatId), { [`typing.${state.uid}`]: deleteField() }).catch(() => {});
      }, 2200);
    }
    localStorage.setItem(`orbit:draft:${chatId}`, composerField.innerText);
  });
  composerField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });

  const composer = el("div", { class: "composer" },
    el("button", { class: "ctrl", title: "Emoji", onclick: toggleEmojiPicker },
      el("i", { class: "ri-emotion-line" })),
    composerField,
    el("button", { class: "ctrl", title: "Attach photo/video", onclick: () => pickAttachment(chatId) },
      el("i", { class: "ri-image-add-line" })),
    el("button", { class: "send", id: "sendBtn", disabled: true, onclick: send },
      el("i", { class: "ri-send-plane-fill" })),
  );
  bottomBar.appendChild(composer);
  view.appendChild(bottomBar);

  const draft = localStorage.getItem(`orbit:draft:${chatId}`);
  if (draft) {
    composerField.innerText = draft;
    bottomBar.querySelector("#sendBtn").disabled = false;
  }

  if (state.chatUnsub) state.chatUnsub();
  state.chatUnsub = onSnapshot(
    query(collection(db, ...messagesPath), orderBy("createdAt", "asc"), limit(200)),
    async (snap) => await renderMessages(messages, snap, { isGroup, chatId, peer }),
  );

  // Typing/online indicator (DM only)
  if (!isGroup) {
    onSnapshot(doc(db, "chats", chatId), async (s) => {
      const d = s.data() || {};
      const peerTyping = d.typing && d.typing[peer.uid];
      const ts = peerTyping?.toMillis?.() || 0;
      const fresh = Date.now() - ts < 4000;
      const sub = $("#chatSub");
      if (fresh) {
        sub.textContent = "typing…"; sub.classList.add("typing");
      } else {
        const fresh2 = await fetchPeerLive(peer.uid);
        sub.classList.remove("typing");
        sub.textContent = fresh2.online ? "online" : (fresh2.lastSeen ? `last seen ${fmtTime(fresh2.lastSeen)}` : "");
      }
    });
  }

  // =========================================================================
  // FIXED: Optimistic send — clear input & show bubble immediately
  // =========================================================================
  async function send() {
    const field = $("#composerField");
    const text = field.innerText.trim();
    if (!text && !pendingAttachment) return;
    const sendBtn = $("#sendBtn");
    sendBtn.disabled = true;

    // Capture before clearing
    const msgText = text;
    const localAttachment = pendingAttachment;
    const localReply = replyingTo ? { ...replyingTo } : null;

    // === Clear input and show optimistic bubble right away ===
    field.innerText = "";
    localStorage.removeItem(`orbit:draft:${chatId}`);
    clearReply();
    pendingAttachment = null;
    const strip = $("#attachPreviewStrip");
    if (strip) { strip.innerHTML = ""; strip.classList.add("hidden"); }

    const messagesEl = $("#messages");
    if (messagesEl && (msgText || localAttachment)) {
      const tempRow = _buildOptimisticRow(msgText, localReply, !!localAttachment);
      messagesEl.appendChild(tempRow);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    // ===

    try {
      let media = null;
      if (localAttachment) {
        toast("Uploading…");
        media = await uploadToCloudinary(localAttachment, localAttachment.type.startsWith("video") ? "video" : "image");
      }

      const msg = {
        authorUid: state.uid,
        text: msgText || "",
        media,
        replyTo: localReply ? {
          id: localReply.id, text: localReply.text || (localReply.media ? "[media]" : ""),
          authorUid: localReply.authorUid, authorName: localReply.authorName || "",
        } : null,
        reactions: {},
        readBy: [state.uid],
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, ...messagesPath), msg);

      if (isGroup) {
        await updateDoc(doc(db, "groups", chatId), { lastMessage: msgText || "[media]", lastMessageAt: serverTimestamp() });
      } else {
        const updateMeta = async (forUid, otherUid, isMe) => {
          const ref = doc(db, "users", forUid, "chats", chatId);
          const exists = (await getDoc(ref)).exists();
          const data = {
            peerUid: otherUid,
            lastMessage: msgText || "[media]",
            lastFromMe: isMe,
            updatedAt: serverTimestamp(),
          };
          if (!isMe) data.unread = increment(1);
          if (exists) await updateDoc(ref, data); else await setDoc(ref, { ...data, unread: isMe ? 0 : 1, createdAt: serverTimestamp() });
        };
        await Promise.all([
          updateMeta(state.uid, peer.uid, true),
          updateMeta(peer.uid, state.uid, false),
        ]);
        updateDoc(doc(db, "chats", chatId), { [`typing.${state.uid}`]: deleteField() }).catch(() => {});
      }
    } catch (err) {
      // Remove optimistic bubble and restore input on failure
      document.querySelector(".msg-row[data-optimistic='true']")?.remove();
      field.innerText = msgText;
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      toast("Send failed: " + (err.message || "check Firebase config"));
    } finally {
      const field2 = $("#composerField");
      sendBtn.disabled = !field2?.textContent.trim() && !pendingAttachment;
    }
  }
};

// Build an optimistic (pending) message row shown before Firestore confirms
function _buildOptimisticRow(text, replyTo, hasAttachment) {
  const bubble = el("div", { class: "bubble" });

  if (replyTo) {
    bubble.appendChild(el("div", { class: "reply-quote" },
      el("div", { class: "q-name" }, replyTo.authorName || "User"),
      el("div", {}, (replyTo.text || "").slice(0, 120) || "[media]"),
    ));
  }

  if (hasAttachment && !text) {
    bubble.appendChild(el("span", { style: "opacity:.6;font-style:italic;" }, "Uploading…"));
  }

  if (text) {
    const t = el("span", {});
    t.innerHTML = text.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    bubble.appendChild(t);
  }

  const meta = el("span", { class: "meta" });
  meta.appendChild(document.createTextNode(
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  ));
  // Clock icon = "sending" state (like WhatsApp)
  meta.appendChild(el("span", {
    class: "read",
    html: '<i class="ri-time-line" style="opacity:.5;" title="Sending…"></i>',
  }));
  bubble.appendChild(document.createTextNode(" "));
  bubble.appendChild(meta);

  const row = el("div", {
    class: "msg-row from-me",
    data: { optimistic: "true" },
    style: "opacity:0.78;",
  });
  row.appendChild(bubble);
  return row;
}

// =========================================================================
// 8. RENDER MESSAGES (with day dividers, bubbles, reactions, replies)
// =========================================================================
const renderMessages = async (root, snap, { isGroup, chatId, peer }) => {
  const wasNearBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 80;
  root.innerHTML = "";

  if (snap.empty) {
    root.appendChild(el("div", { class: "chat-empty", style: "height:100%;" },
      el("i", { class: "ri-emotion-laugh-line" }),
      el("div", {}, "No messages yet — send the first one")));
    return;
  }

  const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const authorsNeeded = isGroup ? [...new Set(msgs.map((m) => m.authorUid).filter(Boolean))] : [];
  const authorMap = isGroup
    ? Object.fromEntries((await Promise.all(authorsNeeded.map(fetchUser))).filter(Boolean).map((u) => [u.uid, u]))
    : { [peer?.uid]: peer, [state.uid]: state.me };

  let lastDayKey = null;
  let lastAuthor = null;

  for (const m of msgs) {
    const ts = m.createdAt?.toDate?.() || new Date();
    const dayKey = ts.toDateString();
    if (dayKey !== lastDayKey) {
      root.appendChild(el("div", { class: "day-divider", text: fmtDay(m.createdAt) }));
      lastDayKey = dayKey;
      lastAuthor = null;
    }

    if (m.type === "system") {
      root.appendChild(el("div", { class: "system-msg", text: m.text }));
      continue;
    }

    const fromMe = m.authorUid === state.uid;
    const author = authorMap[m.authorUid];
    const showAv = isGroup && !fromMe && lastAuthor !== m.authorUid;

    if (!m.readBy?.includes(state.uid)) {
      const path = isGroup ? ["groups", chatId, "messages", m.id] : ["chats", chatId, "messages", m.id];
      updateDoc(doc(db, ...path), { readBy: arrayUnion(state.uid) }).catch(() => {});
    }

    const bubble = el("div", { class: "bubble" });
    if (isGroup && !fromMe) bubble.appendChild(el("div", { class: "sender", text: author?.name || "User" }));

    if (m.replyTo) {
      bubble.appendChild(el("div", { class: "reply-quote", onclick: () => jumpToMessage(m.replyTo.id) },
        el("div", { class: "q-name", text: m.replyTo.authorName || authorMap[m.replyTo.authorUid]?.name || "User" }),
        el("div", { text: (m.replyTo.text || "").slice(0, 120) || "[media]" }),
      ));
    }

    if (m.media?.url) {
      const mediaWrap = el("div", { class: "b-media" },
        m.media.type === "video"
          ? el("video", { src: m.media.url, controls: "" })
          : el("img", { src: m.media.url, loading: "lazy" }),
      );
      bubble.appendChild(mediaWrap);
    }

    if (m.text) {
      const t = el("span", {});
      if (m.deleted) {
        t.innerHTML = '<i class="ri-error-warning-line"></i> Message deleted';
        t.style.opacity = ".7"; t.style.fontStyle = "italic";
      } else {
        t.innerHTML = linkify(m.text);
      }
      bubble.appendChild(t);
    }

    const meta = el("span", { class: "meta" });
    if (m.editedAt) meta.appendChild(el("span", { class: "edited", text: "edited · " }));
    meta.appendChild(document.createTextNode(fmtTime(m.createdAt)));
    if (fromMe) {
      const seen = (m.readBy || []).filter((u) => u !== state.uid).length > 0;
      meta.appendChild(el("span", { class: "read", html: seen ? '<i class="ri-check-double-line"></i>' : '<i class="ri-check-line"></i>' }));
    }
    bubble.appendChild(document.createTextNode(" "));
    bubble.appendChild(meta);

    if (m.reactions && Object.keys(m.reactions).length) {
      const counts = {};
      for (const emoji of Object.values(m.reactions)) counts[emoji] = (counts[emoji] || 0) + 1;
      const rx = el("div", { class: "reactions" });
      for (const [emoji, cnt] of Object.entries(counts)) {
        rx.appendChild(el("span", {}, emoji + (cnt > 1 ? " " + cnt : "")));
      }
      bubble.appendChild(rx);
    }

    const actions = el("div", { class: "msg-actions" },
      el("button", { title: "React", onclick: (e) => openReactPicker(e, m, isGroup, chatId) }, el("i", { class: "ri-emotion-line" })),
      el("button", { title: "Reply", onclick: () => setReply(m, author?.name) }, el("i", { class: "ri-reply-line" })),
      el("button", { title: "Copy", onclick: () => { navigator.clipboard.writeText(m.text || ""); toast("Copied"); } }, el("i", { class: "ri-file-copy-line" })),
      fromMe && !m.deleted ? el("button", { title: "Edit", onclick: () => editMessage(m, isGroup, chatId) }, el("i", { class: "ri-edit-line" })) : null,
      fromMe ? el("button", { title: "Delete", onclick: () => deleteMessage(m, isGroup, chatId) }, el("i", { class: "ri-delete-bin-line" })) : null,
    );
    bubble.appendChild(actions);

    const row = el("div", {
      class: `msg-row ${fromMe ? "from-me" : ""} ${!showAv && !fromMe ? "no-av" : ""}`,
      data: { id: m.id },
      ontouchstart: (e) => { row._tx = e.touches[0].clientX; },
      ontouchmove: (e) => {
        if (row._tx == null) return;
        const dx = e.touches[0].clientX - row._tx;
        if (Math.abs(dx) > 10) row.style.transform = `translateX(${dx * 0.3}px)`;
      },
      ontouchend: (e) => {
        if (row._tx == null) return;
        const dx = (e.changedTouches[0].clientX - row._tx);
        row.style.transform = "";
        if (Math.abs(dx) > 60) setReply(m, author?.name);
        row._tx = null;
      },
    });
    if (!fromMe) row.appendChild(el("img", { class: "av", src: avatarFor(author), style: showAv ? "" : "visibility:hidden;" }));
    row.appendChild(bubble);
    root.appendChild(row);

    lastAuthor = m.authorUid;
  }

  if (wasNearBottom) root.scrollTop = root.scrollHeight;
};

// =========================================================================
// 9. REPLY / EDIT / DELETE / REACT
// =========================================================================
const setReply = (m, authorName) => {
  replyingTo = { ...m, authorName };
  const p = $("#replyPreview");
  p.innerHTML = "";
  p.classList.remove("hidden");
  p.appendChild(el("div", { class: "bar" }));
  p.appendChild(el("div", { class: "info" },
    el("div", { class: "name", text: `Replying to ${authorName || "user"}` }),
    el("div", { class: "text", text: (m.text || (m.media ? "[media]" : "")).slice(0, 140) }),
  ));
  p.appendChild(el("button", { class: "icon-btn", onclick: clearReply }, el("i", { class: "ri-close-line" })));
  $("#composerField")?.focus();
};
const clearReply = () => {
  replyingTo = null;
  $("#replyPreview")?.classList.add("hidden");
};

const editMessage = async (m, isGroup, chatId) => {
  const next = prompt("Edit message", m.text || "");
  if (next == null || next === m.text) return;
  const path = isGroup ? ["groups", chatId, "messages", m.id] : ["chats", chatId, "messages", m.id];
  await updateDoc(doc(db, ...path), { text: next, editedAt: serverTimestamp() });
};

const deleteMessage = async (m, isGroup, chatId) => {
  const choice = confirm("Delete for everyone?\n\nOK = delete for everyone\nCancel = keep");
  if (!choice) return;
  const path = isGroup ? ["groups", chatId, "messages", m.id] : ["chats", chatId, "messages", m.id];
  await updateDoc(doc(db, ...path), { deleted: true, text: "", media: null });
};

const openReactPicker = (e, m, isGroup, chatId) => {
  e.stopPropagation();
  $$(".react-picker").forEach((n) => n.remove());
  const quick = ["❤️", "😂", "😮", "😢", "👍", "🔥"];
  const picker = el("div", { class: "react-picker" });
  quick.forEach((emo) => picker.appendChild(el("button", { onclick: async () => {
    const path = isGroup ? ["groups", chatId, "messages", m.id] : ["chats", chatId, "messages", m.id];
    const cur = m.reactions || {};
    const mine = cur[state.uid];
    if (mine === emo) await updateDoc(doc(db, ...path), { [`reactions.${state.uid}`]: deleteField() });
    else await updateDoc(doc(db, ...path), { [`reactions.${state.uid}`]: emo });
    picker.remove();
  }}, emo)));
  e.target.closest(".bubble").appendChild(picker);
  setTimeout(() => document.addEventListener("click", () => picker.remove(), { once: true }), 0);
};

// =========================================================================
// 10. EMOJI PICKER + ATTACHMENTS
// =========================================================================
let pendingAttachment = null;

const toggleEmojiPicker = (e) => {
  e.stopPropagation();
  $$(".emoji-picker").forEach((n) => n.remove());
  const picker = el("div", { class: "emoji-picker" });
  EMOJIS.forEach((emo) => picker.appendChild(el("button", { onclick: () => {
    const f = $("#composerField");
    f.focus();
    document.execCommand?.("insertText", false, emo);
    $("#sendBtn").disabled = !f.textContent.trim();
  }}, emo)));
  $("#chatView").appendChild(picker);
  setTimeout(() => document.addEventListener("click", function once(ev) {
    if (!picker.contains(ev.target)) picker.remove();
    else document.addEventListener("click", once, { once: true });
  }, { once: true }), 0);
};

const pickAttachment = (chatId) => {
  const input = el("input", { type: "file", accept: "image/*,video/*", style: "display:none;" });
  document.body.appendChild(input);
  input.click();
  input.onchange = () => {
    pendingAttachment = input.files[0] || null;
    input.remove();
    if (!pendingAttachment) return;

    const strip = $("#attachPreviewStrip");
    if (strip) {
      strip.innerHTML = "";
      strip.classList.remove("hidden");
      const objUrl = URL.createObjectURL(pendingAttachment);
      const preview = pendingAttachment.type.startsWith("video")
        ? el("video", { src: objUrl, muted: "true", playsinline: "" })
        : el("img", { src: objUrl });
      const removeBtn = el("button", { class: "remove", title: "Remove",
        onclick: () => {
          pendingAttachment = null;
          strip.innerHTML = ""; strip.classList.add("hidden");
          const f = $("#composerField");
          $("#sendBtn").disabled = !f?.textContent.trim();
        }
      }, el("i", { class: "ri-close-line" }));
      strip.appendChild(preview);
      strip.appendChild(removeBtn);
      strip.appendChild(el("span", { style: "font-size:13px;color:var(--text-dim);", text: pendingAttachment.name }));
    }
    $("#sendBtn").disabled = false;
  };
};

// =========================================================================
// 11. CUSTOMIZATION DRAWER
// =========================================================================
const openCustomize = (chatId) => {
  const drawer = $("#chatCustomize");
  drawer.classList.remove("hidden");

  const cust = (state.me.chatCustomization || {})[chatId] || {};
  const wpHost = $("#wallpapers");
  wpHost.innerHTML = "";
  WALLPAPERS.forEach((wp) => {
    const tile = el("div", { class: `wallpaper wp-${wp.id} ${cust.wallpaper === wp.id ? "active" : ""}`, title: wp.name,
      onclick: () => saveCust(chatId, { wallpaper: wp.id }) });
    if (wp.id === "none") tile.appendChild(el("span", {}, "None"));
    wpHost.appendChild(tile);
  });

  const swHost = $("#bubbleSwatches");
  swHost.innerHTML = "";
  BUBBLE_COLORS.forEach((c) => {
    const sw = el("div", { class: `swatch ${cust.bubbleColor === c ? "active" : ""}`, style: `background:${c};`,
      onclick: () => saveCust(chatId, { bubbleColor: c }) });
    swHost.appendChild(sw);
  });

  $$("#bubbleShape button").forEach((b) => {
    b.classList.toggle("active", (cust.shape || "rounded") === b.dataset.shape);
    b.onclick = () => saveCust(chatId, { shape: b.dataset.shape });
  });
  $$("#bubbleFont button").forEach((b) => {
    b.classList.toggle("active", (cust.font || "inter") === b.dataset.font);
    b.onclick = () => saveCust(chatId, { font: b.dataset.font });
  });
  const sizeInput = $("#bubbleSize");
  sizeInput.value = cust.size || 15;
  sizeInput.oninput = () => saveCust(chatId, { size: Number(sizeInput.value) });
};

const saveCust = async (chatId, patch) => {
  const cur = (state.me.chatCustomization || {})[chatId] || {};
  const merged = { ...cur, ...patch };
  const updated = { ...(state.me.chatCustomization || {}), [chatId]: merged };
  state.me.chatCustomization = updated;
  applyChatCustomization($("#chatView"), merged);
  if (patch.bubbleColor || patch.wallpaper || patch.shape || patch.font) openCustomize(chatId);
  await updateDoc(doc(db, "users", state.uid), { chatCustomization: updated }).catch(() => {});
};

const applyChatCustomization = (view, cust) => {
  if (!view) return;
  const wp = WALLPAPERS.find((w) => w.id === (cust.wallpaper || "none"));
  view.style.setProperty("--chat-wallpaper", wp?.css || "");
  view.style.setProperty("--bubble-bg-me", cust.bubbleColor || "linear-gradient(135deg, var(--grad-1), var(--grad-2))");
  view.style.setProperty("--bubble-size", (cust.size || 15) + "px");
  view.style.setProperty("--bubble-font", FONT_MAP[cust.font || "inter"]);
  view.dataset.shape = cust.shape || "rounded";
};

// =========================================================================
// 12. EXTRAS
// =========================================================================
const searchInChat = (chatId, isGroup) => {
  const q1 = prompt("Search messages")?.trim().toLowerCase();
  if (!q1) return;
  const matches = $$(".bubble").filter((b) => b.textContent.toLowerCase().includes(q1));
  if (!matches.length) { toast("No matches"); return; }
  matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
  matches[0].animate(
    [{ outline: "2px solid var(--primary)" }, { outline: "2px solid transparent" }],
    { duration: 1500 },
  );
  toast(`${matches.length} match${matches.length > 1 ? "es" : ""}`);
};

const chatHeaderMenu = ({ isGroup, chatId, peer, group }) => {
  const opts = [];
  const muted = (state.me.mutedChats || []).includes(chatId);
  opts.push({ label: muted ? "Unmute notifications" : "Mute notifications", action: async () =>
    updateDoc(doc(db, "users", state.uid), { mutedChats: muted ? arrayRemove(chatId) : arrayUnion(chatId) }) });

  if (isGroup) {
    opts.push({ label: "Copy invite link", action: async () => {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#chats/${chatId}`);
      toast("Invite link copied");
    }});
    opts.push({ label: "View members", action: async () => {
      const names = await Promise.all((group.members || []).map((u) => fetchUser(u).then((x) => x?.name || u)));
      alert("Members:\n" + names.join("\n"));
    }});
    if (group.ownerUid === state.uid) {
      opts.push({ label: "Delete group", action: async () => {
        if (!confirm("Delete group for everyone?")) return;
        await deleteDoc(doc(db, "groups", chatId));
        location.hash = "#chats";
      }});
    } else {
      opts.push({ label: "Leave group", action: async () => {
        await updateDoc(doc(db, "groups", chatId), { members: arrayRemove(state.uid) });
        location.hash = "#chats";
      }});
    }
  } else {
    opts.push({ label: "View profile", action: () => location.hash = `#profile/${peer.uid}` });
    opts.push({ label: "Clear my history", action: async () => {
      if (!confirm("Clear this chat from your side?")) return;
      const qs = await getDocs(collection(db, "chats", chatId, "messages"));
      const ops = qs.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(ops);
      toast("Cleared");
    }});
  }

  const choice = prompt(opts.map((o, i) => `${i + 1}. ${o.label}`).join("\n") + "\n\nEnter number:");
  const idx = parseInt(choice) - 1;
  if (opts[idx]) opts[idx].action();
};

const jumpToMessage = (id) => {
  const node = $$(`.msg-row`).find((r) => r.dataset.id === id);
  if (!node) { toast("Message not in view — scroll up"); return; }
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.querySelector(".bubble")?.animate(
    [{ outline: "2px solid var(--primary)" }, { outline: "2px solid transparent" }],
    { duration: 1500 },
  );
};

const fetchPeerLive = async (uid) => {
  const s = await getDoc(doc(db, "users", uid));
  return s.data() || {};
};

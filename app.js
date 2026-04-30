/* ============================================================
 * PITCH — the social app for hustlers
 * Bold. Dark. Fully functional.
 * ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
  authDomain: "crypto-6517d.firebaseapp.com",
  projectId: "crypto-6517d",
  storageBucket: "crypto-6517d.firebasestorage.app",
  messagingSenderId: "60263975159",
  appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

const CLOUDINARY = {
  cloudName: "ddtdqrh1b",
  uploadPreset: "profile-pictures",
};

const APP = { name:"PITCH", currency:"₦", defaultAvatar:"https://api.dicebear.com/7.x/notionists/svg?seed=" };

if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith("YOUR_")) {
  document.getElementById("setupScreen").classList.remove("hidden");
  throw new Error("Fill in FIREBASE_CONFIG in app.js");
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit, getDocs,
  onSnapshot, serverTimestamp, increment, arrayUnion, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const fbApp = initializeApp(FIREBASE_CONFIG);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

/* ── STATE ── */
const STATE = {
  user: null, profile: null,
  listeners: [],
  cache: { posts: new Map(), profiles: new Map() },
};

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const view = () => document.getElementById("view");

function clearListeners(){
  STATE.listeners.forEach(u => { try { u(); } catch{} });
  STATE.listeners = [];
}

/* ── UTILS ── */
function esc(s){
  if(s==null) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function timeAgo(ts){
  if(!ts) return "now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now()-d.getTime())/1000);
  if(s<60) return s+"s";
  if(s<3600) return Math.floor(s/60)+"m";
  if(s<86400) return Math.floor(s/3600)+"h";
  if(s<604800) return Math.floor(s/86400)+"d";
  return d.toLocaleDateString();
}
function money(n){ return APP.currency + Number(n||0).toLocaleString(); }
function avatar(seed){ return APP.defaultAvatar + encodeURIComponent(seed||"anon"); }

function toast(msg, kind=""){
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  document.getElementById("toastRoot").appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .3s"; }, 2600);
  setTimeout(()=> t.remove(), 3000);
}

function modal(html, onMount){
  const r = document.getElementById("modalRoot");
  r.innerHTML = `<div class="modal-card">${html}</div>`;
  r.classList.remove("hidden");
  r.onclick = e => { if(e.target===r) closeModal(); };
  if(onMount) onMount(r.querySelector(".modal-card"));
}
function closeModal(){
  const r = document.getElementById("modalRoot");
  r.classList.add("hidden");
  r.innerHTML = "";
}

function svg(n){
  const M = {
    heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    comment:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    bookmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    more:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
    photo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    video:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4z" fill="currentColor"/></svg>',
    tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    sparkle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
    mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 1 1-14 0v-2M12 19v3"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    location:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    flame:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 0h1.5a2.5 2.5 0 0 1 0 5H18M4 22h16M10 14.66V17c0 .55.47.98.97 1.21l1.06.49a2 2 0 0 0 1.94 0l1.06-.49c.5-.23.97-.66.97-1.21v-2.34M18 2H6v7a6 6 0 0 0 12 0z"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11l3-2h7a2 2 0 0 0 2-2z"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    compass:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    msg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    person:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    leaderboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>',
  };
  return M[n]||"";
}

/* ── CLOUDINARY UPLOAD ── */
async function uploadFile(file, onProgress){
  return new Promise((res,rej)=>{
    const xhr = new XMLHttpRequest();
    const fd  = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY.uploadPreset);
    const isVid = file.type.startsWith("video/");
    xhr.open("POST",`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${isVid?"video":"image"}/upload`);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded/e.total);
    xhr.onload = ()=>{
      if(xhr.status>=200&&xhr.status<300){
        const r=JSON.parse(xhr.responseText);
        res({url:r.secure_url, type:isVid?"video":"image"});
      } else rej(new Error("Upload failed: "+xhr.status));
    };
    xhr.onerror = ()=>rej(new Error("Network error"));
    xhr.send(fd);
  });
}

/* ================================================================
   AUTH
   ================================================================ */
function bindAuth(){
  $$(".auth-tab").forEach(t => t.addEventListener("click",()=>{
    $$(".auth-tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    const w = t.dataset.tab;
    $("#loginForm").classList.toggle("hidden", w!=="login");
    $("#signupForm").classList.toggle("hidden", w!=="signup");
  }));

  $("#loginForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const err=$("#loginError"); err.textContent="";
    try {
      await signInWithEmailAndPassword(auth, $("#loginEmail").value, $("#loginPassword").value);
    } catch(ex){ err.textContent = authErr(ex.code)||ex.message; }
  });

  $("#signupForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const err=$("#signupError"); err.textContent="";
    const name   = $("#signupName").value.trim();
    const handle = $("#signupHandle").value.trim().toLowerCase().replace(/[^a-z0-9_]/g,"");
    const email  = $("#signupEmail").value.trim();
    const pwd    = $("#signupPassword").value;
    if(handle.length<3){ err.textContent="Username needs 3+ characters (a-z, 0-9, _)"; return; }
    try {
      const taken = await getDoc(doc(db,"handles",handle));
      if(taken.exists()){ err.textContent="Username already taken"; return; }
      const cred = await createUserWithEmailAndPassword(auth, email, pwd);
      await updateProfile(cred.user,{displayName:name});
      await setDoc(doc(db,"users",cred.user.uid),{
        uid:cred.user.uid, name, handle, handleLower:handle, email,
        avatar:avatar(handle),
        cover:"https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=70",
        bio:"", city:"", cityLower:"", trade:"",
        createdAt:serverTimestamp(),
        verifiedNeighbor:false, vouchedBy:[], trustScore:50,
        followers:0, following:0, followingList:[],
        postsCount:0, salesTotal:0, salesCount:0,
        tipsTotal:0, earningsTotal:0, balance:0,
      });
      await setDoc(doc(db,"handles",handle),{uid:cred.user.uid});
    } catch(ex){ err.textContent = authErr(ex.code)||ex.message; }
  });
}

function authErr(code){
  return {
    "auth/email-already-in-use":"Email already in use — try logging in",
    "auth/invalid-email":"Invalid email address",
    "auth/weak-password":"Password too weak (6+ characters)",
    "auth/wrong-password":"Wrong password",
    "auth/user-not-found":"No account with that email",
    "auth/invalid-credential":"Incorrect email or password",
    "auth/too-many-requests":"Too many attempts — try again later",
  }[code];
}

function bindOnboard(){
  $("#onboardForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const city  = $("#onboardCity").value.trim();
    const trade = $("#onboardTrade").value;
    const bio   = $("#onboardBio").value.trim();
    if(!city||!trade) return;
    await updateDoc(doc(db,"users",STATE.user.uid),{
      city, cityLower:city.toLowerCase(), trade, bio,
    });
    STATE.profile = {...STATE.profile, city, cityLower:city.toLowerCase(), trade, bio};
    await ensureRoom();
    showApp();
  });
}

async function ensureRoom(){
  if(!STATE.profile?.city||!STATE.profile?.trade) return;
  const rid = roomId(STATE.profile.city, STATE.profile.trade);
  const rr  = doc(db,"rooms",rid);
  const s   = await getDoc(rr);
  if(!s.exists()){
    await setDoc(rr,{
      id:rid,
      name:`${STATE.profile.trade.split(" ")[0]} · ${STATE.profile.city}`,
      city:STATE.profile.city, cityLower:STATE.profile.cityLower,
      trade:STATE.profile.trade,
      memberCount:1, createdAt:serverTimestamp(), lastActivity:serverTimestamp(),
    });
  } else { await updateDoc(rr,{memberCount:increment(1)}).catch(()=>{}); }
  await setDoc(doc(db,"rooms",rid,"members",STATE.user.uid),{uid:STATE.user.uid,joinedAt:serverTimestamp()});
}
function roomId(city,trade){ return (city+"_"+trade).toLowerCase().replace(/[^a-z0-9]+/g,"_"); }

/* ================================================================
   BOOT & ROUTING
   ================================================================ */
onAuthStateChanged(auth, async user=>{
  if(!user){ STATE.user=null; STATE.profile=null; showAuth(); return; }
  STATE.user = user;
  const s = await getDoc(doc(db,"users",user.uid));
  if(!s.exists()){ showOnboard(); return; }
  STATE.profile = s.data();
  if(!STATE.profile.city||!STATE.profile.trade){ showOnboard(); return; }
  showApp();
});

function showAuth(){
  $("#authScreen").classList.remove("hidden");
  $("#onboardScreen").classList.add("hidden");
  $("#appShell").classList.add("hidden");
}
function showOnboard(){
  $("#authScreen").classList.add("hidden");
  $("#onboardScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
}
function showApp(){
  $("#authScreen").classList.add("hidden");
  $("#onboardScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  const av = STATE.profile.avatar||avatar(STATE.profile.handle);
  $("#navAvatar").src = av;
  $("#bottomAvatar").src = av;
  if(!location.hash) location.hash = "#/home";
  else route();
  watchNotifDot();
}

window.addEventListener("hashchange", route);

const ROUTES = {
  home:viewHome, reels:viewReels, discover:viewDiscover,
  create:viewCreate, rooms:viewRooms, room:viewRoom,
  dms:viewDMs, leaderboard:viewLeaderboard, challenges:viewChallenges,
  earnings:viewEarnings, notifications:viewNotifications,
  settings:viewSettings, profile:viewProfile, stall:viewStall, post:viewPost,
};

function route(){
  if(!STATE.user||!STATE.profile) return;
  clearListeners();
  const hash = location.hash.replace(/^#\//,"") || "home";
  const [name,...rest] = hash.split("/");
  const handler = ROUTES[name]||viewHome;
  view().innerHTML = `<div class="empty-state"><p>Loading...</p></div>`;
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  highlightNav(name);
  handler(rest.join("/"));
}

function highlightNav(name){
  $$(".nav-icon,.side-link,.bt").forEach(el=>{
    el.classList.toggle("active", el.dataset.route===name);
  });
}

/* ================================================================
   HOME FEED
   ================================================================ */
async function viewHome(){
  view().innerHTML = `
    <div class="stories-bar" id="storiesBar">
      <div class="story-cell" onclick="location.hash='#/create'">
        <div class="story-ring seen" style="position:relative">
          <img src="${esc(STATE.profile.avatar||avatar(STATE.profile.handle))}" alt="" />
          <span class="story-add-btn">+</span>
        </div>
        <span class="story-name">Your Story</span>
      </div>
    </div>
    <div class="composer">
      <img src="${esc(STATE.profile.avatar||avatar(STATE.profile.handle))}" alt="" />
      <button class="composer-prompt" onclick="location.hash='#/create'">What are you pitching today?</button>
      <div class="composer-actions">
        <button class="composer-action video" onclick="location.hash='#/create'">${svg("video")} Reel</button>
        <button class="composer-action photo" onclick="location.hash='#/create'">${svg("photo")} Photo</button>
        <button class="composer-action product" onclick="location.hash='#/create'">${svg("tag")} Sell</button>
      </div>
    </div>
    <div id="feedList"></div>
  `;

  const list = document.getElementById("feedList");
  list.innerHTML = `<div class="empty-state"><p>Loading feed...</p></div>`;
  try {
    const q = query(collection(db,"posts"), orderBy("createdAt","desc"), limit(40));
    const unsub = onSnapshot(q, snap=>{
      if(snap.empty){ list.innerHTML = emptyHTML("No posts yet","Be the first to pitch something.","flame"); return; }
      list.innerHTML = "";
      snap.docs.forEach(d=>{
        const p = {id:d.id,...d.data()};
        STATE.cache.posts.set(p.id,p);
        list.appendChild(renderPost(p));
      });
    }, err=>{
      list.innerHTML = `<div class="empty-state"><h3>Couldn't load feed</h3><p>${esc(err.message)}</p></div>`;
    });
    STATE.listeners.push(unsub);
  } catch(e){
    list.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${esc(e.message)}</p></div>`;
  }

  loadSideRails();
}

/* ── POST CARD ── */
function renderPost(post){
  const card = document.createElement("article");
  card.className = "post";
  card.dataset.postId = post.id;

  const liked = (post.likedBy||[]).includes(STATE.user.uid);
  const saved = (post.savedBy||[]).includes(STATE.user.uid);
  const hasMedia = !!post.mediaUrl;
  const isText = !hasMedia && !post.productName;

  card.innerHTML = `
    <div class="post-head">
      <img class="post-avatar" src="${esc(post.authorAvatar||avatar(post.authorHandle))}" data-stall="${esc(post.authorHandle)}" alt="" />
      <div class="post-who">
        <div class="post-who-name" data-stall="${esc(post.authorHandle)}">
          ${esc(post.authorName||post.authorHandle)}
          ${post.authorVerified?`<span class="verified-badge">${svg("check")}</span>`:""}
          ${(post.trustScore||0)>=80?`<span class="trust-badge">${svg("check")} Trusted</span>`:""}
        </div>
        <div class="post-who-meta">
          @${esc(post.authorHandle)}
          ${post.city?`<span class="dot-sep"></span>${esc(post.city)}`:""}
          ${post.trade?`<span class="dot-sep"></span>${esc(post.trade.split(" ")[0])}`:""}
          <span class="dot-sep"></span>${timeAgo(post.createdAt)}
        </div>
      </div>
      <button class="post-more" data-action="more">${svg("more")}</button>
    </div>

    ${isText
      ? `<div class="post-caption text-only">${esc(post.caption||"")}</div>`
      : (post.caption ? `<div class="post-caption">${esc(post.caption)}</div>` : "")
    }

    ${hasMedia?`
      <div class="post-media">
        ${post.mediaType==="video"
          ? `<video src="${esc(post.mediaUrl)}" controls preload="metadata" playsinline></video>`
          : `<img src="${esc(post.mediaUrl)}" loading="lazy" alt="" />`}
        ${post.productName?`
          <div class="product-overlay">
            <div class="product-info-tag">
              <div class="product-name-tag">${esc(post.productName)}</div>
              <div class="product-price-tag">${money(post.productPrice)}</div>
            </div>
            <button class="buy-now-btn" data-action="buy">Buy Now</button>
          </div>`:""}
      </div>`:""}

    <div class="post-actions">
      <button class="act-btn ${liked?"liked":""}" data-action="like">${svg("heart")} ${post.likes||0}</button>
      <button class="act-btn" data-action="comment">${svg("comment")} ${post.commentsCount||0}</button>
      <button class="act-btn" data-action="share">${svg("share")} ${post.shares||0}</button>
      <span class="act-spacer"></span>
      <button class="act-btn" style="font-size:11px">${svg("eye")} ${post.views||0}</button>
      <button class="act-btn ${saved?"saved":""}" data-action="save">${svg("bookmark")}</button>
    </div>

    <div class="post-meta">
      ${(post.likes||0)>0?`<div class="post-likes-count">${post.likes} ${post.likes===1?"like":"likes"}</div>`:""}
      ${(post.commentsCount||0)>0?`<div class="post-caption-preview" data-action="open-comments">View all ${post.commentsCount} comments</div>`:""}
      <div class="post-time">${timeAgo(post.createdAt)}</div>
    </div>
    <div class="comments-area hidden" data-comments></div>
  `;

  trackView(post.id);

  card.addEventListener("click", e=>{
    const action = e.target.closest("[data-action]")?.dataset.action;
    const stall  = e.target.closest("[data-stall]")?.dataset.stall;
    if(stall){ location.hash=`#/stall/${stall}`; return; }
    if(!action) return;
    if(action==="like") doLike(post.id, card);
    if(action==="save") doSave(post.id, card);
    if(action==="comment"||action==="open-comments") openComments(post.id, card);
    if(action==="share") doShare(post);
    if(action==="buy") doBuy(post);
    if(action==="more") postMenu(post);
  });
  return card;
}

function emptyHTML(title, sub, icon){
  return `<div class="empty-state">${svg(icon||"photo")}<h3>${esc(title)}</h3><p>${esc(sub)}</p></div>`;
}

const viewedPosts = new Set();
function trackView(id){
  if(viewedPosts.has(id)) return;
  viewedPosts.add(id);
  setTimeout(()=> updateDoc(doc(db,"posts",id),{views:increment(1)}).catch(()=>{}), 2000);
}

async function doLike(postId, card){
  const btn   = card.querySelector('[data-action="like"]');
  const liked = btn.classList.contains("liked");
  try {
    const ref = doc(db,"posts",postId);
    if(liked){
      await updateDoc(ref,{likes:increment(-1),likedBy:arrayRemove(STATE.user.uid)});
    } else {
      await updateDoc(ref,{likes:increment(1),likedBy:arrayUnion(STATE.user.uid)});
      const p = STATE.cache.posts.get(postId);
      if(p&&p.authorUid&&p.authorUid!==STATE.user.uid){
        addDoc(collection(db,"users",p.authorUid,"notifications"),{
          type:"like", fromUid:STATE.user.uid, fromName:STATE.profile.name,
          fromHandle:STATE.profile.handle, fromAvatar:STATE.profile.avatar,
          postId, read:false, createdAt:serverTimestamp(),
        }).catch(()=>{});
      }
    }
  } catch{ toast("Couldn't update like","error"); }
}

async function doSave(postId, card){
  const saved = card.querySelector('[data-action="save"]').classList.contains("saved");
  try {
    const ref = doc(db,"posts",postId);
    if(saved) await updateDoc(ref,{savedBy:arrayRemove(STATE.user.uid)});
    else { await updateDoc(ref,{savedBy:arrayUnion(STATE.user.uid)}); toast("Saved!"); }
  } catch{ toast("Couldn't save","error"); }
}

async function doShare(post){
  const url = `${location.origin}${location.pathname}#/post/${post.id}`;
  try {
    if(navigator.share) await navigator.share({title:post.authorName,text:post.caption,url});
    else { await navigator.clipboard.writeText(url); toast("Link copied!"); }
    updateDoc(doc(db,"posts",post.id),{shares:increment(1)}).catch(()=>{});
  } catch{}
}

function doBuy(post){
  modal(`
    <h2>Buy ${esc(post.productName)}</h2>
    <p class="lead">${money(post.productPrice)} · from @${esc(post.authorHandle)}</p>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
      Tap Message Seller to complete the order in chat. Direct payment via Flutterwave / Paystack / M-Pesa lands in v2.
    </p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="dmSellerBtn">${svg("msg")} Message Seller</button>
    </div>
  `, card=>{
    card.querySelector("#dmSellerBtn").onclick = async ()=>{
      closeModal();
      const cid = await getOrCreateConvo(post.authorUid, post.authorName, post.authorHandle, post.authorAvatar);
      if(cid) location.hash=`#/dms/${cid}`;
    };
  });
}

function postMenu(post){
  const mine = post.authorUid===STATE.user.uid;
  modal(`
    <h2>Options</h2>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
      <button class="btn-secondary" id="mCopy">Copy link</button>
      ${mine
        ? `<button class="btn-secondary" id="mDelete" style="color:var(--danger)">Delete pitch</button>`
        : `<button class="btn-secondary" id="mReport">Report</button>`}
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, card=>{
    card.querySelector("#mCopy").onclick = async ()=>{
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/post/${post.id}`);
      toast("Link copied!"); closeModal();
    };
    if(mine){
      card.querySelector("#mDelete").onclick = async ()=>{
        if(!confirm("Delete this pitch?")) return;
        await deleteDoc(doc(db,"posts",post.id));
        await updateDoc(doc(db,"users",STATE.user.uid),{postsCount:increment(-1)}).catch(()=>{});
        toast("Deleted"); closeModal();
      };
    } else {
      card.querySelector("#mReport").onclick = ()=>{ toast("Reported. Thank you."); closeModal(); };
    }
  });
}

async function openComments(postId, card){
  const area = card.querySelector("[data-comments]");
  if(!area.classList.contains("hidden")){ area.classList.add("hidden"); return; }
  area.classList.remove("hidden");
  area.innerHTML = `<p style="color:var(--text-muted);font-size:12px">Loading...</p>`;

  const q = query(collection(db,"posts",postId,"comments"), orderBy("createdAt","asc"), limit(50));
  const unsub = onSnapshot(q, snap=>{
    area.innerHTML = "";
    snap.docs.forEach(d=>{
      const c = d.data();
      const w = document.createElement("div");
      w.className = "comment";
      w.innerHTML = `
        <img src="${esc(c.authorAvatar||avatar(c.authorHandle))}" alt="" />
        <div style="flex:1">
          <div class="comment-bubble">
            <span class="comment-author">${esc(c.authorName)}</span>${esc(c.text)}
          </div>
          <div class="comment-meta">${timeAgo(c.createdAt)}</div>
        </div>`;
      area.appendChild(w);
    });
    const row = document.createElement("div");
    row.className = "comment-input-row";
    row.innerHTML = `
      <img src="${esc(STATE.profile.avatar||avatar(STATE.profile.handle))}" alt="" />
      <input type="text" placeholder="Add a comment..." />
      <button>Post</button>`;
    area.appendChild(row);
    const inp = row.querySelector("input");
    const btn = row.querySelector("button");
    const sub = async ()=>{
      const txt = inp.value.trim(); if(!txt) return;
      inp.value = "";
      await addDoc(collection(db,"posts",postId,"comments"),{
        text:txt, authorUid:STATE.user.uid, authorName:STATE.profile.name,
        authorHandle:STATE.profile.handle, authorAvatar:STATE.profile.avatar,
        createdAt:serverTimestamp(),
      });
      await updateDoc(doc(db,"posts",postId),{commentsCount:increment(1)});
    };
    btn.onclick = sub;
    inp.onkeydown = e=>{ if(e.key==="Enter") sub(); };
  });
  STATE.listeners.push(unsub);
}

/* ================================================================
   REELS
   ================================================================ */
async function viewReels(){
  view().innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "reels-view";
  wrap.innerHTML = `<div class="reels-scroller" id="reelsScroller"><div class="reels-empty"><p>Loading reels...</p></div></div>`;
  document.body.appendChild(wrap);

  try {
    const q = query(collection(db,"posts"), where("isPitch","==",true), limit(30));
    const snap = await getDocs(q);
    const docs = snap.docs.sort((a,b)=>{
      const at=a.data().createdAt?a.data().createdAt.toDate():new Date(0);
      const bt=b.data().createdAt?b.data().createdAt.toDate():new Date(0);
      return bt-at;
    });
    const sc = wrap.querySelector("#reelsScroller");
    if(!docs.length){
      sc.innerHTML=`<div class="reels-empty">${svg("video")}<h3>No reels yet</h3><p>Record the first one.</p><button class="btn-primary" onclick="document.querySelectorAll('.reels-view').forEach(x=>x.remove());location.hash='#/create'">Create Reel</button></div>`;
      return;
    }
    sc.innerHTML="";
    docs.forEach((d,i)=>{ const p={id:d.id,...d.data()}; STATE.cache.posts.set(p.id,p); sc.appendChild(renderReel(p,i)); });

    const obs = new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        const v=e.target.querySelector("video"); if(!v) return;
        if(e.isIntersecting&&e.intersectionRatio>0.6) v.play().catch(()=>{});
        else v.pause();
      });
    },{threshold:[0,0.6,1]});
    sc.querySelectorAll(".reel").forEach(el=>obs.observe(el));
  } catch(e){
    wrap.querySelector("#reelsScroller").innerHTML=`<div class="reels-empty"><h3>Failed to load</h3><p>${esc(e.message)}</p></div>`;
  }
  STATE.listeners.push(()=>wrap.remove());
}

function renderReel(post,idx){
  const reel = document.createElement("div");
  reel.className = "reel";
  const liked = (post.likedBy||[]).includes(STATE.user.uid);
  reel.innerHTML=`
    ${post.mediaType==="video"
      ?`<video src="${esc(post.mediaUrl)}" loop muted playsinline preload="metadata"></video>`
      :`<img src="${esc(post.mediaUrl)}" alt="" />`}
    <div class="reel-gradient"></div>
    <div class="reel-info">
      <div class="reel-author-row" data-stall="${esc(post.authorHandle)}">
        <img src="${esc(post.authorAvatar||avatar(post.authorHandle))}" alt="" />
        <div>
          <div class="reel-author-name">@${esc(post.authorHandle)} ${post.authorVerified?svg("check"):""}</div>
          <div class="reel-author-sub">${esc(post.city||"")} · ${timeAgo(post.createdAt)}</div>
        </div>
      </div>
      ${post.caption?`<div class="reel-caption">${esc(post.caption)}</div>`:""}
      ${post.productName?`
        <div class="reel-product-card" data-action="buy">
          <div><div class="rp-name">${esc(post.productName)}</div><div class="rp-price">${money(post.productPrice)}</div></div>
          <span class="rp-buy">Buy Now</span>
        </div>`:""}
    </div>
    <div class="reel-rail">
      <div class="rr-btn" data-action="visit-stall">
        <img class="av" src="${esc(post.authorAvatar||avatar(post.authorHandle))}" alt="" />
        <span>Visit</span>
      </div>
      <div class="rr-btn ${liked?"liked":""}" data-action="like">${svg("heart")}<span>${post.likes||0}</span></div>
      <div class="rr-btn" data-action="comment">${svg("comment")}<span>${post.commentsCount||0}</span></div>
      <div class="rr-btn" data-action="share">${svg("share")}<span>Share</span></div>
      <div class="rr-btn" data-action="more">${svg("more")}<span>More</span></div>
    </div>`;

  reel.addEventListener("click",e=>{
    const action=e.target.closest("[data-action]")?.dataset.action;
    const stall=e.target.closest("[data-stall]")?.dataset.stall;
    if(stall||action==="visit-stall"){ document.querySelectorAll(".reels-view").forEach(x=>x.remove()); location.hash=`#/stall/${post.authorHandle}`; return; }
    if(action==="like"){
      const btn=reel.querySelector('[data-action="like"]');
      const was=btn.classList.contains("liked");
      btn.classList.toggle("liked");
      btn.querySelector("span").textContent=(parseInt(btn.querySelector("span").textContent)||0)+(was?-1:1);
      likeRaw(post.id,was);
    }
    if(action==="comment") commentsModal(post.id);
    if(action==="share") doShare(post);
    if(action==="buy") doBuy(post);
    if(action==="more") postMenu(post);
    if(!action&&e.target.tagName==="VIDEO"){ const v=e.target; v.paused?v.play().catch(()=>{}):v.pause(); }
  });
  setTimeout(()=>trackView(post.id),2000);
  return reel;
}

async function likeRaw(postId,wasLiked){
  try {
    const r=doc(db,"posts",postId);
    if(wasLiked) await updateDoc(r,{likes:increment(-1),likedBy:arrayRemove(STATE.user.uid)});
    else await updateDoc(r,{likes:increment(1),likedBy:arrayUnion(STATE.user.uid)});
  } catch{}
}

function commentsModal(postId){
  modal(`
    <h2>Comments</h2>
    <div id="cList" style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin:12px 0"></div>
    <div class="comment-input-row" style="margin-top:0">
      <img src="${esc(STATE.profile.avatar||avatar(STATE.profile.handle))}" alt="" />
      <input type="text" id="cIn" placeholder="Add a comment..." />
      <button id="cBtn">Post</button>
    </div>
  `, card=>{
    const list=card.querySelector("#cList");
    const q=query(collection(db,"posts",postId,"comments"),orderBy("createdAt","asc"),limit(80));
    const u=onSnapshot(q,snap=>{
      list.innerHTML="";
      snap.docs.forEach(d=>{
        const c=d.data();
        const w=document.createElement("div");
        w.className="comment";
        w.innerHTML=`<img src="${esc(c.authorAvatar||avatar(c.authorHandle))}" alt="" /><div style="flex:1"><div class="comment-bubble"><span class="comment-author">${esc(c.authorName)}</span>${esc(c.text)}</div><div class="comment-meta">${timeAgo(c.createdAt)}</div></div>`;
        list.appendChild(w);
      });
    });
    STATE.listeners.push(u);
    const inp=card.querySelector("#cIn");
    card.querySelector("#cBtn").onclick=async()=>{
      const txt=inp.value.trim(); if(!txt) return;
      inp.value="";
      await addDoc(collection(db,"posts",postId,"comments"),{
        text:txt, authorUid:STATE.user.uid, authorName:STATE.profile.name,
        authorHandle:STATE.profile.handle, authorAvatar:STATE.profile.avatar,
        createdAt:serverTimestamp(),
      });
      await updateDoc(doc(db,"posts",postId),{commentsCount:increment(1)}).catch(()=>{});
    };
    inp.onkeydown=e=>{ if(e.key==="Enter") card.querySelector("#cBtn").click(); };
  });
}

/* ================================================================
   DISCOVER
   ================================================================ */
async function viewDiscover(){
  view().innerHTML=`
    <div class="discover-section">
      <div class="category-chips" id="catChips">
        <div class="cat-chip active" data-cat="">${svg("flame")} All</div>
        <div class="cat-chip" data-cat="Fashion / Clothing">${svg("tag")} Fashion</div>
        <div class="cat-chip" data-cat="Food / Baking / Catering">${svg("flame")} Food</div>
        <div class="cat-chip" data-cat="Hair / Braiding / Barbing">${svg("sparkle")} Hair</div>
        <div class="cat-chip" data-cat="Beauty / Makeup / Nails">${svg("sparkle")} Beauty</div>
        <div class="cat-chip" data-cat="Tech / Gadgets">${svg("bolt")} Tech</div>
        <div class="cat-chip" data-cat="Reselling / Thrifting">${svg("tag")} Reselling</div>
        <div class="cat-chip" data-cat="Tutoring / Coaching">${svg("trophy")} Tutoring</div>
        <div class="cat-chip" data-cat="Crafts / Art / Photography">${svg("photo")} Crafts</div>
      </div>
    </div>
    <div class="discover-section">
      <div class="discover-section-head">
        <h3>Top Hustlers Near You</h3>
        <a href="#/leaderboard" class="discover-section-more">See all</a>
      </div>
      <div class="hustler-row" id="discHustlers"></div>
    </div>
    <div class="discover-section">
      <div class="discover-section-head"><h3>Trending Pitches</h3></div>
      <div class="discover-grid" id="discGrid"></div>
    </div>
  `;

  /* category chips */
  document.getElementById("catChips").querySelectorAll(".cat-chip").forEach(chip=>{
    chip.onclick=()=>{
      document.querySelectorAll(".cat-chip").forEach(c=>c.classList.remove("active"));
      chip.classList.add("active");
      loadDiscoverGrid(chip.dataset.cat);
    };
  });

  /* top hustlers */
  try {
    const q = query(collection(db,"users"), where("cityLower","==",STATE.profile.cityLower), limit(20));
    const snap = await getDocs(q);
    const top = snap.docs.sort((a,b)=>(b.data().salesTotal||0)-(a.data().salesTotal||0)).slice(0,10);
    const row = document.getElementById("discHustlers");
    if(!top.length){ row.innerHTML=`<p style="color:var(--text-muted);font-size:13px;padding:8px">No hustlers in your city yet — be first!</p>`; }
    else {
      row.innerHTML="";
      top.forEach(d=>{
        const u=d.data();
        const el=document.createElement("div");
        el.className="hustler-card";
        el.innerHTML=`<img src="${esc(u.avatar||avatar(u.handle))}" alt="" /><div class="hc-name">@${esc(u.handle)}</div><div class="hc-sales">${money(u.salesTotal||0)}</div>`;
        el.onclick=()=>location.hash=`#/stall/${u.handle}`;
        row.appendChild(el);
      });
    }
  } catch{}

  loadDiscoverGrid("");
}

async function loadDiscoverGrid(cat){
  const grid = document.getElementById("discGrid");
  if(!grid) return;
  grid.innerHTML=`<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-muted)">Loading...</div>`;
  try {
    let q;
    if(cat) q = query(collection(db,"posts"), where("trade","==",cat), limit(30));
    else     q = query(collection(db,"posts"), orderBy("likes","desc"), limit(30));
    const snap = await getDocs(q);
    if(snap.empty){ grid.innerHTML=`<div style="grid-column:1/-1">${emptyHTML("Nothing here yet","Be the first to post in this category","photo")}</div>`; return; }
    grid.innerHTML="";
    const docs = cat ? snap.docs.sort((a,b)=>(b.data().likes||0)-(a.data().likes||0)) : snap.docs;
    docs.forEach(d=>{
      const p={id:d.id,...d.data()};
      const cell=document.createElement("div");
      cell.className="discover-cell";
      if(p.mediaUrl){
        cell.innerHTML=p.mediaType==="video"
          ?`<video src="${esc(p.mediaUrl)}" muted></video>`
          :`<img src="${esc(p.mediaUrl)}" loading="lazy" alt="" />`;
      } else {
        cell.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:10px;font-size:12px;text-align:center;font-weight:700">${esc((p.caption||"").slice(0,60))}</div>`;
      }
      cell.innerHTML+=`<div class="discover-cell-overlay"><span class="dc-stat">${svg("heart")} ${p.likes||0}</span><span class="dc-stat">${svg("comment")} ${p.commentsCount||0}</span></div>`;
      cell.onclick=()=>location.hash=`#/post/${p.id}`;
      grid.appendChild(cell);
    });
  } catch(e){
    grid.innerHTML=`<div style="grid-column:1/-1">${emptyHTML("Couldn't load",e.message,"photo")}</div>`;
  }
}

/* ================================================================
   CREATE
   ================================================================ */
function viewCreate(){
  view().innerHTML=`
    <div class="view-pane">
      <h2>Create a Pitch</h2>
      <p class="lead">Photo, reel, or text — add a product to make it sellable.</p>
      <div class="create-tabs">
        <button class="create-tab active" data-create="reel">${svg("video")} Reel</button>
        <button class="create-tab" data-create="photo">${svg("photo")} Photo</button>
        <button class="create-tab" data-create="text">${svg("comment")} Text</button>
      </div>
      <div id="mediaArea">
        <div class="media-drop" id="mediaDrop">
          ${svg("video")}
          <p><strong>Tap to upload a vertical video</strong></p>
          <p style="font-size:12px;margin-top:4px">9:16 ratio works best · Up to 60s</p>
          <input type="file" id="fileInput" accept="video/*" hidden />
        </div>
        <div class="media-preview hidden" id="mediaPreview"></div>
        <div class="upload-progress hidden" id="uploadProgress"><div class="upload-progress-bar" id="progBar"></div></div>
      </div>
      <div class="ai-tools">
        <button class="ai-chip" data-ai="caption">${svg("sparkle")} Smart Caption</button>
        <button class="ai-chip" data-ai="voice">${svg("mic")} Voice → Listing</button>
        <button class="ai-chip" data-ai="studio">${svg("sparkle")} AI Studio</button>
      </div>
      <div class="form-row"><label>Caption</label><textarea id="captionInput" rows="3" placeholder="Tell the story. What is this? Who is it for?"></textarea></div>
      <div class="form-row-2">
        <div class="form-row"><label>Product name (optional)</label><input type="text" id="prodName" placeholder="e.g. Box braids waist length" /></div>
        <div class="form-row"><label>Price (optional)</label><input type="number" id="prodPrice" placeholder="0" min="0" /></div>
      </div>
      <div class="create-actions">
        <button class="btn-ghost" onclick="history.back()">Cancel</button>
        <button class="btn-primary" id="publishBtn">${svg("bolt")} Publish</button>
      </div>
    </div>`;

  let ms = {file:null, type:"reel", isPitch:true};
  const tabs=$$("[data-create]"), drop=$("#mediaDrop"), fi=$("#fileInput"), prev=$("#mediaPreview"), prog=$("#uploadProgress"), bar=$("#progBar");

  function setType(t){
    ms.type=t; ms.isPitch=(t==="reel");
    tabs.forEach(x=>x.classList.toggle("active",x.dataset.create===t));
    if(t==="text"){ $("#mediaArea").style.display="none"; }
    else {
      $("#mediaArea").style.display="block";
      drop.classList.toggle("hidden",!!ms.file);
      fi.accept=t==="reel"?"video/*":"image/*";
      drop.querySelector("p strong").textContent=t==="reel"?"Tap to upload a vertical video":"Tap to upload a photo";
    }
  }
  tabs.forEach(t=>t.addEventListener("click",()=>setType(t.dataset.create)));
  drop.addEventListener("click",()=>fi.click());
  fi.addEventListener("change",e=>{
    const f=e.target.files[0]; if(!f) return;
    ms.file=f; drop.classList.add("hidden"); prev.classList.remove("hidden");
    const url=URL.createObjectURL(f);
    prev.innerHTML=f.type.startsWith("video/")?`<video src="${url}" controls playsinline></video>`:`<img src="${url}" alt="" />`;
  });
  $$("[data-ai]").forEach(c=>c.onclick=()=>toast("AI feature coming in v2 — needs API key"));

  $("#publishBtn").onclick=async()=>{
    const caption=$("#captionInput").value.trim();
    const prodName=$("#prodName").value.trim();
    const prodPrice=parseFloat($("#prodPrice").value||"0");
    if(ms.type!=="text"&&!ms.file){ toast("Pick a file first","error"); return; }
    if(ms.type==="text"&&!caption){ toast("Add some text first","error"); return; }
    const btn=$("#publishBtn"); btn.disabled=true; btn.textContent="Publishing...";
    try {
      let mediaUrl=null, mediaType=null;
      if(ms.file){
        prog.classList.remove("hidden");
        const up=await uploadFile(ms.file,p=>bar.style.width=(p*100).toFixed(0)+"%");
        mediaUrl=up.url; mediaType=up.type;
      }
      await addDoc(collection(db,"posts"),{
        type:ms.type, isPitch:ms.isPitch,
        mediaUrl, mediaType, caption,
        productName:prodName||null, productPrice:prodPrice||null, currency:APP.currency,
        authorUid:STATE.user.uid, authorName:STATE.profile.name,
        authorHandle:STATE.profile.handle, authorAvatar:STATE.profile.avatar,
        authorVerified:!!STATE.profile.verifiedNeighbor,
        trustScore:STATE.profile.trustScore||50,
        city:STATE.profile.city, cityLower:STATE.profile.cityLower,
        trade:STATE.profile.trade,
        likes:0, likedBy:[], commentsCount:0, shares:0, savedBy:[], views:0,
        createdAt:serverTimestamp(),
      });
      await updateDoc(doc(db,"users",STATE.user.uid),{postsCount:increment(1)}).catch(()=>{});
      toast("Pitch published!","success");
      location.hash="#/home";
    } catch(e){ toast("Failed: "+e.message,"error"); btn.disabled=false; btn.innerHTML=svg("bolt")+" Publish"; }
  };
}

/* ================================================================
   ROOMS
   ================================================================ */
async function viewRooms(rest){
  if(rest&&rest.length) return viewRoom(rest);
  view().innerHTML=`
    <div class="view-pane" style="padding-bottom:0">
      <h2>Trade Rooms</h2>
      <p class="lead">Group chats by trade and city. Find your people, share tips, swap referrals.</p>
    </div>
    <div class="rooms-grid" id="roomsGrid"></div>`;

  const grid=document.getElementById("roomsGrid");
  grid.innerHTML=`<div class="empty-state"><p>Loading rooms...</p></div>`;
  try {
    const myId=roomId(STATE.profile.city,STATE.profile.trade);
    const q=query(collection(db,"rooms"),where("cityLower","==",STATE.profile.cityLower),limit(40));
    const snap=await getDocs(q);
    if(snap.empty){ grid.innerHTML=emptyHTML("No rooms in "+STATE.profile.city,"Rooms are created when members post. Start pitching!","chat"); return; }
    const docs=snap.docs.sort((a,b)=>(b.data().memberCount||0)-(a.data().memberCount||0));
    grid.innerHTML="";
    docs.forEach(d=>{
      const r={id:d.id,...d.data()};
      const el=document.createElement("div");
      el.className="room-card";
      el.innerHTML=`
        <div class="room-emoji">💬</div>
        <div class="room-title">${esc(r.trade.split(" ")[0])} · ${esc(r.city)}</div>
        <div class="room-desc">${esc(r.trade)}</div>
        <div class="room-meta">${svg("person")} ${r.memberCount||1} members</div>
        ${r.id===myId?`<div class="room-badge">${svg("check")} Your Room</div>`:""}`;
      el.onclick=()=>location.hash=`#/rooms/${r.id}`;
      grid.appendChild(el);
    });
  } catch(e){ grid.innerHTML=emptyHTML("Couldn't load rooms",e.message,"chat"); }
}

async function viewRoom(rid){
  const rref=doc(db,"rooms",rid);
  const rsnap=await getDoc(rref);
  if(!rsnap.exists()){ view().innerHTML=emptyHTML("Room not found","","chat"); return; }
  const r={id:rsnap.id,...rsnap.data()};
  await setDoc(doc(db,"rooms",rid,"members",STATE.user.uid),{uid:STATE.user.uid,joinedAt:serverTimestamp()},{merge:true});

  view().innerHTML=`
    <div class="room-view">
      <div class="room-head">
        <button class="room-back" onclick="location.hash='#/rooms'">${svg("back")}</button>
        <div class="room-head-info">
          <h2>${esc(r.trade.split(" ")[0])} · ${esc(r.city)}</h2>
          <div class="room-sub">${r.memberCount||1} members · ${esc(r.trade)}</div>
        </div>
      </div>
      <div class="chat-stream" id="chatStream"></div>
      <div class="chat-input-row">
        <input type="text" id="roomInput" placeholder="Message the room..." />
        <button class="btn-primary" id="roomSend">${svg("send")}</button>
      </div>
    </div>`;

  const stream=document.getElementById("chatStream");
  const q=query(collection(db,"rooms",rid,"messages"),orderBy("createdAt","asc"),limit(100));
  const unsub=onSnapshot(q,snap=>{
    stream.innerHTML="";
    snap.docs.forEach(d=>{
      const m=d.data(); const mine=m.uid===STATE.user.uid;
      const w=document.createElement("div");
      w.className="chat-msg"+(mine?" mine":"");
      w.innerHTML=`
        ${!mine?`<img class="av" src="${esc(m.avatar||avatar(m.handle))}" alt="" />`:""}
        <div class="chat-bubble">
          ${!mine?`<div class="ca" data-stall="${esc(m.handle)}">@${esc(m.handle)}</div>`:""}
          ${esc(m.text)}<div class="ct">${timeAgo(m.createdAt)}</div>
        </div>`;
      stream.appendChild(w);
    });
    stream.scrollTop=stream.scrollHeight;
  });
  STATE.listeners.push(unsub);

  const send=async()=>{
    const inp=document.getElementById("roomInput");
    const txt=inp.value.trim(); if(!txt) return;
    inp.value="";
    await addDoc(collection(db,"rooms",rid,"messages"),{
      uid:STATE.user.uid, name:STATE.profile.name, handle:STATE.profile.handle,
      avatar:STATE.profile.avatar, text:txt, createdAt:serverTimestamp(),
    });
    await updateDoc(rref,{lastActivity:serverTimestamp()}).catch(()=>{});
  };
  document.getElementById("roomSend").onclick=send;
  document.getElementById("roomInput").onkeydown=e=>{ if(e.key==="Enter") send(); };
  stream.addEventListener("click",e=>{ const s=e.target.closest("[data-stall]")?.dataset.stall; if(s) location.hash=`#/stall/${s}`; });
}

/* ================================================================
   DMS
   ================================================================ */
async function viewDMs(rest){
  view().innerHTML=`
    <div class="dms-layout">
      <div class="dm-list">
        <div class="dm-list-head">Messages</div>
        <div class="dm-search"><input type="text" placeholder="Search conversations..." /></div>
        <div id="dmListBody"></div>
      </div>
      <div class="dm-pane empty" id="dmPane">
        <div>${svg("msg")}<br/><h3 style="margin-top:8px">Your Messages</h3><p style="font-size:13px;margin-top:4px">Open a stall and tap Message</p></div>
      </div>
    </div>`;

  const lb=document.getElementById("dmListBody");
  const q=query(collection(db,"users",STATE.user.uid,"conversations"),orderBy("lastActivity","desc"),limit(50));
  const unsub=onSnapshot(q,snap=>{
    if(snap.empty){ lb.innerHTML=`<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No messages yet</div>`; return; }
    lb.innerHTML="";
    snap.docs.forEach(d=>{
      const c={id:d.id,...d.data()};
      const el=document.createElement("div");
      el.className="dm-row"+(rest&&rest===c.id?" active":"");
      el.dataset.cid=c.id;
      el.innerHTML=`
        <img src="${esc(c.peerAvatar||avatar(c.peerHandle))}" alt="" />
        <div class="dm-row-info">
          <div class="dm-row-name">${esc(c.peerName||c.peerHandle)}</div>
          <div class="dm-row-last">${esc(c.lastMessage||"")}</div>
        </div>
        <div class="dm-row-time">${timeAgo(c.lastActivity)}</div>`;
      el.onclick=()=>{ $$(".dm-row").forEach(x=>x.classList.remove("active")); el.classList.add("active"); location.hash=`#/dms/${c.id}`; openDM(c.id); };
      lb.appendChild(el);
    });
  });
  STATE.listeners.push(unsub);
  if(rest) openDM(rest);
}

async function openDM(cid){
  const pane=document.getElementById("dmPane");
  if(!pane) return;
  pane.classList.remove("empty");
  pane.innerHTML=`<div class="empty-state"><p>Loading...</p></div>`;
  const cref=doc(db,"users",STATE.user.uid,"conversations",cid);
  const csnap=await getDoc(cref);
  if(!csnap.exists()){ pane.innerHTML=emptyHTML("Conversation not found","","msg"); return; }
  const conv=csnap.data();

  pane.innerHTML=`
    <div class="room-head">
      <button class="room-back" onclick="location.hash='#/dms'">${svg("back")}</button>
      <img src="${esc(conv.peerAvatar||avatar(conv.peerHandle))}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" alt="" />
      <div class="room-head-info">
        <h2 data-stall="${esc(conv.peerHandle)}" style="cursor:pointer">${esc(conv.peerName)}</h2>
        <div class="room-sub">@${esc(conv.peerHandle)}</div>
      </div>
    </div>
    <div class="chat-stream" id="dmStream"></div>
    <div class="chat-input-row">
      <input type="text" id="dmInput" placeholder="Message ${esc(conv.peerName)}..." />
      <button class="btn-primary" id="dmSend">${svg("send")}</button>
    </div>`;

  pane.querySelector("[data-stall]").onclick=()=>location.hash=`#/stall/${conv.peerHandle}`;
  const stream=document.getElementById("dmStream");
  const q=query(collection(db,"conversations",cid,"messages"),orderBy("createdAt","asc"),limit(100));
  const unsub=onSnapshot(q,snap=>{
    stream.innerHTML="";
    snap.docs.forEach(d=>{
      const m=d.data(); const mine=m.uid===STATE.user.uid;
      const w=document.createElement("div");
      w.className="chat-msg"+(mine?" mine":"");
      w.innerHTML=`${!mine?`<img class="av" src="${esc(conv.peerAvatar||avatar(conv.peerHandle))}" alt="" />`:""}
        <div class="chat-bubble">${esc(m.text)}<div class="ct">${timeAgo(m.createdAt)}</div></div>`;
      stream.appendChild(w);
    });
    stream.scrollTop=stream.scrollHeight;
  });
  STATE.listeners.push(unsub);

  const send=async()=>{
    const inp=document.getElementById("dmInput");
    const txt=inp.value.trim(); if(!txt) return;
    inp.value="";
    await addDoc(collection(db,"conversations",cid,"messages"),{uid:STATE.user.uid,text:txt,createdAt:serverTimestamp()});
    const lastData={lastMessage:txt,lastActivity:serverTimestamp()};
    await updateDoc(cref,lastData).catch(()=>{});
    await setDoc(doc(db,"users",conv.peerUid,"conversations",cid),{
      cid, peerUid:STATE.user.uid, peerName:STATE.profile.name,
      peerHandle:STATE.profile.handle, peerAvatar:STATE.profile.avatar,
      ...lastData,
    },{merge:true});
  };
  document.getElementById("dmSend").onclick=send;
  document.getElementById("dmInput").onkeydown=e=>{ if(e.key==="Enter") send(); };
}

async function getOrCreateConvo(peerUid,peerName,peerHandle,peerAvatar){
  if(peerUid===STATE.user.uid){ toast("Can't message yourself"); return null; }
  const cid=[STATE.user.uid,peerUid].sort().join("_");
  await setDoc(doc(db,"users",STATE.user.uid,"conversations",cid),{
    cid, peerUid, peerName, peerHandle, peerAvatar,
    lastMessage:"", lastActivity:serverTimestamp(),
  },{merge:true});
  await setDoc(doc(db,"users",peerUid,"conversations",cid),{
    cid, peerUid:STATE.user.uid, peerName:STATE.profile.name,
    peerHandle:STATE.profile.handle, peerAvatar:STATE.profile.avatar,
    lastMessage:"", lastActivity:serverTimestamp(),
  },{merge:true});
  return cid;
}

/* ================================================================
   LEADERBOARD
   ================================================================ */
async function viewLeaderboard(){
  view().innerHTML=`
    <div class="leader-header">
      <h2 style="font-size:22px;font-weight:900">Local Top 10</h2>
      <p style="color:var(--text-muted);font-size:14px;margin-top:4px">Top hustlers in your city. Climb the board, get featured.</p>
      <div class="leader-filter-row">
        <select id="lCity">
          <option value="${esc(STATE.profile.cityLower)}">${esc(STATE.profile.city)}</option>
          <option value="">All cities</option>
        </select>
        <select id="lMetric">
          <option value="salesTotal">Top Earners</option>
          <option value="postsCount">Most Active</option>
          <option value="trustScore">Most Trusted</option>
          <option value="followers">Most Followed</option>
        </select>
      </div>
    </div>
    <div class="leader-list" id="lList"></div>`;

  async function load(){
    const list=document.getElementById("lList");
    list.innerHTML=`<div class="empty-state"><p>Loading...</p></div>`;
    const city=document.getElementById("lCity").value;
    const metric=document.getElementById("lMetric").value;
    try {
      const q = city
        ? query(collection(db,"users"),where("cityLower","==",city),limit(30))
        : query(collection(db,"users"),limit(30));
      const snap=await getDocs(q);
      if(snap.empty){ list.innerHTML=emptyHTML("No data yet","Post and sell to appear on the leaderboard","trophy"); return; }
      const sorted=snap.docs.sort((a,b)=>(b.data()[metric]||0)-(a.data()[metric]||0)).slice(0,10);
      list.innerHTML="";
      sorted.forEach((d,i)=>{
        const u=d.data();
        const rc=i===0?"gold":i===1?"silver":i===2?"bronze":"";
        const val=metric==="salesTotal"?money(u[metric]||0):(u[metric]||0);
        const lbl=metric==="salesTotal"?"earned":metric==="postsCount"?"pitches":metric==="trustScore"?"trust":"followers";
        const row=document.createElement("div");
        row.className="leader-row";
        row.onclick=()=>location.hash=`#/stall/${u.handle}`;
        row.innerHTML=`
          <div class="leader-rank ${rc}">${i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
          <img src="${esc(u.avatar||avatar(u.handle))}" alt="" />
          <div class="leader-info">
            <div class="leader-name">${esc(u.name)} ${u.verifiedNeighbor?`<span class="verified-badge">${svg("check")}</span>`:""}</div>
            <div class="leader-meta">@${esc(u.handle)} · ${esc(u.trade||"")} · ${esc(u.city||"")}</div>
          </div>
          <div class="leader-score">
            <div class="leader-score-num">${val}</div>
            <div class="leader-score-lbl">${lbl}</div>
          </div>`;
        list.appendChild(row);
      });
    } catch(e){ list.innerHTML=emptyHTML("Couldn't load",e.message,"trophy"); }
  }
  document.getElementById("lCity").onchange=load;
  document.getElementById("lMetric").onchange=load;
  load();
}

/* ================================================================
   CHALLENGES
   ================================================================ */
async function viewChallenges(){
  view().innerHTML=`
    <div class="view-pane" style="padding-bottom:0">
      <h2>Pitch Challenges</h2>
      <p class="lead">Weekly themed contests. Top 3 win cash + featured placement.</p>
    </div>
    <div class="challenges-list" id="chList"></div>`;

  const list=document.getElementById("chList");
  try {
    const q=query(collection(db,"challenges"),orderBy("createdAt","desc"),limit(20));
    let snap=await getDocs(q);
    if(snap.empty){ await seedChallenges(); snap=await getDocs(q); }
    if(snap.empty){ list.innerHTML=emptyHTML("No challenges yet","Check back soon!","trophy"); return; }
    list.innerHTML="";
    snap.docs.forEach(d=>{
      const c={id:d.id,...d.data()};
      const days=c.endDate?Math.max(0,Math.ceil(((c.endDate.toDate?c.endDate.toDate():new Date(c.endDate))-Date.now())/86400000)):7;
      const el=document.createElement("div");
      el.className="challenge-card";
      el.innerHTML=`
        <div class="challenge-icon">${svg("trophy")}</div>
        <div class="challenge-body">
          <div class="challenge-prize">${svg("bolt")} ${money(c.prizeAmount)} prize pool</div>
          <div class="challenge-title">${esc(c.title)}</div>
          <div class="challenge-desc">${esc(c.description)}</div>
          <div class="challenge-meta">
            <span>${svg("location")} ${esc(c.scope||"Global")}</span>
            <span>${svg("person")} ${(c.entries||[]).length} entries</span>
            <span>${svg("flame")} ${Math.floor(days)} days left</span>
          </div>
          <button class="btn-primary" style="margin-top:12px" onclick="location.hash='#/create'">${svg("video")} Enter Challenge</button>
        </div>`;
      list.appendChild(el);
    });
  } catch(e){ list.innerHTML=emptyHTML("Couldn't load",e.message,"trophy"); }
}

async function seedChallenges(){
  const seeds=[
    {title:"Best outfit under ₦5K",description:"Show your most fire fit under ₦5,000. Pitch it like you're selling it.",prizeAmount:50000,scope:"Global",entries:[]},
    {title:"Most creative food setup",description:"Show your food, your stall, your hustle. Make us hungry.",prizeAmount:30000,scope:"Global",entries:[]},
    {title:"Hair transformation of the week",description:"Before & after. Braids, locks, color — pitch your skills.",prizeAmount:40000,scope:"Global",entries:[]},
  ];
  for(const s of seeds) await addDoc(collection(db,"challenges"),{...s,createdAt:serverTimestamp(),endDate:new Date(Date.now()+7*86400000)});
}

/* ================================================================
   EARNINGS
   ================================================================ */
async function viewEarnings(){
  const p=STATE.profile;
  view().innerHTML=`
    <div class="earn-hero">
      <div class="earn-hero-label">Available Balance</div>
      <div class="earn-hero-amount">${money(p.balance||0)}</div>
      <div class="earn-hero-sub">All-time earnings: ${money(p.earningsTotal||0)}</div>
      <div class="earn-stats-row">
        <div class="earn-stat"><div class="earn-stat-num">${p.salesCount||0}</div><div class="earn-stat-lbl">Sales</div></div>
        <div class="earn-stat"><div class="earn-stat-num">${money(p.tipsTotal||0)}</div><div class="earn-stat-lbl">Tips</div></div>
        <div class="earn-stat"><div class="earn-stat-num">${p.postsCount||0}</div><div class="earn-stat-lbl">Pitches</div></div>
      </div>
    </div>
    <div style="padding:16px">
      <div class="advance-banner">
        <div class="advance-icon">${svg("bolt")}</div>
        <div class="advance-txt">
          <h4>Sales-Backed Advance</h4>
          <p>Unlock instant restock advance after 30 days of sales.</p>
        </div>
        <button class="btn-secondary" id="advBtn">${(p.salesCount||0)>=5?"Apply":"Locked"}</button>
      </div>
      <button class="btn-primary" style="width:100%;justify-content:center;margin-bottom:16px" id="cashBtn">${svg("money")} Request Cash Out</button>
    </div>
    <div class="earn-section">
      <h3>Recent Activity</h3>
      <div id="earnAct"></div>
    </div>`;

  document.getElementById("advBtn").onclick=()=>{
    if((p.salesCount||0)<5){ toast("Need 5+ sales first"); return; }
    toast("Application received — we'll respond within 24h");
  };
  document.getElementById("cashBtn").onclick=async()=>{
    const amt=parseFloat(prompt("Amount to withdraw (min ₦2,000)?")||"0");
    if(!amt||amt<2000){ toast("Minimum ₦2,000"); return; }
    if(amt>(p.balance||0)){ toast("Insufficient balance"); return; }
    await addDoc(collection(db,"payoutRequests"),{
      uid:STATE.user.uid, handle:STATE.profile.handle,
      amount:amt, currency:APP.currency, status:"pending", createdAt:serverTimestamp(),
    });
    toast("Cash-out request submitted!","success");
  };

  const act=document.getElementById("earnAct");
  try {
    const q=query(collection(db,"users",STATE.user.uid,"earnings"),orderBy("createdAt","desc"),limit(20));
    const unsub=onSnapshot(q,snap=>{
      if(snap.empty){ act.innerHTML=`<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center">No earnings yet — your first sale shows here.</div>`; return; }
      act.innerHTML="";
      snap.docs.forEach(d=>{
        const e=d.data();
        const row=document.createElement("div");
        row.className="earn-row";
        row.innerHTML=`
          <div class="earn-row-icon">${svg(e.kind==="tip"?"heart":"money")}</div>
          <div class="earn-row-info">
            <div class="earn-row-title">${esc(e.title||"Earning")}</div>
            <div class="earn-row-sub">${timeAgo(e.createdAt)}</div>
          </div>
          <div class="earn-row-amt ${e.amount<0?"minus":""}">${e.amount<0?"-":"+"}${money(Math.abs(e.amount))}</div>`;
        act.appendChild(row);
      });
    });
    STATE.listeners.push(unsub);
  } catch{ act.innerHTML=`<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center">Couldn't load activity.</div>`; }
}

/* ================================================================
   NOTIFICATIONS
   ================================================================ */
async function viewNotifications(){
  view().innerHTML=`
    <div class="notif-header">
      <h2>Notifications</h2>
      <button class="btn-ghost" id="markAllRead">Mark all read</button>
    </div>
    <div class="notif-list" id="notifList"></div>`;

  const list=document.getElementById("notifList");
  list.innerHTML=`<div class="empty-state"><p>Loading...</p></div>`;

  document.getElementById("markAllRead").onclick=async()=>{
    const snap=await getDocs(query(collection(db,"users",STATE.user.uid,"notifications"),where("read","==",false),limit(50)));
    snap.docs.forEach(d=>updateDoc(doc(db,"users",STATE.user.uid,"notifications",d.id),{read:true}).catch(()=>{}));
    toast("All marked as read");
  };

  try {
    const q=query(collection(db,"users",STATE.user.uid,"notifications"),orderBy("createdAt","desc"),limit(50));
    const unsub=onSnapshot(q,snap=>{
      if(snap.empty){ list.innerHTML=emptyHTML("No notifications yet","Likes, comments, follows and sales land here","bell"); return; }
      list.innerHTML="";
      document.getElementById("notifDot")?.classList.add("hidden");
      snap.docs.forEach(d=>{
        const n={id:d.id,...d.data()};
        const row=document.createElement("div");
        row.className="notif-row"+(!n.read?" unread":"");
        const msg=n.type==="like"?`<b>${esc(n.fromName)}</b> liked your pitch`
          :n.type==="comment"?`<b>${esc(n.fromName)}</b> commented: ${esc((n.text||"").slice(0,60))}`
          :n.type==="follow"?`<b>${esc(n.fromName)}</b> started following you`
          :n.type==="sale"?`<b>${esc(n.fromName)}</b> bought ${esc(n.itemName||"your product")}`
          :`<b>${esc(n.fromName)}</b> ${esc(n.type)}`;
        row.innerHTML=`
          <img src="${esc(n.fromAvatar||avatar(n.fromHandle))}" alt="" />
          <div class="notif-txt">
            <div class="notif-msg">${msg}</div>
            <div class="notif-time">${timeAgo(n.createdAt)}</div>
          </div>`;
        row.onclick=()=>{
          if(n.postId) location.hash=`#/post/${n.postId}`;
          else if(n.fromHandle) location.hash=`#/stall/${n.fromHandle}`;
          if(!n.read) updateDoc(doc(db,"users",STATE.user.uid,"notifications",n.id),{read:true}).catch(()=>{});
        };
        list.appendChild(row);
      });
    });
    STATE.listeners.push(unsub);
  } catch(e){ list.innerHTML=emptyHTML("Couldn't load",e.message,"bell"); }
}

function watchNotifDot(){
  if(!STATE.user) return;
  const q=query(collection(db,"users",STATE.user.uid,"notifications"),orderBy("createdAt","desc"),limit(50));
  onSnapshot(q,snap=>{
    const has=snap.docs.some(d=>d.data().read===false);
    document.getElementById("notifDot")?.classList.toggle("hidden",!has);
  });
}

/* ================================================================
   SETTINGS
   ================================================================ */
function viewSettings(){
  const p=STATE.profile;
  view().innerHTML=`
    <div class="view-pane"><h2>Settings</h2><p class="lead">Profile, appearance, trust & account.</p></div>
    <div class="settings-section">
      <div class="settings-section-title">Profile</div>
      <div class="settings-row"><div class="settings-row-left"><div class="settings-row-label">Display name</div></div><input id="setName" value="${esc(p.name||"")}" style="background:var(--surface-2);border:1.5px solid var(--border);padding:8px 12px;border-radius:var(--radius-sm);color:var(--text);font-size:14px;outline:none;width:200px" /></div>
      <div class="settings-row"><div class="settings-row-left"><div class="settings-row-label">City</div></div><input id="setCity" value="${esc(p.city||"")}" style="background:var(--surface-2);border:1.5px solid var(--border);padding:8px 12px;border-radius:var(--radius-sm);color:var(--text);font-size:14px;outline:none;width:200px" /></div>
      <div class="settings-row"><div class="settings-row-left"><div class="settings-row-label">Trade / Hustle</div></div><input id="setTrade" value="${esc(p.trade||"")}" style="background:var(--surface-2);border:1.5px solid var(--border);padding:8px 12px;border-radius:var(--radius-sm);color:var(--text);font-size:14px;outline:none;width:200px" /></div>
      <div class="settings-row"><div class="settings-row-left"><div class="settings-row-label">Bio</div></div><input id="setBio" value="${esc(p.bio||"")}" style="background:var(--surface-2);border:1.5px solid var(--border);padding:8px 12px;border-radius:var(--radius-sm);color:var(--text);font-size:14px;outline:none;width:200px" /></div>
      <div class="settings-row"><div class="settings-row-left"></div><button class="btn-primary" id="saveProfileBtn">${svg("check")} Save Profile</button></div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Appearance</div>
      <div class="settings-row">
        <div class="settings-row-left"><div class="settings-row-label">Dark Mode</div><div class="settings-row-desc">Bold dark theme (default)</div></div>
        <div class="toggle ${document.body.classList.contains("theme-dark")?"on":""}" id="themeToggle"></div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Trust & Verification</div>
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-label">Verified Neighbor</div>
          <div class="settings-row-desc">${p.verifiedNeighbor?"✅ You're verified — buyers see the badge":"Get verified to earn buyer trust"}</div>
        </div>
        <button class="btn-secondary" id="verifyBtn">${p.verifiedNeighbor?"Verified":"Verify Now"}</button>
      </div>
      <div class="settings-row">
        <div class="settings-row-left"><div class="settings-row-label">Trust Score</div><div class="settings-row-desc">Vouches, location, reviews, sales</div></div>
        <div style="font-weight:900;font-size:18px;color:var(--accent)">${p.trustScore||50}/100</div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Account</div>
      <div class="settings-row">
        <div class="settings-row-left"><div class="settings-row-label">Email</div><div class="settings-row-desc">${esc(STATE.user.email)}</div></div>
      </div>
      <div class="settings-row">
        <div class="settings-row-left"><div class="settings-row-label">@${esc(p.handle)}</div><div class="settings-row-desc">Your username</div></div>
      </div>
      <div class="settings-row">
        <div class="settings-row-left"><div class="settings-row-label" style="color:var(--danger)">Sign Out</div></div>
        <button class="btn-secondary" id="signOutBtn" style="color:var(--danger)">${svg("logout")} Log out</button>
      </div>
    </div>`;

  document.getElementById("saveProfileBtn").onclick=async()=>{
    const name=document.getElementById("setName").value.trim();
    const city=document.getElementById("setCity").value.trim();
    const trade=document.getElementById("setTrade").value.trim();
    const bio=document.getElementById("setBio").value.trim();
    await updateDoc(doc(db,"users",STATE.user.uid),{name,city,cityLower:city.toLowerCase(),trade,bio});
    Object.assign(STATE.profile,{name,city,cityLower:city.toLowerCase(),trade,bio});
    toast("Profile saved!","success");
  };

  document.getElementById("themeToggle").onclick=()=>{
    document.body.classList.toggle("theme-dark");
    document.body.classList.toggle("theme-light");
    document.getElementById("themeToggle").classList.toggle("on");
    localStorage.setItem("pitch-theme",document.body.classList.contains("theme-dark")?"dark":"light");
  };

  document.getElementById("verifyBtn").onclick=async()=>{
    if(p.verifiedNeighbor){ toast("Already verified!"); return; }
    if(!navigator.geolocation){ toast("Geolocation not available"); return; }
    toast("Getting your location...");
    navigator.geolocation.getCurrentPosition(async pos=>{
      await updateDoc(doc(db,"users",STATE.user.uid),{
        verifiedNeighbor:true,
        location:{lat:pos.coords.latitude,lng:pos.coords.longitude},
        trustScore:Math.min(100,(p.trustScore||50)+20),
      });
      STATE.profile.verifiedNeighbor=true;
      STATE.profile.trustScore=Math.min(100,(p.trustScore||50)+20);
      toast("Verified!","success");
      document.getElementById("verifyBtn").textContent="Verified ✓";
    },()=>toast("Couldn't get location","error"));
  };

  document.getElementById("signOutBtn").onclick=()=>signOut(auth);
}

/* ================================================================
   PROFILE & STALL
   ================================================================ */
function viewProfile(){ location.hash=`#/stall/${STATE.profile.handle}`; }

async function viewStall(handle){
  if(!handle) handle=STATE.profile.handle;
  view().innerHTML=`<div class="empty-state"><p>Loading stall...</p></div>`;
  try {
    const hs=await getDoc(doc(db,"handles",handle));
    if(!hs.exists()){ view().innerHTML=emptyHTML("Stall not found","","person"); return; }
    const uid=hs.data().uid;
    const us=await getDoc(doc(db,"users",uid));
    if(!us.exists()){ view().innerHTML=emptyHTML("Stall not found","","person"); return; }
    const u={uid,...us.data()};
    const isMe=uid===STATE.user.uid;
    const following=(STATE.profile.followingList||[]).includes(uid);

    view().innerHTML=`
      <div class="stall-cover">
        ${u.cover?`<img src="${esc(u.cover)}" alt="" />`:`<div style="background:linear-gradient(135deg,#1a1a1a,#2a2a2a);width:100%;height:100%"></div>`}
        <div class="stall-cover-gradient"></div>
      </div>
      <div class="stall-head">
        <img class="stall-avatar" src="${esc(u.avatar||avatar(u.handle))}" alt="" />
        <div class="stall-row">
          <div>
            <div class="stall-name">
              ${esc(u.name)}
              ${u.verifiedNeighbor?`<span class="verified-badge">${svg("check")}</span>`:""}
            </div>
            <div class="stall-handle">@${esc(u.handle)}</div>
            <div class="stall-meta">
              ${u.city?`<span>${svg("location")} ${esc(u.city)}</span>`:""}
              ${u.trade?`<span>${svg("tag")} ${esc(u.trade)}</span>`:""}
              <span>${svg("flame")} Joined ${timeAgo(u.createdAt)}</span>
            </div>
            ${u.bio?`<div class="stall-bio">${esc(u.bio)}</div>`:""}
            <div class="stall-stats">
              <div class="stall-stat"><div class="stall-stat-num">${u.postsCount||0}</div><div class="stall-stat-lbl">Pitches</div></div>
              <div class="stall-stat"><div class="stall-stat-num">${u.followers||0}</div><div class="stall-stat-lbl">Followers</div></div>
              <div class="stall-stat"><div class="stall-stat-num">${u.following||0}</div><div class="stall-stat-lbl">Following</div></div>
              <div class="stall-stat"><div class="stall-stat-num">${money(u.salesTotal||0)}</div><div class="stall-stat-lbl">Earned</div></div>
            </div>
          </div>
          <div class="stall-actions">
            ${isMe?`
              <button class="btn-primary" onclick="location.hash='#/settings'">${svg("gear")} Edit Profile</button>
              <button class="btn-secondary" onclick="location.hash='#/earnings'">${svg("money")} Earnings</button>
            `:`
              <button class="btn-primary" id="followBtn">${following?"Following ✓":"Follow"}</button>
              <button class="btn-secondary" id="dmBtn">${svg("msg")} Message</button>
              <button class="btn-secondary" id="vouchBtn">${svg("check")} Vouch</button>
            `}
          </div>
        </div>
        <div class="stall-trust">
          <div class="trust-score-big">${svg("bolt")} Trust ${u.trustScore||50}/100</div>
          ${u.verifiedNeighbor?`<div class="trust-pill">${svg("check")} Verified</div>`:""}
          ${(u.vouchedBy||[]).length?`<div class="trust-pill">${svg("check")} ${(u.vouchedBy||[]).length} vouches</div>`:""}
          <div class="trust-pill">${svg("flame")} ${u.salesCount||0} sales</div>
        </div>
        <div class="stall-tabs">
          <button class="stall-tab active" data-tab="grid">Pitches</button>
          <button class="stall-tab" data-tab="list">Feed</button>
        </div>
      </div>
      <div id="stallContent"></div>`;

    if(!isMe){
      document.getElementById("followBtn").onclick=()=>doFollow(uid,u.name,u.handle,u.avatar,document.getElementById("followBtn"));
      document.getElementById("dmBtn").onclick=async()=>{
        const cid=await getOrCreateConvo(uid,u.name,u.handle,u.avatar);
        if(cid) location.hash=`#/dms/${cid}`;
      };
      document.getElementById("vouchBtn").onclick=()=>doVouch(uid,u);
    }

    const content=document.getElementById("stallContent");
    async function loadPosts(layout){
      content.innerHTML=`<div class="empty-state"><p>Loading...</p></div>`;
      const q=query(collection(db,"posts"),where("authorUid","==",uid),limit(60));
      const snap=await getDocs(q);
      const docs=snap.docs.sort((a,b)=>{
        const at=a.data().createdAt?a.data().createdAt.toDate():new Date(0);
        const bt=b.data().createdAt?b.data().createdAt.toDate():new Date(0);
        return bt-at;
      });
      if(!docs.length){ content.innerHTML=emptyHTML("No pitches yet",isMe?"Tap Create to post your first one.":"Check back soon.","photo"); return; }
      if(layout==="grid"){
        const grid=document.createElement("div"); grid.className="posts-grid";
        docs.forEach(d=>{
          const p={id:d.id,...d.data()};
          const cell=document.createElement("div"); cell.className="grid-cell";
          cell.innerHTML=p.mediaUrl
            ?(p.mediaType==="video"?`<video src="${esc(p.mediaUrl)}" muted></video>`:`<img src="${esc(p.mediaUrl)}" loading="lazy" alt="" />`)
            :`<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:10px;font-size:12px;text-align:center;font-weight:700">${esc((p.caption||"").slice(0,60))}</div>`;
          cell.innerHTML+=`<div class="grid-overlay"><span class="grid-stat">${svg("heart")} ${p.likes||0}</span><span class="grid-stat">${svg("comment")} ${p.commentsCount||0}</span></div>`;
          cell.onclick=()=>location.hash=`#/post/${p.id}`;
          grid.appendChild(cell);
        });
        content.innerHTML=""; content.appendChild(grid);
      } else {
        content.innerHTML="";
        docs.forEach(d=>{
          const p={id:d.id,...d.data()};
          STATE.cache.posts.set(p.id,p);
          content.appendChild(renderPost(p));
        });
      }
    }
    $$(".stall-tab").forEach(b=>b.onclick=()=>{
      $$(".stall-tab").forEach(x=>x.classList.remove("active")); b.classList.add("active"); loadPosts(b.dataset.tab);
    });
    loadPosts("grid");
  } catch(e){ view().innerHTML=emptyHTML("Couldn't load stall",e.message,"person"); }
}

async function doFollow(targetUid,targetName,targetHandle,targetAvatar,btn){
  const meRef=doc(db,"users",STATE.user.uid);
  const fRef=doc(db,"users",STATE.user.uid,"following",targetUid);
  const snap=await getDoc(fRef);
  if(snap.exists()){
    await deleteDoc(fRef);
    await deleteDoc(doc(db,"users",targetUid,"followers",STATE.user.uid)).catch(()=>{});
    await updateDoc(meRef,{following:increment(-1),followingList:arrayRemove(targetUid)}).catch(()=>{});
    await updateDoc(doc(db,"users",targetUid),{followers:increment(-1)}).catch(()=>{});
    btn.textContent="Follow";
  } else {
    await setDoc(fRef,{uid:targetUid,createdAt:serverTimestamp()});
    await setDoc(doc(db,"users",targetUid,"followers",STATE.user.uid),{uid:STATE.user.uid,createdAt:serverTimestamp()});
    await updateDoc(meRef,{following:increment(1),followingList:arrayUnion(targetUid)}).catch(()=>{});
    await updateDoc(doc(db,"users",targetUid),{followers:increment(1)}).catch(()=>{});
    btn.textContent="Following ✓";
    addDoc(collection(db,"users",targetUid,"notifications"),{
      type:"follow", fromUid:STATE.user.uid, fromName:STATE.profile.name,
      fromHandle:STATE.profile.handle, fromAvatar:STATE.profile.avatar,
      read:false, createdAt:serverTimestamp(),
    }).catch(()=>{});
  }
}

async function doVouch(uid,u){
  if((u.vouchedBy||[]).includes(STATE.user.uid)){ toast("Already vouched"); return; }
  if(!confirm(`Vouch for @${u.handle}?`)) return;
  await updateDoc(doc(db,"users",uid),{vouchedBy:arrayUnion(STATE.user.uid),trustScore:Math.min(100,(u.trustScore||50)+5)});
  await setDoc(doc(db,"users",uid,"vouches",STATE.user.uid),{fromUid:STATE.user.uid,fromName:STATE.profile.name,fromHandle:STATE.profile.handle,createdAt:serverTimestamp()});
  toast("Vouched!","success");
}

/* ================================================================
   POST PERMALINK
   ================================================================ */
async function viewPost(postId){
  view().innerHTML=`<div class="empty-state"><p>Loading pitch...</p></div>`;
  try {
    const snap=await getDoc(doc(db,"posts",postId));
    if(!snap.exists()){ view().innerHTML=emptyHTML("Pitch not found","","video"); return; }
    const post={id:snap.id,...snap.data()};
    STATE.cache.posts.set(post.id,post);
    view().innerHTML="";
    view().appendChild(renderPost(post));
  } catch{ view().innerHTML=emptyHTML("Couldn't load","","video"); }
}

/* ================================================================
   SIDE RAILS
   ================================================================ */
async function loadSideRails(){
  // Top hustlers
  try {
    const q=query(collection(db,"users"),where("cityLower","==",STATE.profile.cityLower),limit(20));
    const snap=await getDocs(q);
    const rail=document.getElementById("topRail"); if(!rail) return;
    const top=snap.docs.sort((a,b)=>(b.data().salesTotal||0)-(a.data().salesTotal||0)).slice(0,5);
    if(!top.length){ rail.innerHTML=`<div class="rail-body" style="padding:14px;font-size:12px;color:var(--text-muted)">Be the first hustler in ${esc(STATE.profile.city)}</div>`; }
    else {
      rail.innerHTML=`<div class="rail-body">`;
      top.forEach((d,i)=>{
        const u=d.data();
        const cl=i===0?"gold":i===1?"silver":i===2?"bronze":"";
        const el=document.createElement("div"); el.className="rail-item";
        el.innerHTML=`<div class="rail-rank ${cl}">${i+1}</div><img src="${esc(u.avatar||avatar(u.handle))}" alt="" /><div class="rail-info"><div class="rail-name">${esc(u.name)}</div><div class="rail-meta">${money(u.salesTotal||0)} earned</div></div>`;
        el.onclick=()=>location.hash=`#/stall/${u.handle}`;
        rail.appendChild(el);
      });
    }
  } catch{}

  // Challenge
  try {
    const q=query(collection(db,"challenges"),orderBy("createdAt","desc"),limit(1));
    const snap=await getDocs(q);
    const rail=document.getElementById("challengeRail"); if(!rail) return;
    if(snap.empty){ rail.innerHTML=`<div style="padding:14px;font-size:12px;color:var(--text-muted)">No live challenge</div>`; }
    else {
      const c=snap.docs[0].data();
      rail.innerHTML=`<div class="challenge-rail-card"><h4>${esc(c.title)}</h4><p>${esc((c.description||"").slice(0,70))}</p><div class="challenge-prize">${svg("bolt")} ${money(c.prizeAmount)} prize</div></div>`;
      rail.querySelector(".challenge-rail-card").onclick=()=>location.hash="#/challenges";
    }
  } catch{}

  // Suggested
  try {
    const q=query(collection(db,"users"),where("trade","==",STATE.profile.trade),limit(6));
    const snap=await getDocs(q);
    const rail=document.getElementById("suggestedRail"); if(!rail) return;
    rail.innerHTML="";
    let cnt=0;
    snap.docs.forEach(d=>{
      const u=d.data(); if(u.uid===STATE.user.uid) return;
      const el=document.createElement("div"); el.className="rail-item";
      el.innerHTML=`<img src="${esc(u.avatar||avatar(u.handle))}" alt="" /><div class="rail-info"><div class="rail-name">${esc(u.name)}</div><div class="rail-meta">@${esc(u.handle)} · ${esc(u.city||"")}</div></div>`;
      el.onclick=()=>location.hash=`#/stall/${u.handle}`;
      rail.appendChild(el); cnt++;
    });
    if(!cnt) rail.innerHTML=`<div style="padding:14px;font-size:12px;color:var(--text-muted)">No suggestions yet</div>`;
  } catch{}
}

/* ================================================================
   SEARCH
   ================================================================ */
let searchTmr=null;
function bindSearch(){
  const inp=document.getElementById("searchInput");
  const dd=document.getElementById("searchDropdown");
  if(!inp) return;
  inp.addEventListener("input",()=>{
    clearTimeout(searchTmr);
    const q=inp.value.trim().toLowerCase();
    if(!q){ dd.classList.add("hidden"); return; }
    searchTmr=setTimeout(()=>doSearch(q,dd),280);
  });
  inp.addEventListener("focus",()=>{ if(inp.value.trim()) dd.classList.remove("hidden"); });
  document.addEventListener("click",e=>{ if(!e.target.closest(".search-wrap")) dd.classList.add("hidden"); });
}

async function doSearch(q,dd){
  dd.classList.remove("hidden");
  dd.innerHTML=`<div class="search-empty">Searching...</div>`;
  try {
    const results=[];
    const s1=await getDocs(query(collection(db,"users"),where("handleLower",">=",q),where("handleLower","<=",q+"\uf8ff"),limit(6)));
    s1.docs.forEach(d=>results.push(d.data()));
    if(q.length>=3){
      const s2=await getDocs(query(collection(db,"users"),where("cityLower",">=",q),where("cityLower","<=",q+"\uf8ff"),limit(4)));
      s2.docs.forEach(d=>{ if(!results.find(r=>r.uid===d.data().uid)) results.push(d.data()); });
    }
    if(!results.length){ dd.innerHTML=`<div class="search-empty">No results for "${esc(q)}"</div>`; return; }
    dd.innerHTML="";
    results.forEach(u=>{
      const el=document.createElement("div"); el.className="search-result";
      el.innerHTML=`<img src="${esc(u.avatar||avatar(u.handle))}" alt="" /><div><div class="sr-name">${esc(u.name)}</div><div class="sr-meta">@${esc(u.handle)} · ${esc(u.city||"")} · ${esc(u.trade||"")}</div></div>`;
      el.onclick=()=>{ location.hash=`#/stall/${u.handle}`; dd.classList.add("hidden"); document.getElementById("searchInput").value=""; };
      dd.appendChild(el);
    });
  } catch(e){ dd.innerHTML=`<div class="search-empty">Error: ${esc(e.message)}</div>`; }
}

/* ================================================================
   GLOBAL BOOT
   ================================================================ */
function init(){
  bindAuth();
  bindOnboard();
  bindSearch();

  document.getElementById("logoutBtn")?.addEventListener("click",()=>signOut(auth));

  // Theme restore
  const saved=localStorage.getItem("pitch-theme");
  if(saved==="light"){
    document.body.classList.remove("theme-dark");
    document.body.classList.add("theme-light");
  } else {
    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
  }
}

window.closeModal = closeModal;
init();

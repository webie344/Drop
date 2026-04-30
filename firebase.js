/* ============================================================
   Orbit — Firebase + Cloudinary helpers
   ------------------------------------------------------------
   1. Replace the FIREBASE_CONFIG and CLOUDINARY_CONFIG objects
      below with your own values.
   2. In Firebase Console: enable Email/Password and Google sign-in
      (Authentication > Sign-in method).
   3. In Firestore: create the database (start in TEST mode for
      development; lock down with security rules before prod).
   4. In Cloudinary: create an UNSIGNED upload preset and put its
      name below. (Settings > Upload > Add upload preset.)
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
  increment, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ---------- CONFIG — replace these ---------- */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

export const CLOUDINARY_CONFIG = {
  cloudName: "ddtdqrh1b",
  uploadPreset: "profile-pictures"
};

/* ---------- Init ---------- */
const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

/* ---------- Cloudinary upload (unsigned, browser-direct) ---------- */
export async function uploadToCloudinary(file, opts = {}) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  if (opts.folder) fd.append("folder", opts.folder);
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/${opts.resourceType || "image"}/upload`;
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Cloudinary upload failed: " + text);
  }
  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height };
}

/* ---------- Auth ---------- */
export function watchAuth(cb) { return onAuthStateChanged(auth, cb); }

export async function signUp({ email, password, displayName, handle }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
  await ensureUserProfile(cred.user, { displayName, handle });
  return cred.user;
}

export async function signIn({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signInGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signOutUser() { return signOut(auth); }

/* ---------- User profiles ---------- */
async function suggestHandle(displayName, uid) {
  const base = (displayName || "orbiter").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "orbiter";
  return base + uid.slice(0, 4);
}

export async function ensureUserProfile(user, overrides = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const handle = overrides.handle || await suggestHandle(user.displayName || overrides.displayName, user.uid);
  const profile = {
    uid: user.uid,
    email: user.email || null,
    displayName: overrides.displayName || user.displayName || "Orbiter",
    handle,
    photoURL: user.photoURL || null,
    bio: "",
    verified: false,
    locationLabel: null,
    accent: "violet",
    theme: "dark",
    constellation: [], // userIds I follow
    satellites: 0,     // count of my followers (denormalized)
    createdAt: serverTimestamp()
  };
  await setDoc(ref, profile);
  return profile;
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function getUserByHandle(handle) {
  const q = query(collection(db, "users"), where("handle", "==", handle), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].data();
}

export async function updateMyProfile(uid, patch) {
  await updateDoc(doc(db, "users", uid), patch);
}

export async function searchPeople(text) {
  if (!text) return [];
  const q = query(collection(db, "users"), orderBy("handle"), limit(40));
  const snap = await getDocs(q);
  const t = text.toLowerCase();
  return snap.docs.map(d => d.data())
    .filter(u => u.handle?.toLowerCase().includes(t) || u.displayName?.toLowerCase().includes(t));
}

/* ---------- Beacon (location verification) ---------- */
export async function grantBeacon(uid, locationLabel) {
  await updateDoc(doc(db, "users", uid), { verified: true, locationLabel });
}

/* ---------- Constellation (follow) ---------- */
export async function follow(meUid, theirUid) {
  if (meUid === theirUid) return;
  const meRef = doc(db, "users", meUid);
  const theirRef = doc(db, "users", theirUid);
  const batch = writeBatch(db);
  batch.update(meRef, { constellation: arrayUnion(theirUid) });
  batch.update(theirRef, { satellites: increment(1) });
  await batch.commit();
}

export async function unfollow(meUid, theirUid) {
  const meRef = doc(db, "users", meUid);
  const theirRef = doc(db, "users", theirUid);
  const batch = writeBatch(db);
  batch.update(meRef, { constellation: arrayRemove(theirUid) });
  batch.update(theirRef, { satellites: increment(-1) });
  await batch.commit();
}

/* ---------- Beams (posts) ---------- */
export async function createBeam({ author, body, imageURL = null, circleId = null, kind = "beam" }) {
  const beam = {
    authorUid: author.uid,
    authorName: author.displayName,
    authorHandle: author.handle,
    authorPhoto: author.photoURL || null,
    authorVerified: !!author.verified,
    body, imageURL, circleId, kind,
    glows: [],
    glowsCount: 0,
    repliesCount: 0,
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "beams"), beam);
  return ref.id;
}

export function listenBeams(cb, opts = {}) {
  let q;
  if (opts.circleId) {
    q = query(collection(db, "beams"), where("circleId", "==", opts.circleId), orderBy("createdAt", "desc"), limit(60));
  } else if (opts.authorUid) {
    q = query(collection(db, "beams"), where("authorUid", "==", opts.authorUid), orderBy("createdAt", "desc"), limit(60));
  } else if (opts.kind) {
    q = query(collection(db, "beams"), where("kind", "==", opts.kind), orderBy("createdAt", "desc"), limit(40));
  } else {
    q = query(collection(db, "beams"), orderBy("createdAt", "desc"), limit(80));
  }
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(items);
  });
}

export async function toggleGlow(beamId, uid) {
  const ref = doc(db, "beams", beamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  const has = (data.glows || []).includes(uid);
  await updateDoc(ref, {
    glows: has ? arrayRemove(uid) : arrayUnion(uid),
    glowsCount: increment(has ? -1 : 1)
  });
  return !has;
}

export async function deleteBeam(beamId) {
  await deleteDoc(doc(db, "beams", beamId));
}

/* ---------- Circles (groups) ---------- */
export async function createCircle({ name, description, vibe, coverURL, isPrivate, owner }) {
  const data = {
    name, description: description || "",
    vibe: vibe || "violet",
    coverURL: coverURL || null,
    isPrivate: !!isPrivate,
    ownerUid: owner.uid,
    members: [owner.uid],
    membersCount: 1,
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "circles"), data);
  return ref.id;
}

export function listenCircles(cb) {
  const q = query(collection(db, "circles"), orderBy("createdAt", "desc"), limit(60));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function getCircle(id) {
  const snap = await getDoc(doc(db, "circles", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function joinCircle(circleId, uid) {
  await updateDoc(doc(db, "circles", circleId), {
    members: arrayUnion(uid), membersCount: increment(1)
  });
}

export async function leaveCircle(circleId, uid) {
  await updateDoc(doc(db, "circles", circleId), {
    members: arrayRemove(uid), membersCount: increment(-1)
  });
}

/* ---------- Signals (chats) ---------- */
function chatIdFor(a, b) { return [a, b].sort().join("__"); }

export async function openOrCreateDirectChat(meUid, otherUid) {
  const id = chatIdFor(meUid, otherUid);
  const ref = doc(db, "chats", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      id, kind: "direct",
      members: [meUid, otherUid],
      lastMessage: null, lastAt: serverTimestamp(),
      unread: { [meUid]: 0, [otherUid]: 0 },
      settings: {}, createdAt: serverTimestamp()
    });
  }
  return id;
}

export function listenMyChats(uid, cb) {
  const q = query(collection(db, "chats"), where("members", "array-contains", uid), orderBy("lastAt", "desc"), limit(50));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function listenChat(chatId, cb) {
  return onSnapshot(doc(db, "chats", chatId), snap => snap.exists() && cb({ id: snap.id, ...snap.data() }));
}

export function listenMessages(chatId, cb) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"), limit(200));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function sendMessage(chatId, { author, text, replyTo = null, attachmentURL = null, kind = "text" }) {
  const msgRef = await addDoc(collection(db, "chats", chatId, "messages"), {
    authorUid: author.uid,
    authorName: author.displayName,
    text, replyTo, attachmentURL, kind,
    reactions: {},
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "chats", chatId), {
    lastMessage: { text: text || "(attachment)", authorUid: author.uid, kind },
    lastAt: serverTimestamp()
  });
  return msgRef.id;
}

export async function addReaction(chatId, messageId, uid, key) {
  const ref = doc(db, "chats", chatId, "messages", messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  const list = new Set(reactions[key] || []);
  if (list.has(uid)) list.delete(uid); else list.add(uid);
  reactions[key] = [...list];
  if (reactions[key].length === 0) delete reactions[key];
  await updateDoc(ref, { reactions });
}

export async function updateChatSettings(chatId, settings) {
  await updateDoc(doc(db, "chats", chatId), { settings });
}

/* ---------- Notifications ---------- */
export async function createNotification(toUid, payload) {
  if (!toUid) return;
  await addDoc(collection(db, "users", toUid, "notifications"), {
    ...payload, read: false, createdAt: serverTimestamp()
  });
}

export function listenNotifications(uid, cb) {
  const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function markAllNotificationsRead(uid) {
  const snap = await getDocs(collection(db, "users", uid, "notifications"));
  const batch = writeBatch(db);
  snap.docs.forEach(d => { if (!d.data().read) batch.update(d.ref, { read: true }); });
  await batch.commit();
}

export const _firestoreHelpers = { serverTimestamp };

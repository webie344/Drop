// ============================================================
//  ORBIT — App Logic
//  No composite Firestore indexes — all filtering client-side
// ============================================================

import { FIREBASE_CONFIG, CLOUDINARY_CONFIG, LOCATION_UPDATE_INTERVAL, EXPLORE_RADIUS_KM } from './config.js';

import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut,
         onAuthStateChanged, updateProfile }       from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc,
         updateDoc, collection, query, where,
         onSnapshot, addDoc, getDocs,
         serverTimestamp, orderBy, limit,
         Timestamp, deleteDoc }                    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Init ─────────────────────────────────────────────────────
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db   = getFirestore(firebaseApp);

// ── State ─────────────────────────────────────────────────────
const S = {
  user: null, profile: null,
  mapMode: 'friends',
  activePanel: 'map',
  activeChatUid: null,
  viewingUid: null,
  myLat: null, myLng: null, mySpeed: 0,
  myBattery: null, myCharging: false,
  ghostMode: false,
  watchId: null,
  lastLocationSent: 0,
  friends: {},        // uid → profile
  friendRequests: [], // pending incoming docs
  nearbyUsers: {},    // uid → profile
  markers: {},        // uid → L.Marker (reused, never recreated)
  markerPositions: {},
  selfMarker: null,
  map: null,
  unsubs: [],
  convUnsub: null,
  chatUnsub: null,
};

const $ = id => document.getElementById(id);

// ════════════════════════════════════════════════════════════
//  AUTH STATE
// ════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async user => {
  if (user) {
    S.user = user;
    await loadMyProfile();
    showScreen('app');
    initApp();
  } else {
    S.user = null;
    showScreen('auth');
  }
  hideLoader();
});

function showScreen(name) {
  $('auth-screen').classList.toggle('active', name === 'auth');
  $('app-screen').classList.toggle('active',  name === 'app');
}
function hideLoader() {
  const el = $('loader');
  el.classList.add('hide');
  setTimeout(() => el.style.display = 'none', 400);
}

// ════════════════════════════════════════════════════════════
//  AUTH FORMS
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.auth-tab').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    btn.classList.add('active');
    $(`${btn.dataset.tab}-form`).classList.add('active');
  })
);

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-btn');
  setBtnLoading(btn, true);
  $('login-error').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('login-email').value.trim(), $('login-password').value);
  } catch (err) {
    $('login-error').textContent = authErr(err.code);
    setBtnLoading(btn, false);
  }
});

$('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('register-btn');
  setBtnLoading(btn, true);
  $('register-error').textContent = '';
  const name = $('reg-name').value.trim();
  const email = $('reg-email').value.trim();
  const pass  = $('reg-password').value;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid, displayName: name, email,
      photoURL: '', isPublic: false, ghostMode: false,
      location: null, speed: 0, battery: null, isCharging: false,
      status: 'offline', zones: [], createdAt: serverTimestamp(), lastSeen: serverTimestamp(),
    });
  } catch (err) {
    $('register-error').textContent = authErr(err.code);
    setBtnLoading(btn, false);
  }
});

function setBtnLoading(btn, on) {
  btn.disabled = on;
  btn.querySelector('.btn-text').hidden    = on;
  btn.querySelector('.btn-spinner').hidden = !on;
}
function authErr(code) {
  const m = {
    'auth/user-not-found':       'No account with that email.',
    'auth/wrong-password':       'Wrong password.',
    'auth/invalid-credential':   'Incorrect email or password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/weak-password':        'Password needs at least 6 characters.',
    'auth/invalid-email':        'Invalid email address.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
  };
  return m[code] || 'Something went wrong. Try again.';
}

// ════════════════════════════════════════════════════════════
//  PROFILE LOAD
// ════════════════════════════════════════════════════════════
async function loadMyProfile() {
  const snap = await getDoc(doc(db, 'users', S.user.uid));
  if (snap.exists()) S.profile = snap.data();
}

// ════════════════════════════════════════════════════════════
//  APP INIT
// ════════════════════════════════════════════════════════════
function initApp() {
  initMap();
  initGeolocation();
  initBattery();
  updateProfileUI();
  listenFriends();
  listenFriendRequests();
  listenConversations();
  bindNav();
  bindTopBar();
  bindProfile();
  bindFriends();
  bindChat();
  bindModals();
  bindBackBtns();
}

// ════════════════════════════════════════════════════════════
//  MAP — performance-first, zero lag
// ════════════════════════════════════════════════════════════
function initMap() {
  S.map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    inertia: true,
    inertiaDeceleration: 2400,
    inertiaMaxSpeed: 1800,
    easeLinearity: 0.2,
    maxZoom: 19, minZoom: 2,
  }).setView([20, 0], 2);

  // OSM tiles with CSS dark-mode filter — far more readable than CartoDB dark_all
  // The CSS filter is applied in style.css (.leaflet-tile-pane)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    detectRetina: true,
    updateWhenZooming: false,
    updateWhenIdle: false,
    keepBuffer: 4,
  }).addTo(S.map);

  // Force a size recalculation after the map container is fully visible
  setTimeout(() => S.map.invalidateSize({ animate: false }), 100);

  $('recenter-btn').addEventListener('click', recenterMap);
  S.map.on('click', () => { if (S.activePanel !== 'map') openPanel('map'); });
}

function recenterMap() {
  if (S.myLat !== null)
    S.map.flyTo([S.myLat, S.myLng], 15, { duration: 0.9, easeLinearity: 0.4 });
}

// ── Smooth glide between GPS fixes (Zenly trick) ──────────────
function animateMarker(uid, lat, lng) {
  const marker = S.markers[uid];
  if (!marker) return;
  const prev = S.markerPositions[uid];
  S.markerPositions[uid] = { lat, lng };
  if (!prev) { marker.setLatLng([lat, lng]); return; }
  const dLat = lat - prev.lat, dLng = lng - prev.lng;
  // Skip animation if tiny movement (< ~3 m) — avoid jitter
  if (dLat * dLat + dLng * dLng < 0.0000000008) {
    marker.setLatLng([lat, lng]); return;
  }
  const DURATION = Math.min(LOCATION_UPDATE_INTERVAL, 12000);
  const t0 = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / DURATION, 1);
    const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    marker.setLatLng([prev.lat + dLat * e, prev.lng + dLng * e]);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Create / update marker — NEVER re-add to map ──────────────
function upsertMarker(uid, profile, isSelf = false) {
  const { lat, lng } = displayLoc(profile);
  if (!lat || !lng) return;

  const sc   = statusClass(profile);
  const ring = isSelf ? 'self' : (profile.ghostMode ? 'ghost' : sc);
  const init = (profile.displayName || '?')[0].toUpperCase();
  const photo = profile.photoURL
    ? `<img src="${escH(profile.photoURL)}" alt="" loading="lazy"/>`
    : `<span>${escH(init)}</span>`;
  const bat = profile.battery != null && !isSelf
    ? `<div class="bubble-battery${profile.battery < 20 ? ' low' : ''}">${profile.battery}%</div>`
    : '';
  const statusTxt = isSelf ? '' : statusText(profile);

  if (S.markers[uid]) {
    // ── UPDATE inner HTML only — marker stays on map ──
    const el = S.markers[uid].getElement();
    if (el) {
      const inner   = el.querySelector('.bubble-ring');
      const photoEl = el.querySelector('.bubble-inner');
      const batEl   = el.querySelector('.bubble-battery');
      const stEl    = el.querySelector('.bubble-status');
      if (inner)   inner.className = `bubble-ring ${ring}`;
      if (photoEl) photoEl.innerHTML = photo;
      if (batEl)   batEl.outerHTML  = bat || '<span hidden></span>';
      if (stEl)    stEl.textContent  = statusTxt;
    }
    animateMarker(uid, lat, lng);
  } else {
    // ── CREATE once ──
    const icon = L.divIcon({
      className: `user-bubble${isSelf ? ' self' : ''}`,
      html: `
        <div class="bubble-ring ${ring}" style="position:relative">
          <div class="bubble-inner">${photo}</div>
          ${bat}
        </div>
        <div class="bubble-label">${escH(profile.displayName || 'User')}</div>
        ${statusTxt ? `<div class="bubble-status">${escH(statusTxt)}</div>` : ''}`,
      iconSize:   [70, 90],
      iconAnchor: [35, 45],
    });
    const marker = L.marker([lat, lng], { icon, zIndexOffset: isSelf ? 1000 : 0 })
      .addTo(S.map);
    if (!isSelf) marker.on('click', e => { L.DomEvent.stopPropagation(e); openUserProfile(uid); });
    S.markers[uid] = marker;
    S.markerPositions[uid] = { lat, lng };
    if (isSelf) S.selfMarker = marker;
  }
}

function removeMarker(uid) {
  if (S.markers[uid]) { S.map.removeLayer(S.markers[uid]); delete S.markers[uid]; delete S.markerPositions[uid]; }
}

function displayLoc(p) {
  if (p.ghostMode && p.ghostLocation) return { lat: p.ghostLocation.lat, lng: p.ghostLocation.lng };
  if (p.location)                      return { lat: p.location.lat,      lng: p.location.lng };
  return { lat: null, lng: null };
}

function statusClass(p) {
  if (!p.location) return 'idle';
  const age = Date.now() - (p.location.updatedAt?.toMillis?.() || 0);
  if (age > 5 * 60000) return 'idle';
  return (p.speed || 0) > 1.5 ? 'moving' : 'online';
}

function statusText(p) {
  if (p.ghostMode) return '👻 Ghost mode';
  const z = zoneMatch(p);
  if (z) return `📍 ${z}`;
  const sp = p.speed || 0;
  if (sp > 100) return '✈️ On a flight';
  if (sp > 40)  return '🚗 In a vehicle';
  if (sp > 2)   return '🚶 On the move';
  const ts = p.location?.updatedAt?.toMillis?.();
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function zoneMatch(p) {
  if (!p.zones?.length || !p.location) return null;
  for (const z of p.zones)
    if (haversine(p.location.lat, p.location.lng, z.lat, z.lng) < 0.15) return z.name;
  return null;
}

// ════════════════════════════════════════════════════════════
//  GEOLOCATION
// ════════════════════════════════════════════════════════════
function initGeolocation() {
  if (!navigator.geolocation) { showToast('Location unavailable.'); return; }
  S.watchId = navigator.geolocation.watchPosition(onPos, () => {},
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
}

let _pLat = null, _pLng = null, _pTs = null;
function onPos({ coords: { latitude: lat, longitude: lng, speed } }) {
  const now = Date.now();
  S.myLat = lat; S.myLng = lng;
  // Speed from GPS or calculated from delta
  if (speed != null) {
    S.mySpeed = Math.round(speed * 3.6);
  } else if (_pLat !== null) {
    const dt = (now - _pTs) / 3600000;
    S.mySpeed = dt > 0 ? Math.min(Math.round(haversine(_pLat, _pLng, lat, lng) / dt), 999) : 0;
  }
  _pLat = lat; _pLng = lng; _pTs = now;
  upsertSelf();
  if (now - S.lastLocationSent >= LOCATION_UPDATE_INTERVAL) {
    pushLocation(lat, lng);
    S.lastLocationSent = now;
  }
}

async function pushLocation(lat, lng) {
  if (!S.user) return;
  const upd = {
    'location.lat': lat, 'location.lng': lng,
    'location.updatedAt': serverTimestamp(),
    speed: S.mySpeed, battery: S.myBattery,
    isCharging: S.myCharging, lastSeen: serverTimestamp(),
    ghostMode: S.ghostMode,
  };
  if (!S.ghostMode) upd.ghostLocation = null;
  if (S.ghostMode && !S.profile?.ghostLocation) upd.ghostLocation = { lat, lng };
  await updateDoc(doc(db, 'users', S.user.uid), upd).catch(() => {});
}

function upsertSelf() {
  if (S.myLat === null || !S.profile) return;
  upsertMarker(S.user.uid, {
    ...S.profile,
    location: { lat: S.myLat, lng: S.myLng },
    speed: S.mySpeed, battery: S.myBattery, ghostMode: S.ghostMode,
  }, true);
}

// ════════════════════════════════════════════════════════════
//  BATTERY
// ════════════════════════════════════════════════════════════
async function initBattery() {
  if (!navigator.getBattery) return;
  try {
    const b = await navigator.getBattery();
    const upd = () => { S.myBattery = Math.round(b.level * 100); S.myCharging = b.charging; };
    upd();
    b.addEventListener('levelchange', upd);
    b.addEventListener('chargingchange', upd);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════
//  FIRESTORE — FRIENDS
//  Single where clause only → no composite index needed
// ════════════════════════════════════════════════════════════
function listenFriends() {
  const uid = S.user.uid;
  // Only one where clause — filter 'accepted' client-side
  const q = query(collection(db, 'friendships'),
    where('participants', 'array-contains', uid));

  const unsub = onSnapshot(q, async snap => {
    const accepted = snap.docs
      .map(d => d.data())
      .filter(d => d.status === 'accepted'); // ← client-side filter

    const friendUids = accepted.map(d => d.participants.find(p => p !== uid)).filter(Boolean);

    // Fetch new friend profiles
    await Promise.all(
      friendUids.filter(f => !S.friends[f]).map(async f => {
        const s = await getDoc(doc(db, 'users', f));
        if (s.exists()) S.friends[f] = s.data();
      })
    );

    // Remove unfriended
    Object.keys(S.friends).forEach(f => {
      if (!friendUids.includes(f)) {
        delete S.friends[f];
        if (S.mapMode === 'friends') removeMarker(f);
        if (friendLocationUnsubs[f]) { friendLocationUnsubs[f](); delete friendLocationUnsubs[f]; }
      }
    });

    friendUids.forEach(listenFriendLocation);
    renderFriendsList();
    updateStatCounts();
    if (S.mapMode === 'friends') refreshMapMarkers();
  });

  S.unsubs.push(unsub);
}

const friendLocationUnsubs = {};
function listenFriendLocation(fuid) {
  if (friendLocationUnsubs[fuid]) return;
  const unsub = onSnapshot(doc(db, 'users', fuid), snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    S.friends[fuid] = data;
    if (S.mapMode === 'friends') {
      if (data.location) upsertMarker(fuid, data);
      else removeMarker(fuid);
    }
    if (S.activeChatUid === fuid) updateChatHeader(data);
    renderFriendsList();
  });
  friendLocationUnsubs[fuid] = unsub;
  S.unsubs.push(unsub);
}

// ════════════════════════════════════════════════════════════
//  EXPLORE — nearby users (client-side distance filter)
// ════════════════════════════════════════════════════════════
async function loadNearbyUsers() {
  showToast('Loading nearby users…');
  // No composite index — single field query only
  const q = query(collection(db, 'users'), where('isPublic', '==', true));
  const snap = await getDocs(q);
  clearExploreMarkers();
  const hasGPS = S.myLat !== null && S.myLng !== null;
  snap.forEach(s => {
    const d = s.data();
    const uid = s.id; // use doc ID — more reliable than d.uid field
    if (uid === S.user.uid || !d.location) return;
    // If GPS available, filter by radius. If not, show everyone on Explore
    if (hasGPS) {
      const dist = haversine(S.myLat, S.myLng, d.location.lat, d.location.lng);
      if (dist > EXPLORE_RADIUS_KM) return;
    }
    d.uid = uid; // ensure uid field exists
    S.nearbyUsers[uid] = d;
    upsertMarker(uid, d);
  });
  const count = Object.keys(S.nearbyUsers).length;
  showToast(count > 0 ? `${count} people on Explore` : 'No public users found. Run seed.html first.');
}

function clearExploreMarkers() {
  Object.keys(S.nearbyUsers).forEach(uid => { if (!S.friends[uid]) removeMarker(uid); });
  S.nearbyUsers = {};
}

function refreshMapMarkers() {
  Object.entries(S.friends).forEach(([uid, p]) => {
    if (p.location) upsertMarker(uid, p); else removeMarker(uid);
  });
  upsertSelf();
}

// ════════════════════════════════════════════════════════════
//  FRIEND REQUESTS
//  Single where('to') — filter status client-side
// ════════════════════════════════════════════════════════════
function listenFriendRequests() {
  const uid = S.user.uid;
  // Only filter by 'to' — no composite index
  const q = query(collection(db, 'friendships'), where('to', '==', uid));
  const unsub = onSnapshot(q, snap => {
    S.friendRequests = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.status === 'pending'); // ← client-side
    renderFriendRequests();
    const count = S.friendRequests.length;
    const badge = $('requests-badge');
    badge.hidden = count === 0;
    badge.textContent = count;
  });
  S.unsubs.push(unsub);
}

async function sendFriendRequest(email) {
  email = email.trim().toLowerCase();
  if (email === S.user.email?.toLowerCase()) return 'You cannot add yourself.';
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  if (snap.empty) return 'No user found with that email.';
  const targetUid = snap.docs[0].id;

  // Check existing — single where only
  const ex = await getDocs(query(collection(db, 'friendships'),
    where('participants', 'array-contains', S.user.uid)));
  if (ex.docs.some(d => d.data().participants.includes(targetUid)))
    return 'Already friends or request already sent.';

  await addDoc(collection(db, 'friendships'), {
    participants: [S.user.uid, targetUid],
    from: S.user.uid, to: targetUid,
    status: 'pending', createdAt: serverTimestamp(),
  });
  return null;
}

async function acceptRequest(id) { await updateDoc(doc(db, 'friendships', id), { status: 'accepted' }); }
async function rejectRequest(id) { await deleteDoc(doc(db, 'friendships', id)); }

// ════════════════════════════════════════════════════════════
//  CONVERSATIONS
//  Single where — sort client-side, no composite index
// ════════════════════════════════════════════════════════════
function listenConversations() {
  // No orderBy — sort in JS to avoid composite index
  const q = query(collection(db, 'conversations'),
    where('participants', 'array-contains', S.user.uid));

  const unsub = onSnapshot(q, snap => {
    // Sort by lastMessageAt descending — client-side
    const convs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.lastMessageAt?.toMillis?.() || 0;
        const tb = b.lastMessageAt?.toMillis?.() || 0;
        return tb - ta;
      });

    renderConversations(convs);

    // Unread count
    const unread = convs.filter(c => !c.readBy?.includes(S.user.uid)).length;
    const badge = $('unread-badge');
    badge.hidden = unread === 0;
    badge.textContent = unread;
  });

  if (S.convUnsub) S.convUnsub();
  S.convUnsub = unsub;
}

async function getOrCreateConv(otherUid) {
  const q = query(collection(db, 'conversations'),
    where('participants', 'array-contains', S.user.uid));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => d.data().participants.includes(otherUid));
  if (existing) return existing.id;
  const ref = await addDoc(collection(db, 'conversations'), {
    participants: [S.user.uid, otherUid],
    lastMessage: '', lastMessageAt: serverTimestamp(), readBy: [S.user.uid],
  });
  return ref.id;
}

function openChat(uid) {
  const profile = S.friends[uid] || S.nearbyUsers[uid];
  if (!profile) return;
  S.activeChatUid = uid;
  updateChatHeader(profile);
  markRead(uid);
  loadMessages(uid);
  openPanel('chat');
}

function updateChatHeader(p) {
  setAvatar('chat-avatar-initial', 'chat-avatar-img', p);
  $('chat-name').textContent        = p.displayName || 'User';
  $('chat-status-text').textContent = statusText(p);
}

async function markRead(otherUid) {
  const id = await getOrCreateConv(otherUid);
  updateDoc(doc(db, 'conversations', id), { readBy: [S.user.uid] }).catch(() => {});
}

function loadMessages(otherUid) {
  if (S.chatUnsub) S.chatUnsub();
  const chatEl = $('chat-messages');
  chatEl.innerHTML = '';

  getOrCreateConv(otherUid).then(convId => {
    // Single orderBy on one field — no composite index
    const q = query(collection(db, 'conversations', convId, 'messages'),
      orderBy('createdAt', 'asc'), limit(200));

    S.chatUnsub = onSnapshot(q, snap => {
      chatEl.innerHTML = '';
      let lastDate = null;
      snap.docs.forEach(d => {
        const msg = d.data();
        const dt  = msg.createdAt?.toDate?.();
        if (dt) {
          const ds = dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
          if (ds !== lastDate) {
            const div = document.createElement('div');
            div.className = 'chat-date-divider';
            div.textContent = ds;
            chatEl.appendChild(div);
            lastDate = ds;
          }
        }
        appendMsg(msg);
      });
      chatEl.scrollTop = chatEl.scrollHeight;
    });
  });
}

function appendMsg(msg) {
  const mine = msg.senderId === S.user.uid;
  const div  = document.createElement('div');
  div.className = `msg ${mine ? 'out' : 'in'}`;
  const time = msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';
  div.innerHTML  = `<div class="msg-bubble">${escH(msg.text)}</div>`;
  if (time) {
    const t = document.createElement('div');
    t.className = 'msg-time';
    t.textContent = time;
    div.appendChild(t);
  }
  $('chat-messages').appendChild(div);
}

async function sendMessage() {
  const input = $('chat-input');
  const text  = input.value.trim();
  if (!text || !S.activeChatUid) return;
  input.value = '';

  // Optimistic UI
  appendMsg({ text, senderId: S.user.uid, createdAt: Timestamp.now() });
  $('chat-messages').scrollTop = $('chat-messages').scrollHeight;

  const convId = await getOrCreateConv(S.activeChatUid);
  await Promise.all([
    addDoc(collection(db, 'conversations', convId, 'messages'),
      { text, senderId: S.user.uid, createdAt: serverTimestamp() }),
    updateDoc(doc(db, 'conversations', convId),
      { lastMessage: text, lastMessageAt: serverTimestamp(), readBy: [S.user.uid] }),
  ]);
}

// ════════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════════
function updateProfileUI() {
  if (!S.profile) return;
  const p = S.profile;
  $('profile-name').textContent  = p.displayName || '';
  $('profile-email').textContent = p.email || S.user.email || '';
  $('settings-name').value       = p.displayName || '';
  $('public-toggle').checked     = !!p.isPublic;
  $('ghost-toggle').checked      = !!p.ghostMode;
  S.ghostMode                    = !!p.ghostMode;
  setAvatar('profile-avatar-initial', 'profile-avatar-img', p);
  setAvatar('top-avatar-initial',     'top-avatar-img',     p);
  renderZones();
  updateStatCounts();
}

function setAvatar(initId, imgId, p) {
  const ini = $(initId), img = $(imgId);
  if (!ini || !img) return;
  if (p?.photoURL) { img.src = p.photoURL; img.hidden = false; ini.textContent = ''; }
  else             { img.hidden = true; img.src = ''; ini.textContent = (p?.displayName || '?')[0].toUpperCase(); }
}

function updateStatCounts() {
  $('stat-friends').textContent = Object.keys(S.friends).length;
  $('stat-zones').textContent   = S.profile?.zones?.length || 0;
}

async function uploadPhoto(file) {
  showToast('Uploading…');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
  fd.append('folder', 'orbit/avatars');
  try {
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.secure_url) throw new Error();
    await Promise.all([
      updateProfile(auth.currentUser, { photoURL: data.secure_url }),
      updateDoc(doc(db, 'users', S.user.uid), { photoURL: data.secure_url }),
    ]);
    S.profile.photoURL = data.secure_url;
    updateProfileUI(); upsertSelf();
    showToast('Photo updated!');
  } catch { showToast('Upload failed. Check Cloudinary preset.'); }
}

function renderZones() {
  const el    = $('zones-list');
  const zones = S.profile?.zones || [];
  $('stat-zones').textContent = zones.length;
  el.innerHTML = zones.length === 0
    ? '<p style="font-size:13px;color:var(--text2);padding:4px 0">No zones saved yet.</p>'
    : zones.map((z, i) => `
        <div class="zone-item">
          <span>📍 ${escH(z.name)}</span>
          <button class="zone-delete" data-i="${i}" aria-label="Delete">×</button>
        </div>`).join('');
  el.querySelectorAll('.zone-delete').forEach(b =>
    b.addEventListener('click', () => deleteZone(+b.dataset.i)));
}

async function addZone(name) {
  if (S.myLat === null) { showToast('Location not available.'); return; }
  const zones = [...(S.profile?.zones || []), { name, lat: S.myLat, lng: S.myLng }];
  await updateDoc(doc(db, 'users', S.user.uid), { zones });
  S.profile.zones = zones; renderZones();
  showToast(`Zone "${name}" saved!`);
}

async function deleteZone(i) {
  const zones = [...(S.profile?.zones || [])];
  zones.splice(i, 1);
  await updateDoc(doc(db, 'users', S.user.uid), { zones });
  S.profile.zones = zones; renderZones();
}

// ════════════════════════════════════════════════════════════
//  RENDER — Friends list
// ════════════════════════════════════════════════════════════
function renderFriendsList() {
  const list  = $('friends-list');
  const empty = $('friends-empty');
  const entries = Object.entries(S.friends);
  empty.hidden = entries.length > 0;
  list.innerHTML = entries.map(([uid, p]) => {
    const sc = statusClass(p);
    const dc = sc === 'online' ? 'green' : sc === 'moving' ? 'blue' : '';
    return `<div class="user-row" data-uid="${uid}">
      ${avatarHTML('size-sm', p)}
      <div class="user-row-info">
        <div class="user-row-name">${escH(p.displayName || 'User')}</div>
        <div class="user-row-sub">${escH(statusText(p))}</div>
      </div>
      <div class="online-dot ${dc}"></div>
    </div>`;
  }).join('');
  list.querySelectorAll('.user-row').forEach(r =>
    r.addEventListener('click', () => openUserProfile(r.dataset.uid)));
}

function renderFriendRequests() {
  const section = $('friend-requests-section');
  const list    = $('friend-requests-list');
  section.hidden = S.friendRequests.length === 0;
  list.innerHTML = S.friendRequests.map(req => `
    <div class="user-row">
      <div class="user-row-info">
        <div class="user-row-name">Friend Request</div>
        <div class="user-row-sub">${escH(req.from)}</div>
      </div>
      <div class="row-actions">
        <button class="accept-btn" data-id="${req.id}">Accept</button>
        <button class="reject-btn" data-id="${req.id}">Decline</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.accept-btn').forEach(b => b.addEventListener('click', () => acceptRequest(b.dataset.id)));
  list.querySelectorAll('.reject-btn').forEach(b => b.addEventListener('click', () => rejectRequest(b.dataset.id)));
}

async function renderConversations(convs) {
  const list  = $('conversations-list');
  const empty = $('messages-empty');
  empty.hidden = convs.length > 0;
  if (!convs.length) { list.innerHTML = ''; return; }

  const items = await Promise.all(convs.map(async c => {
    const ouid = c.participants.find(p => p !== S.user.uid);
    let p = S.friends[ouid] || S.nearbyUsers[ouid];
    if (!p) { const s = await getDoc(doc(db, 'users', ouid)); p = s.exists() ? s.data() : { displayName: 'Unknown', photoURL: '' }; }
    const unread = !c.readBy?.includes(S.user.uid);
    const time   = c.lastMessageAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';
    return `<div class="conv-row" data-uid="${ouid}">
      ${avatarHTML('size-md', p)}
      <div class="conv-info">
        <div class="conv-name">${escH(p.displayName || 'User')}</div>
        <div class="conv-last${unread ? ' unread' : ''}">${escH(c.lastMessage || '…')}</div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${time}</span>
        ${unread ? '<div class="conv-unread-dot"></div>' : ''}
      </div>
    </div>`;
  }));
  list.innerHTML = items.join('');
  list.querySelectorAll('.conv-row').forEach(r =>
    r.addEventListener('click', () => openChat(r.dataset.uid)));
}

// ════════════════════════════════════════════════════════════
//  USER PROFILE (other user)
// ════════════════════════════════════════════════════════════
function openUserProfile(uid) {
  S.viewingUid = uid;
  const p = S.friends[uid] || S.nearbyUsers[uid];
  if (!p) return;
  setAvatar('up-avatar-initial', 'up-avatar-img', p);
  $('up-name').textContent         = p.displayName || 'User';
  $('up-status-badge').textContent = statusText(p) || 'Active';
  const z = zoneMatch(p);
  $('up-location').textContent = z ? `📍 ${z}` : p.location ? `${p.location.lat.toFixed(4)}, ${p.location.lng.toFixed(4)}` : 'Unknown';
  $('up-battery').textContent  = p.battery != null ? `${p.battery}%${p.isCharging ? ' ⚡ Charging' : ''}` : 'Unknown';
  $('up-speed').textContent    = (p.speed || 0) > 0 ? `${p.speed} km/h` : 'Stationary';
  const ts = p.location?.updatedAt?.toDate?.();
  if (ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    $('up-since').textContent = m < 2 ? 'Just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
  } else $('up-since').textContent = '–';
  $('up-add-friend-btn').hidden = !!S.friends[uid];
  openPanel('user-profile');
}

// ════════════════════════════════════════════════════════════
//  GHOST MODE
// ════════════════════════════════════════════════════════════
async function setGhost(on) {
  S.ghostMode = on;
  $('ghost-toggle').checked = on;
  $('ghost-btn').classList.toggle('active', on);
  $('ghost-indicator').hidden = !on;
  const upd = { ghostMode: on, ghostLocation: on && S.myLat ? { lat: S.myLat, lng: S.myLng } : null };
  await updateDoc(doc(db, 'users', S.user.uid), upd).catch(() => {});
  if (S.profile) { S.profile.ghostMode = on; if (!on) S.profile.ghostLocation = null; }
  upsertSelf();
  showToast(on ? '👻 Ghost mode on' : 'Ghost mode off');
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION / PANELS
// ════════════════════════════════════════════════════════════
const PANEL_MAP = {
  map: null, friends: 'friends-panel', messages: 'messages-panel',
  profile: 'profile-panel', chat: 'chat-panel',
  'user-profile': 'user-profile-panel', settings: 'settings-panel',
};

function openPanel(name) {
  S.activePanel = name;
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.remove('open'); p.setAttribute('aria-hidden', 'true');
  });
  const id = PANEL_MAP[name];
  if (id) { const el = $(id); el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => {
      openPanel(btn.dataset.panel);
      if (btn.dataset.panel === 'map') recenterMap();
    })
  );
}

function bindBackBtns() {
  document.querySelectorAll('.back-btn').forEach(btn =>
    btn.addEventListener('click', () => openPanel(btn.dataset.back || 'map'))
  );
}

// ════════════════════════════════════════════════════════════
//  TOP BAR
// ════════════════════════════════════════════════════════════
function bindTopBar() {
  $('my-avatar-btn').addEventListener('click', () => openPanel('profile'));
  $('mode-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.mode-btn');
    if (!btn || btn.dataset.mode === S.mapMode) return;
    S.mapMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mapMode));
    if (S.mapMode === 'explore') loadNearbyUsers();
    else { clearExploreMarkers(); refreshMapMarkers(); }
  });
  $('ghost-btn').addEventListener('click', () => setGhost(!S.ghostMode));
}

// ════════════════════════════════════════════════════════════
//  PROFILE BINDINGS
// ════════════════════════════════════════════════════════════
function bindProfile() {
  $('change-photo-btn').addEventListener('click', () => $('photo-input').click());
  $('photo-input').addEventListener('change', e => { if (e.target.files[0]) uploadPhoto(e.target.files[0]); e.target.value = ''; });
  $('public-toggle').addEventListener('change', async e => {
    await updateDoc(doc(db, 'users', S.user.uid), { isPublic: e.target.checked }).catch(() => {});
    if (S.profile) S.profile.isPublic = e.target.checked;
    showToast(e.target.checked ? 'Visible to everyone nearby.' : 'Friends-only mode.');
  });
  $('ghost-toggle').addEventListener('change', e => setGhost(e.target.checked));
  $('add-zone-btn').addEventListener('click', () => { $('zone-name-input').value = ''; $('zone-modal').hidden = false; setTimeout(() => $('zone-name-input').focus(), 100); });
  $('settings-btn').addEventListener('click', () => openPanel('settings'));
  $('save-settings-btn').addEventListener('click', async () => {
    const name = $('settings-name').value.trim();
    if (!name) return;
    await Promise.all([
      updateProfile(auth.currentUser, { displayName: name }),
      updateDoc(doc(db, 'users', S.user.uid), { displayName: name }),
    ]);
    if (S.profile) S.profile.displayName = name;
    $('profile-name').textContent = name;
    upsertSelf(); showToast('Name updated!'); openPanel('profile');
  });
  $('logout-btn').addEventListener('click', async () => {
    if (S.watchId) navigator.geolocation.clearWatch(S.watchId);
    S.unsubs.forEach(u => u());
    if (S.convUnsub) S.convUnsub();
    if (S.chatUnsub) S.chatUnsub();
    await updateDoc(doc(db, 'users', S.user.uid), { status: 'offline' }).catch(() => {});
    await signOut(auth);
    location.reload();
  });

  // User profile buttons
  $('up-message-btn').addEventListener('click', () => { if (S.viewingUid) openChat(S.viewingUid); });
  $('up-add-friend-btn').addEventListener('click', async () => {
    const p = S.friends[S.viewingUid] || S.nearbyUsers[S.viewingUid];
    if (!p?.email) return;
    const err = await sendFriendRequest(p.email);
    showToast(err || 'Friend request sent!');
  });
}

// ════════════════════════════════════════════════════════════
//  FRIENDS BINDINGS
// ════════════════════════════════════════════════════════════
function bindFriends() {
  $('add-friend-btn').addEventListener('click', () => {
    $('add-friend-email').value = '';
    $('add-friend-error').textContent = '';
    $('add-friend-modal').hidden = false;
    setTimeout(() => $('add-friend-email').focus(), 100);
  });
}

// ════════════════════════════════════════════════════════════
//  CHAT BINDINGS
// ════════════════════════════════════════════════════════════
function bindChat() {
  $('send-btn').addEventListener('click', sendMessage);
  $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  $('chat-locate-btn').addEventListener('click', () => {
    const p = S.friends[S.activeChatUid] || S.nearbyUsers[S.activeChatUid];
    if (!p?.location) { showToast('Location not available.'); return; }
    openPanel('map');
    S.map.flyTo([p.location.lat, p.location.lng], 16, { duration: 1 });
  });
  $('chat-user-info').addEventListener('click', () => { if (S.activeChatUid) openUserProfile(S.activeChatUid); });
}

// ════════════════════════════════════════════════════════════
//  MODALS
// ════════════════════════════════════════════════════════════
function bindModals() {
  // Add friend
  $('cancel-add-friend').addEventListener('click', () => $('add-friend-modal').hidden = true);
  $('confirm-add-friend').addEventListener('click', async () => {
    const email = $('add-friend-email').value.trim();
    if (!email) return;
    const err = await sendFriendRequest(email);
    if (err) { $('add-friend-error').textContent = err; }
    else { $('add-friend-modal').hidden = true; showToast('Friend request sent!'); }
  });
  $('add-friend-modal').addEventListener('click', e => { if (e.target === $('add-friend-modal')) $('add-friend-modal').hidden = true; });
  $('add-friend-email').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const email = $('add-friend-email').value.trim();
    if (!email) return;
    const err = await sendFriendRequest(email);
    if (err) $('add-friend-error').textContent = err;
    else { $('add-friend-modal').hidden = true; showToast('Friend request sent!'); }
  });

  // Zone
  $('cancel-zone').addEventListener('click', () => $('zone-modal').hidden = true);
  $('confirm-zone').addEventListener('click', async () => {
    const name = $('zone-name-input').value.trim();
    if (!name) return;
    $('zone-modal').hidden = true;
    await addZone(name);
  });
  $('zone-name-input').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const name = $('zone-name-input').value.trim();
    if (!name) return;
    $('zone-modal').hidden = true;
    await addZone(name);
  });
  $('zone-modal').addEventListener('click', e => { if (e.target === $('zone-modal')) $('zone-modal').hidden = true; });
}

// ════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escH(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarHTML(cls, p) {
  if (p?.photoURL) return `<div class="avatar ${cls}"><img src="${escH(p.photoURL)}" alt="" loading="lazy"/></div>`;
  return `<div class="avatar ${cls}"><span>${escH((p?.displayName || '?')[0].toUpperCase())}</span></div>`;
}

let _toastTimer;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

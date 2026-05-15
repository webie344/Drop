/* ═══════════════════════════════════════════════════
   DRIFT — app.js  v2
   CSS Hybrid Map · Posts Swipe · Seed Data
   ═══════════════════════════════════════════════════ */

// ── CONFIG ────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};
const CLOUDINARY_CLOUD_NAME    = "ddtdqrh1b";
const CLOUDINARY_UPLOAD_PRESET = "profile-pictures";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── CONSTANTS ─────────────────────────────────────
const ZONE_RADIUS_DEFAULT = 500;
const CROWD_THRESHOLD     = 10;
const CROWD_RADIUS        = 200;
const ORB_COLORS = {
  open:"#f97316", chill:"#06b6d4", lost:"#a855f7",
  bored:"#eab308", curious:"#22c55e", observe:"#64748b", default:"#7c3aed",
};
const SEED_NAMES = [
  "Alex","Maya","Jordan","Riley","Sam","Morgan","Kai","Avery","Quinn","Drew",
  "Sage","River","Blake","Casey","Dakota","Emery","Finley","Hayden","Jamie","Logan",
];
const SEED_BIOS = [
  "just drifting through","coffee & chaos","perpetually lost","night owl","here for a good time",
  "exploring the city","in my own world","local adventurer","people watcher","finding my way",
  "on a mission","curious about everything","city nomad","just passing through","living in the moment",
  "always exploring","early bird","midnight drifter","lost and loving it","vibes only",
];
const SEED_MOODS = ["open","chill","lost","bored","curious","observe",null,null];

// ── STATE ─────────────────────────────────────────
const state = {
  uid:null, user:null, authUser:null, coords:null,
  nearbyUsers:[], threads:[], ghosts:[],
  currentThread:null, currentProfileCard:null,
  anchorMode:false, currentMood:null,
  zoneRadius:ZONE_RADIUS_DEFAULT,
  currentView:"map",
  unsubscribers:[],
  mapZoom:1.0,
  mapPan:{x:0,y:0},
  mapDragging:false, mapDragStart:{x:0,y:0}, mapDragPanStart:{x:0,y:0},
  geoWatchId:null,
  // Posts
  postQueue:[], currentPostIndex:0,
  postSwiping:false, postSwipeStartX:0, postSwipeStartY:0,
};

// ── UTILS ─────────────────────────────────────────
function haversineDistance(lat1,lng1,lat2,lng2){
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function bearingTo(lat1,lng1,lat2,lng2){
  const φ1=lat1*Math.PI/180,φ2=lat2*Math.PI/180,Δλ=(lng2-lng1)*Math.PI/180;
  return(Math.atan2(Math.sin(Δλ)*Math.cos(φ2),Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ))*180/Math.PI+360)%360;
}
function orbColor(mood){return ORB_COLORS[mood]||ORB_COLORS.default;}
function nameInitial(n){return(n||"?")[0].toUpperCase();}
function escapeHtml(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function formatRelativeTime(ts){
  if(!ts)return""; const ms=Date.now()-(ts.toDate?ts.toDate().getTime():ts);
  if(ms<60000)return"just now"; if(ms<3600000)return`${Math.floor(ms/60000)}m ago`;
  if(ms<86400000)return`${Math.floor(ms/3600000)}h ago`; return`${Math.floor(ms/86400000)}d ago`;
}
function randomBetween(min,max){return Math.random()*(max-min)+min;}
function randomOffset(meters){
  const lat=meters/111320; const lng=meters/(111320*Math.cos((state.coords?.lat||40.7)*Math.PI/180));
  return{lat:(Math.random()-0.5)*2*lat, lng:(Math.random()-0.5)*2*lng};
}

let toastTimer=null;
function showToast(message,type="default"){
  const toast=document.getElementById("toast");
  const icons={
    success:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#22c55e;width:15px;height:15px"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#ef4444;width:15px;height:15px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    info:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#06b6d4;width:15px;height:15px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    ghost:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#a78bfa;width:15px;height:15px"><path d="M9 10h.01M15 10h.01M12 2a7 7 0 0 1 7 7v8l-2-2-2 2-2-2-2 2-2-2-2 2V9a7 7 0 0 1 7-7z"/></svg>`,
  };
  toast.innerHTML=(icons[type]||icons.info)+`<span>${message}</span>`;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.add("hidden"),3200);
}

function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
}

function showView(name){
  state.currentView=name;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(`view-${name}`)?.classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(name==="inbox")   renderInbox();
  if(name==="crowd")   initCrowdView();
  if(name==="profile") renderProfile();
  if(name==="posts")   renderPostsPage();
  if(name==="map")     { updateZoneRingSize(); syncOrbElements(); }
}

function togglePw(id){const el=document.getElementById(id);el.type=el.type==="password"?"text":"password";}

// ── AUTH CANVAS ───────────────────────────────────
function initAuthCanvas(){
  const canvas=document.getElementById("auth-canvas"); if(!canvas)return;
  const ctx=canvas.getContext("2d");
  const particles=[];
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
  resize();
  for(let i=0;i<30;i++) particles.push({
    x:Math.random()*window.innerWidth, y:Math.random()*window.innerHeight*0.6,
    r:Math.random()*2+0.5, vx:(Math.random()-.5)*.3, vy:(Math.random()-.5)*.3,
    alpha:Math.random()*.5+.15, color:Math.random()>.6?"#7c3aed":"#06b6d4",
  });
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const g=ctx.createRadialGradient(canvas.width/2,canvas.height*.3,0,canvas.width/2,canvas.height*.3,canvas.height*.7);
    g.addColorStop(0,"rgba(124,58,237,0.12)"); g.addColorStop(.5,"rgba(6,182,212,0.05)"); g.addColorStop(1,"transparent");
    ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=p.color+Math.round(p.alpha*255).toString(16).padStart(2,"0"); ctx.fill();
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>canvas.width) p.vx*=-1;
      if(p.y<0||p.y>canvas.height*.6) p.vy*=-1;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ── AUTH ──────────────────────────────────────────
function initAuth(){
  document.querySelectorAll(".auth-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".auth-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".auth-form").forEach(f=>f.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`auth-${tab.dataset.tab}`)?.classList.add("active");
    });
  });

  document.getElementById("btn-login").addEventListener("click",async()=>{
    const email=document.getElementById("login-email").value.trim();
    const pass=document.getElementById("login-password").value;
    const errEl=document.getElementById("login-error"); errEl.textContent="";
    if(!email||!pass){errEl.textContent="Please fill in all fields.";return;}
    const btn=document.getElementById("btn-login"); btn.disabled=true; btn.textContent="Signing in...";
    try{await auth.signInWithEmailAndPassword(email,pass);}
    catch(e){errEl.textContent=friendlyAuthError(e.code);btn.disabled=false;btn.textContent="Sign In";}
  });

  document.getElementById("btn-register").addEventListener("click",async()=>{
    const name=document.getElementById("reg-name").value.trim();
    const email=document.getElementById("reg-email").value.trim();
    const pass=document.getElementById("reg-password").value;
    const errEl=document.getElementById("register-error"); errEl.textContent="";
    if(!name||!email||!pass){errEl.textContent="Please fill in all fields.";return;}
    if(pass.length<6){errEl.textContent="Password must be at least 6 characters.";return;}
    const btn=document.getElementById("btn-register"); btn.disabled=true; btn.textContent="Creating...";
    try{
      const cred=await auth.createUserWithEmailAndPassword(email,pass);
      await cred.user.updateProfile({displayName:name});
      await createUserDoc(cred.user,name);
    }catch(e){errEl.textContent=friendlyAuthError(e.code);btn.disabled=false;btn.textContent="Create Account";}
  });

  const gp=new firebase.auth.GoogleAuthProvider();
  ["btn-google-login","btn-google-register"].forEach(id=>{
    document.getElementById(id).addEventListener("click",async()=>{
      try{
        const r=await auth.signInWithPopup(gp);
        if(r.additionalUserInfo.isNewUser) await createUserDoc(r.user,r.user.displayName);
      }catch(e){
        const errEl=document.getElementById(id.includes("login")?"login-error":"register-error");
        errEl.textContent=friendlyAuthError(e.code);
      }
    });
  });

  auth.onAuthStateChanged(async user=>{
    if(user){
      state.uid=user.uid; state.authUser=user;
      await loadUserDoc(user.uid);
      showScreen("app-screen"); initApp();
    }else{cleanupApp(); showScreen("auth-screen");}
  });
}

function friendlyAuthError(code){
  return({
    "auth/user-not-found":"No account found with this email.",
    "auth/wrong-password":"Incorrect password.",
    "auth/email-already-in-use":"This email is already registered.",
    "auth/invalid-email":"Please enter a valid email.",
    "auth/weak-password":"Password is too weak.",
    "auth/network-request-failed":"Network error. Check your connection.",
    "auth/popup-closed-by-user":"Sign-in cancelled.",
    "auth/too-many-requests":"Too many attempts. Please wait.",
  })[code]||"Something went wrong. Please try again.";
}

async function createUserDoc(fbUser,displayName){
  const ref=db.collection("users").doc(fbUser.uid);
  const snap=await ref.get();
  if(!snap.exists){
    await ref.set({
      uid:fbUser.uid, displayName:displayName||"Anonymous",
      email:fbUser.email, photoURL:fbUser.photoURL||null,
      bio:"", mood:null, anchorMode:false, isVisible:true, showTrail:true,
      driftScore:0, totalConvos:0, totalGhosts:0, isOnline:true,
      lastSeen:firebase.firestore.FieldValue.serverTimestamp(),
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      location:null, isSeeded:false,
    });
  }
}

async function loadUserDoc(uid){
  const snap=await db.collection("users").doc(uid).get();
  if(snap.exists) state.user=snap.data();
}

// ── APP INIT ──────────────────────────────────────
function initApp(){
  initNavigation();
  initCSSMap();
  initGeolocation();
  initMapControls();
  initMoodPicker();
  initAnchorMode();
  initThreadInput();
  initCrowdInput();
  initProfile();
  initSettings();
  initPostsPage();
  subscribeToThreads();
  showView("map");
}

function cleanupApp(){
  state.unsubscribers.forEach(fn=>fn()); state.unsubscribers=[];
  if(state.geoWatchId!==null){navigator.geolocation.clearWatch(state.geoWatchId);state.geoWatchId=null;}
}

// ── NAVIGATION ────────────────────────────────────
function initNavigation(){
  document.querySelectorAll(".nav-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{if(btn.dataset.view) showView(btn.dataset.view);});
  });
}

// ── GEOLOCATION ───────────────────────────────────
function initGeolocation(){
  if(!navigator.geolocation){showToast("Geolocation not supported","error");return;}
  state.geoWatchId=navigator.geolocation.watchPosition(onLocationUpdate,onLocationError,
    {enableHighAccuracy:true,timeout:10000,maximumAge:5000});
}

function onLocationUpdate(pos){
  const{latitude:lat,longitude:lng,accuracy}=pos.coords;
  const prev=state.coords;
  state.coords={lat,lng,accuracy};
  if(state.uid){
    db.collection("users").doc(state.uid).update({
      location:new firebase.firestore.GeoPoint(lat,lng),
      lastSeen:firebase.firestore.FieldValue.serverTimestamp(),isOnline:true,
    }).catch(()=>{});
  }
  const lbl=document.getElementById("location-label");
  if(lbl) lbl.textContent=`±${Math.round(accuracy)}m accuracy`;
  loadNearbyUsers();
  if(prev&&haversineDistance(prev.lat,prev.lng,lat,lng)>200) incrementDriftScore();
}

function onLocationError(err){
  showToast({1:"Location access denied.",2:"Location unavailable.",3:"Location request timed out."}[err.code]||"Location error","error");
  // For testing without GPS, use a fallback location
  if(!state.coords){
    state.coords={lat:40.7128,lng:-74.0060,accuracy:10};
    document.getElementById("location-label").textContent="Using demo location (NYC)";
    loadNearbyUsers();
  }
}

function incrementDriftScore(){
  if(!state.uid)return;
  db.collection("users").doc(state.uid).update({driftScore:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
}

// ── NEARBY USERS ──────────────────────────────────
let nearbyUnsubscribe=null;
function loadNearbyUsers(){
  if(!state.coords||!state.uid)return;
  if(nearbyUnsubscribe)nearbyUnsubscribe();
  nearbyUnsubscribe=db.collection("users")
    .where("isOnline","==",true).where("isVisible","==",true).limit(100)
    .onSnapshot(snap=>{
      const nearby=[];
      snap.forEach(doc=>{
        const u=doc.data(); if(u.uid===state.uid||!u.location)return;
        const dist=haversineDistance(state.coords.lat,state.coords.lng,u.location.latitude,u.location.longitude);
        if(dist<=state.zoneRadius) nearby.push({...u,distance:Math.round(dist)});
      });
      nearby.sort((a,b)=>a.distance-b.distance);
      state.nearbyUsers=nearby;
      updateZoneBadge(nearby.length);
      renderNearbyStrip(nearby);
      checkCrowdMode(nearby);
      checkGhostReactivation();
      // Update CSS map
      updateZoneRingSize();
      syncOrbElements();
    },()=>{});
  state.unsubscribers.push(()=>{if(nearbyUnsubscribe)nearbyUnsubscribe();});
}

function updateZoneBadge(count){
  const el=document.getElementById("zone-count"); if(el) el.textContent=`${count} nearby`;
}

// ══════════════════════════════════════════════════
//  CSS HYBRID MAP  (no rAF loop — GPU animations)
// ══════════════════════════════════════════════════
// ── SOCIAL PROXIMITY VIEW (no canvas, no lag) ─────
function initCSSMap(){
  updateSelfOrb();
  window.addEventListener("resize",()=>{updateZoneRingSize();syncOrbElements();});
}

function updateSelfOrb(){
  const initial=document.getElementById("self-orb-initial");
  const photo=document.getElementById("self-orb-photo");
  const name=state.user?.displayName||state.authUser?.displayName||"?";
  if(initial) initial.textContent=nameInitial(name);
  if(photo&&state.user?.photoURL){
    photo.style.backgroundImage=`url(${state.user.photoURL})`;
    photo.style.backgroundSize="cover";
    photo.style.borderRadius="50%";
    if(initial) initial.style.display="none";
  }
}

function getMapMetrics(){
  const wrap=document.getElementById("map-wrap"); if(!wrap)return null;
  const W=wrap.offsetWidth, H=wrap.offsetHeight;
  const ppm=(Math.min(W,H)*0.32/state.zoneRadius)*state.mapZoom;
  return{W,H,ppm};
}

function updateZoneRingSize(){
  const ring=document.getElementById("map-zone-ring"); if(!ring)return;
  const m=getMapMetrics(); if(!m)return;
  const size=state.zoneRadius*m.ppm*2;
  ring.style.width=size+"px"; ring.style.height=size+"px";
  ring.style.transform=`translate(calc(-50% + ${state.mapPan.x}px), calc(-50% + ${state.mapPan.y}px))`;
  const selfEl=document.getElementById("map-self-orb");
  if(selfEl) selfEl.style.transform=`translate(calc(-50% + ${state.mapPan.x}px), calc(-50% + ${state.mapPan.y}px))`;
}

// Throttle: only update orb positions every 15 seconds max
let lastOrbPositionSync=0;
function syncOrbElements(forcePositions=false){
  const layer=document.getElementById("map-orb-layer"); if(!layer)return;
  const now=Date.now();
  const shouldUpdatePositions=forcePositions||(now-lastOrbPositionSync>15000);

  // Always sync presence (create / remove orbs)
  const currentUids=new Set(state.nearbyUsers.map(u=>u.uid));
  layer.querySelectorAll(".social-orb").forEach(el=>{
    if(!currentUids.has(el.dataset.uid)){
      el.style.opacity="0"; el.style.transform+=" scale(0.5)";
      setTimeout(()=>el.remove(), 400);
    }
  });

  if(shouldUpdatePositions){
    lastOrbPositionSync=now;
    const m=getMapMetrics(); if(!m)return;
    updateZoneRingSize();

    state.nearbyUsers.forEach(user=>{
      if(!user.location||!state.coords)return;
      const angle=bearingTo(state.coords.lat,state.coords.lng,user.location.latitude,user.location.longitude);
      const rad=angle*Math.PI/180;
      const px=Math.sin(rad)*user.distance*m.ppm+state.mapPan.x;
      const py=-Math.cos(rad)*user.distance*m.ppm+state.mapPan.y;

      let orb=document.getElementById(`orb-${user.uid}`);
      if(!orb){
        orb=createOrbElement(user,layer);
        // Animate in
        orb.style.opacity="0"; orb.style.transform=`translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) scale(0.5)`;
        requestAnimationFrame(()=>{
          orb.style.transition="transform 2s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.4s ease";
          orb.style.opacity="1"; orb.style.transform=`translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
        });
      } else {
        orb.style.transform=`translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
        // Update live data
        orb.style.setProperty("--oc",orbColor(user.mood));
        const nameEl=orb.querySelector(".social-orb-name");
        const pillEl=orb.querySelector(".social-orb-pill");
        if(nameEl) nameEl.textContent=user.displayName;
        if(pillEl) pillEl.textContent=`${user.distance}m · ${user.mood||"drifting"}`;
      }
    });
  }
}

function createOrbElement(user,layer){
  const color=orbColor(user.mood);
  const delay=(Math.random()*3).toFixed(2);
  const dur=(3+Math.random()*2).toFixed(2);

  const orb=document.createElement("div");
  orb.className="social-orb";
  orb.id=`orb-${user.uid}`;
  orb.dataset.uid=user.uid;
  orb.style.setProperty("--oc",color);
  orb.style.setProperty("--fdelay",delay+"s");
  orb.style.setProperty("--fdur",dur+"s");
  orb.style.transition="transform 2s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.4s ease";

  const photoHTML=user.photoURL
    ?`<img class="social-orb-photo" src="${user.photoURL}" alt="" />`
    :``;

  orb.innerHTML=`
    <div class="social-orb-float">
      <div class="social-orb-pulse-ring"></div>
      <div class="social-orb-avatar-wrap">
        ${photoHTML}
        ${!user.photoURL?nameInitial(user.displayName):""}
        <div class="social-orb-online"></div>
      </div>
      <span class="social-orb-name">${user.displayName}</span>
      <span class="social-orb-pill">${user.distance}m · ${user.mood||"drifting"}</span>
    </div>`;

  orb.addEventListener("click",()=>openProfileCard(user));
  layer.appendChild(orb);
  return orb;
}

// ── MAP CONTROLS ──────────────────────────────────
function initMapControls(){
  document.getElementById("zoom-in").addEventListener("click",()=>{
    state.mapZoom=Math.min(state.mapZoom*1.35,5);
    updateZoneRingSize(); syncOrbElements();
  });
  document.getElementById("zoom-out").addEventListener("click",()=>{
    state.mapZoom=Math.max(state.mapZoom/1.35,0.3);
    updateZoneRingSize(); syncOrbElements();
  });

  const wrap=document.getElementById("map-wrap"); if(!wrap)return;

  // Touch pinch zoom + drag
  let lastDist=null;
  wrap.addEventListener("touchstart",e=>{
    if(e.touches.length===2){
      lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    }else if(e.touches.length===1){
      state.mapDragging=true;
      state.mapDragStart={x:e.touches[0].clientX,y:e.touches[0].clientY};
      state.mapDragPanStart={...state.mapPan};
    }
  },{passive:true});

  wrap.addEventListener("touchmove",e=>{
    if(e.touches.length===2&&lastDist){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      state.mapZoom=Math.max(.3,Math.min(5,state.mapZoom*(d/lastDist)));
      lastDist=d; updateZoneRingSize(); syncOrbElements();
    }else if(e.touches.length===1&&state.mapDragging){
      state.mapPan={
        x:state.mapDragPanStart.x+(e.touches[0].clientX-state.mapDragStart.x),
        y:state.mapDragPanStart.y+(e.touches[0].clientY-state.mapDragStart.y),
      };
      updateZoneRingSize(); syncOrbElements();
    }
  },{passive:true});

  wrap.addEventListener("touchend",e=>{
    if(e.touches.length<2)lastDist=null;
    if(e.touches.length===0)state.mapDragging=false;
  });

  // Mouse drag
  wrap.addEventListener("mousedown",e=>{
    state.mapDragging=true;
    state.mapDragStart={x:e.clientX,y:e.clientY};
    state.mapDragPanStart={...state.mapPan};
    wrap.style.cursor="grabbing";
  });
  wrap.addEventListener("mousemove",e=>{
    if(!state.mapDragging)return;
    state.mapPan={
      x:state.mapDragPanStart.x+(e.clientX-state.mapDragStart.x),
      y:state.mapDragPanStart.y+(e.clientY-state.mapDragStart.y),
    };
    updateZoneRingSize(); syncOrbElements();
  });
  wrap.addEventListener("mouseup",()=>{state.mapDragging=false;wrap.style.cursor="grab";});
  wrap.addEventListener("mouseleave",()=>{state.mapDragging=false;wrap.style.cursor="grab";});
  wrap.addEventListener("wheel",e=>{
    e.preventDefault();
    state.mapZoom=Math.max(.3,Math.min(5,state.mapZoom*(e.deltaY<0?1.12:0.89)));
    updateZoneRingSize(); syncOrbElements();
  },{passive:false});

  wrap.style.cursor="grab";
}

// ── NEARBY STRIP ──────────────────────────────────
function renderNearbyStrip(users){
  const container=document.getElementById("nearby-strip-inner"); if(!container)return;
  container.innerHTML="";
  users.slice(0,12).forEach(user=>{
    const color=orbColor(user.mood);
    const chip=document.createElement("div"); chip.className="nearby-chip";
    chip.innerHTML=`<div class="nearby-chip-orb" style="background:${color}">${nameInitial(user.displayName)}</div>
      <div class="nearby-chip-info"><span class="nearby-chip-name">${user.displayName}</span><span class="nearby-chip-dist">${user.distance}m away</span></div>`;
    chip.addEventListener("click",()=>openProfileCard(user));
    container.appendChild(chip);
  });
}

// ── MOOD ──────────────────────────────────────────
function initMoodPicker(){
  const btn=document.getElementById("btn-mood"),picker=document.getElementById("mood-picker");
  btn.addEventListener("click",()=>picker.classList.toggle("hidden"));
  document.querySelectorAll(".mood-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      setMood(b.dataset.mood); picker.classList.add("hidden");
      document.querySelectorAll(".mood-btn").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
    });
  });
  document.getElementById("mood-clear").addEventListener("click",()=>{
    setMood(null); picker.classList.add("hidden");
    document.querySelectorAll(".mood-btn").forEach(x=>x.classList.remove("active"));
  });
}

function setMood(mood){
  state.currentMood=mood; if(state.user)state.user.mood=mood;
  if(state.uid) db.collection("users").doc(state.uid).update({mood}).catch(()=>{});
  const d=document.getElementById("profile-mood-display");
  const labels={open:"Open",chill:"Chill",lost:"Lost",bored:"Bored",curious:"Curious",observe:"Observing"};
  if(d){d.textContent=mood?labels[mood]||mood:"No mood set"; d.style.color=mood?orbColor(mood):"";}
  const selfOrb=document.getElementById("map-self-orb");
  if(selfOrb) selfOrb.style.setProperty("--self-color",orbColor(mood));
  showToast(mood?`Vibe set to ${mood}`:"Mood cleared",mood?"success":"info");
}

// ── ANCHOR ────────────────────────────────────────
function initAnchorMode(){
  document.getElementById("btn-anchor").addEventListener("click",()=>state.anchorMode?disableAnchor():enableAnchor());
}
function enableAnchor(){
  state.anchorMode=true;
  document.getElementById("anchor-banner").classList.remove("hidden");
  document.getElementById("btn-anchor").classList.add("active");
  if(state.uid) db.collection("users").doc(state.uid).update({anchorMode:true}).catch(()=>{});
  showToast("Anchor mode active","success");
}
function disableAnchor(){
  state.anchorMode=false;
  document.getElementById("anchor-banner").classList.add("hidden");
  document.getElementById("btn-anchor").classList.remove("active");
  if(state.uid) db.collection("users").doc(state.uid).update({anchorMode:false}).catch(()=>{});
}

// ── CROWD ─────────────────────────────────────────
function checkCrowdMode(users){
  const n=users.filter(u=>u.distance<=CROWD_RADIUS).length;
  const badge=document.getElementById("crowd-count-badge"); if(badge)badge.textContent=`${n+1} here`;
  document.getElementById("btn-crowd")?.classList.toggle("active",n>=CROWD_THRESHOLD);
}

let crowdUnsub=null;
function initCrowdView(){
  document.getElementById("btn-crowd").addEventListener("click",()=>showView("crowd"));
  if(!state.coords)return;
  const n=state.nearbyUsers.filter(u=>u.distance<=CROWD_RADIUS).length+1;
  const status=document.getElementById("crowd-status-text");
  if(n<CROWD_THRESHOLD){if(status)status.textContent=`${n} / ${CROWD_THRESHOLD} needed to unlock Crowd Mode`;return;}
  if(status)status.textContent=`${n} people are here with you`;
  subscribeCrowdMessages();
}

function subscribeCrowdMessages(){
  if(crowdUnsub)crowdUnsub();
  if(!state.coords)return;
  const roomId=crowdRoomId(state.coords.lat,state.coords.lng);
  const el=document.getElementById("crowd-messages"); if(!el)return;
  el.innerHTML="";
  crowdUnsub=db.collection("crowdRooms").doc(roomId).collection("messages")
    .orderBy("createdAt","asc").limit(80)
    .onSnapshot(snap=>{
      const msgs=[]; snap.forEach(d=>msgs.push({id:d.id,...d.data()}));
      renderCrowdMessages(msgs);
    });
  state.unsubscribers.push(()=>{if(crowdUnsub)crowdUnsub();});
}

function crowdRoomId(lat,lng){
  const la=(Math.floor(lat*50)/50).toFixed(2).replace(".","_").replace("-","n");
  const lo=(Math.floor(lng*50)/50).toFixed(2).replace(".","_").replace("-","n");
  return`${la}__${lo}`;
}

function renderCrowdMessages(msgs){
  const el=document.getElementById("crowd-messages"); if(!el)return;
  if(!msgs.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><p>Crowd channel is quiet</p><span>Be the first to say something</span></div>`;return;}
  el.innerHTML="";
  msgs.forEach(msg=>{
    const mine=msg.uid===state.uid; const color=orbColor(msg.mood);
    const div=document.createElement("div"); div.className=`crowd-msg${mine?" mine":""}`;
    div.innerHTML=`<div class="crowd-msg-orb" style="background:${color}">${nameInitial(msg.displayName)}</div>
      <div class="crowd-msg-body">${!mine?`<div class="crowd-msg-name">${msg.displayName}</div>`:""}
      <div class="crowd-msg-text">${escapeHtml(msg.text)}</div></div>`;
    el.appendChild(div);
  });
  el.scrollTop=el.scrollHeight;
}

function initCrowdInput(){
  const send=async()=>{
    const inp=document.getElementById("crowd-input"); const text=inp.value.trim();
    if(!text||!state.coords||!state.uid)return;
    const roomId=crowdRoomId(state.coords.lat,state.coords.lng);
    inp.value="";
    await db.collection("crowdRooms").doc(roomId).collection("messages").add({
      uid:state.uid,displayName:state.user?.displayName||"Anonymous",mood:state.user?.mood||null,text,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("crowdRooms").doc(roomId).set({lastActivity:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
  };
  document.getElementById("btn-crowd-send")?.addEventListener("click",send);
  document.getElementById("crowd-input")?.addEventListener("keydown",e=>{if(e.key==="Enter")send();});
}

// ── PROFILE CARD ──────────────────────────────────
function openProfileCard(user){
  state.currentProfileCard=user;
  const color=orbColor(user.mood);
  const moodLabels={open:"Open",chill:"Chill",lost:"Lost",bored:"Bored",curious:"Curious",observe:"Observing"};
  document.getElementById("pc-orb").style.background=color;
  document.getElementById("pc-orb").textContent=nameInitial(user.displayName);
  document.getElementById("pc-name").textContent=user.displayName;
  document.getElementById("pc-bio").textContent=user.bio||"No bio yet";
  document.getElementById("pc-distance").textContent=`${user.distance}m away`;
  document.getElementById("pc-time-in-zone").textContent="in zone";
  document.getElementById("pc-mood-label").textContent=user.mood?moodLabels[user.mood]:"No mood";
  document.getElementById("btn-pc-message").onclick=()=>{closeProfileCard();openThread(user);};
  const modal=document.getElementById("modal-profile-card");
  modal.classList.remove("hidden"); modal.classList.add("open");
}
function closeProfileCard(){
  const modal=document.getElementById("modal-profile-card");
  modal.classList.add("hidden"); modal.classList.remove("open");
  state.currentProfileCard=null;
}

// ── MESSAGING ─────────────────────────────────────
function subscribeToThreads(){
  if(!state.uid)return;
  const unsub=db.collection("threads").where("participants","array-contains",state.uid)
    .orderBy("updatedAt","desc").limit(40)
    .onSnapshot(snap=>{
      const threads=[],ghosts=[];
      snap.forEach(doc=>{const t={id:doc.id,...doc.data()}; t.isGhost?ghosts.push(t):threads.push(t);});
      state.threads=threads; state.ghosts=ghosts;
      updateInboxBadge();
      if(state.currentView==="inbox")renderInbox();
    },()=>{});
  state.unsubscribers.push(unsub);
}

function updateInboxBadge(){
  const unread=state.threads.reduce((acc,t)=>acc+((t.unreadCounts?.[state.uid]||0)>0?1:0),0);
  const badge=document.getElementById("inbox-badge"); if(!badge)return;
  unread>0?(badge.textContent=unread,badge.classList.remove("hidden")):badge.classList.add("hidden");
}

async function openThread(user){
  const ids=[state.uid,user.uid].sort(); const threadId=ids.join("__");
  const ref=db.collection("threads").doc(threadId);
  const snap=await ref.get();
  if(!snap.exists){
    await ref.set({
      id:threadId, participants:ids,
      participantData:{
        [state.uid]:{displayName:state.user?.displayName,mood:state.user?.mood||null},
        [user.uid]:{displayName:user.displayName,mood:user.mood||null},
      },
      isGhost:false, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage:null, unreadCounts:{[state.uid]:0,[user.uid]:0},
    });
    db.collection("users").doc(state.uid).update({totalConvos:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
  }
  state.currentThread={id:threadId,otherUser:user};
  renderThreadModal(user,threadId);
}

function renderThreadModal(user,threadId){
  const color=orbColor(user.mood);
  document.getElementById("thread-orb").style.background=color;
  document.getElementById("thread-orb").textContent=nameInitial(user.displayName);
  document.getElementById("thread-user-name").textContent=user.displayName;
  const isNearby=state.nearbyUsers.some(u=>u.uid===user.uid);
  const statusEl=document.getElementById("thread-status");
  statusEl.textContent=isNearby?"in zone":"left zone";
  statusEl.className="thread-status"+(isNearby?"":" ghost");
  const ghostNote=document.getElementById("thread-ghost-note");
  ghostNote.classList.toggle("hidden",isNearby);
  const inputBar=document.getElementById("thread-input-bar");
  inputBar.style.opacity=isNearby?"1":"0.5";
  document.getElementById("thread-input").disabled=!isNearby;
  const msgsEl=document.getElementById("thread-messages"); msgsEl.innerHTML="";
  if(!isNearby) msgsEl.appendChild(ghostNote.cloneNode(true));
  const unsub=db.collection("threads").doc(threadId).collection("messages")
    .orderBy("createdAt","asc").limit(100)
    .onSnapshot(snap=>{
      const msgs=[]; snap.forEach(d=>msgs.push({id:d.id,...d.data()}));
      renderMessages(msgs,msgsEl,isNearby);
    });
  db.collection("threads").doc(threadId).update({[`unreadCounts.${state.uid}`]:0}).catch(()=>{});
  const modal=document.getElementById("modal-thread");
  modal.classList.remove("hidden"); modal.classList.add("open");
  modal._msgUnsub=unsub;
}

function renderMessages(msgs,container,isInZone){
  const atBottom=container.scrollHeight-container.scrollTop-container.clientHeight<60;
  const note=container.querySelector(".thread-ghost-note"); container.innerHTML="";
  if(note)container.appendChild(note);
  msgs.forEach(msg=>{
    const mine=msg.senderUid===state.uid;
    const div=document.createElement("div");
    div.className=`msg-bubble ${mine?"mine":"theirs"}${!isInZone?" ghost-msg":""}`;
    div.innerHTML=`<div class="msg-text">${escapeHtml(msg.text)}</div>
      <span class="msg-time">${formatRelativeTime(msg.createdAt)}</span>`;
    container.appendChild(div);
  });
  if(atBottom)container.scrollTop=container.scrollHeight;
}

function initThreadInput(){
  const send=async()=>{
    const inp=document.getElementById("thread-input"); const text=inp.value.trim();
    if(!text||!state.currentThread||!state.uid)return;
    const{id:threadId,otherUser}=state.currentThread;
    const isNearby=state.nearbyUsers.some(u=>u.uid===otherUser.uid);
    if(!isNearby){showToast("They've left your zone","ghost");return;}
    inp.value="";
    await db.collection("threads").doc(threadId).collection("messages").add({
      senderUid:state.uid,senderName:state.user?.displayName||"Anonymous",text,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("threads").doc(threadId).update({
      lastMessage:text, updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      [`unreadCounts.${otherUser.uid}`]:firebase.firestore.FieldValue.increment(1),
    });
  };
  document.getElementById("btn-thread-send")?.addEventListener("click",send);
  document.getElementById("thread-input")?.addEventListener("keydown",e=>{if(e.key==="Enter")send();});
}

function closeThread(){
  const modal=document.getElementById("modal-thread");
  if(modal._msgUnsub){modal._msgUnsub();modal._msgUnsub=null;}
  modal.classList.add("hidden"); modal.classList.remove("open");
  state.currentThread=null;
}

function checkGhostReactivation(){
  state.ghosts.forEach(ghost=>{
    const otherUid=ghost.participants?.find(id=>id!==state.uid);
    if(state.nearbyUsers.some(u=>u.uid===otherUid)){
      db.collection("threads").doc(ghost.id).update({isGhost:false}).catch(()=>{});
      showToast("A ghost returned to your zone","ghost");
    }
  });
}

// ── INBOX ─────────────────────────────────────────
function initInboxTabs(){
  document.querySelectorAll(".inbox-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".inbox-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".inbox-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`inbox-${tab.dataset.itab}`)?.classList.add("active");
    });
  });
}

function renderInbox(){
  renderThreadList(state.threads,"thread-list",false);
  renderThreadList(state.ghosts,"ghost-list",true);
}

function renderThreadList(threads,containerId,isGhost){
  const el=document.getElementById(containerId); if(!el)return;
  if(!threads.length){
    el.innerHTML=isGhost
      ?`<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 10h.01M15 10h.01M12 2a7 7 0 0 1 7 7v8l-2-2-2 2-2-2-2 2-2-2-2 2V9a7 7 0 0 1 7-7z"/></svg></div><p>No ghost messages yet</p><span>Miss a reply and see them here</span></div>`
      :`<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><p>No active threads yet</p><span>Tap an orb on the map to start talking</span></div>`;
    return;
  }
  el.innerHTML="";
  threads.forEach(thread=>{
    const otherUid=thread.participants?.find(id=>id!==state.uid);
    const od=thread.participantData?.[otherUid]||{};
    const color=orbColor(od.mood); const unread=thread.unreadCounts?.[state.uid]||0;
    const item=document.createElement("div"); item.className="thread-item";
    item.innerHTML=`<div class="thread-orb-sm${isGhost?" ghost-orb":""}" style="background:${color};color:${color}">${nameInitial(od.displayName||"?")}</div>
      <div class="thread-body"><div class="thread-name">${od.displayName||"Anonymous"}</div>
      <div class="thread-preview${isGhost?" ghost-text":""}">${isGhost?"Left the zone before you replied":escapeHtml(thread.lastMessage||"Start the conversation")}</div></div>
      <div class="thread-meta"><span class="thread-time">${formatRelativeTime(thread.updatedAt)}</span>
      ${unread>0&&!isGhost?`<span class="thread-unread">${unread}</span>`:""}
      ${isGhost?`<span class="thread-ghost-badge">Ghost</span>`:""}</div>`;
    item.addEventListener("click",()=>{
      const nearby=state.nearbyUsers.find(u=>u.uid===otherUid)||{uid:otherUid,...od,distance:0};
      openThread(nearby);
    });
    el.appendChild(item);
  });
}

// ══════════════════════════════════════════════════
//  POSTS — SWIPE CARDS
// ══════════════════════════════════════════════════
let postsUnsub=null;

function initPostsPage(){
  document.getElementById("btn-create-post")?.addEventListener("click",openCreatePost);
  document.getElementById("btn-post-like")?.addEventListener("click",()=>swipePost("like"));
  document.getElementById("btn-post-skip")?.addEventListener("click",()=>swipePost("skip"));
  document.getElementById("btn-post-msg")?.addEventListener("click",()=>{
    const post=state.postQueue[state.currentPostIndex];
    if(!post)return;
    const user={uid:post.uid,displayName:post.displayName,mood:post.mood,distance:post.distance||0};
    openThread(user);
  });
  initCreatePostModal();
}

function renderPostsPage(){
  loadPosts();
}

function loadPosts(){
  if(postsUnsub)postsUnsub();
  if(!state.coords){setTimeout(loadPosts,2000);return;}

  const cutoff=new Date(Date.now()-24*3600*1000);
  postsUnsub=db.collection("posts").where("createdAt",">",cutoff)
    .orderBy("createdAt","desc").limit(60)
    .onSnapshot(snap=>{
      const posts=[];
      const seenKey=`drift_seen_${state.uid}`;
      const seen=JSON.parse(localStorage.getItem(seenKey)||"[]");
      snap.forEach(doc=>{
        const p={id:doc.id,...doc.data()};
        if(p.uid===state.uid)return;
        if(seen.includes(p.id))return;
        if(!p.location)return;
        const dist=haversineDistance(state.coords.lat,state.coords.lng,p.location.latitude,p.location.longitude);
        if(dist<=state.zoneRadius*3) posts.push({...p,distance:Math.round(dist)});
      });
      posts.sort((a,b)=>a.distance-b.distance);
      state.postQueue=posts;
      state.currentPostIndex=0;
      renderCurrentPost();
    },()=>{});
  state.unsubscribers.push(()=>{if(postsUnsub)postsUnsub();});
}

function renderCurrentPost(){
  const stack=document.getElementById("posts-stack"); if(!stack)return;
  stack.querySelectorAll(".post-tiktok").forEach(c=>c.remove());

  const emptyEl=document.getElementById("posts-empty");
  const actionsEl=document.getElementById("posts-actions");
  const remaining=state.postQueue.slice(state.currentPostIndex);

  if(!remaining.length){
    emptyEl?.classList.remove("hidden");
    if(actionsEl)actionsEl.style.visibility="hidden";
    return;
  }
  emptyEl?.classList.add("hidden");
  if(actionsEl)actionsEl.style.visibility="visible";

  // Only render the top card (full-screen, TikTok style)
  const post=remaining[0];
  const card=buildPostCard(post);
  card.style.zIndex="10";
  attachSwipeListeners(card,post);
  stack.insertBefore(card,stack.querySelector(".swipe-label"));
}

function buildPostCard(post){
  const color=orbColor(post.mood);
  const moodGradients={
    open:   {hi:"rgba(249,115,22,0.55)",  lo:"rgba(239,68,68,0.25)"},
    chill:  {hi:"rgba(6,182,212,0.55)",   lo:"rgba(59,130,246,0.25)"},
    lost:   {hi:"rgba(168,85,247,0.55)",  lo:"rgba(139,92,246,0.25)"},
    bored:  {hi:"rgba(234,179,8,0.55)",   lo:"rgba(249,115,22,0.2)"},
    curious:{hi:"rgba(34,197,94,0.55)",   lo:"rgba(6,182,212,0.2)"},
    observe:{hi:"rgba(100,116,139,0.4)",  lo:"rgba(71,85,105,0.2)"},
  };
  const grad=moodGradients[post.mood]||{hi:"rgba(139,92,246,0.5)",lo:"rgba(6,182,212,0.2)"};

  const card=document.createElement("div");
  card.className="post-tiktok";
  card.dataset.postId=post.id;

  // Background
  let bgHTML="";
  if(post.mediaURL&&post.mediaType==="video"){
    bgHTML=`<div class="ptk-bg"><video class="ptk-bg-video" src="${post.mediaURL}" playsinline loop muted autoplay></video></div>`;
  }else if(post.mediaURL){
    bgHTML=`<div class="ptk-bg"><img class="ptk-bg-img" src="${post.mediaURL}" alt="" loading="lazy" /></div>`;
  }else{
    bgHTML=`<div class="ptk-bg"><div class="ptk-bg-gradient" style="--gc-hi:${grad.hi};--gc-lo:${grad.lo}"></div></div>`;
  }

  // Like count
  const likes=post.likes||0;
  const photoHTML=post.photoURL?`<img src="${post.photoURL}" alt="" />`:"";

  card.innerHTML=`
    ${bgHTML}
    <div class="ptk-scrim-top"></div>
    <div class="ptk-scrim"></div>
    <div class="ptk-content">
      <div class="ptk-left">
        <div class="ptk-user-row">
          <div class="ptk-avatar" style="background:${color};color:#fff">${photoHTML}${!post.photoURL?nameInitial(post.displayName):""}</div>
          <div class="ptk-user-info">
            <div class="ptk-username">${post.displayName}</div>
            <div class="ptk-meta">${post.distance}m away · ${formatRelativeTime(post.createdAt)}</div>
          </div>
          <button class="ptk-wave-btn" data-uid="${post.uid}">+ wave</button>
        </div>
        ${post.text?`<p class="ptk-caption">${escapeHtml(post.text)}</p>`:""}
        <div class="ptk-zone-chip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.1 2 5 5.1 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.9-3.1-7-7-7z"/></svg>
          within 500m
        </div>
      </div>
      <div class="ptk-rail">
        <div class="ptk-action like-action" id="ptk-like-${post.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span>${likes}</span>
        </div>
        <div class="ptk-action msg-action" data-uid="${post.uid}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>DM</span>
        </div>
        <div class="ptk-action skip-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span>skip</span>
        </div>
      </div>
    </div>`;

  // Rail action listeners
  card.querySelector(".like-action").addEventListener("click",e=>{
    e.stopPropagation();
    swipePost("like");
  });
  card.querySelector(".msg-action").addEventListener("click",e=>{
    e.stopPropagation();
    const user={uid:post.uid,displayName:post.displayName,mood:post.mood,distance:post.distance||0};
    openThread(user);
  });
  card.querySelector(".skip-action").addEventListener("click",e=>{
    e.stopPropagation();
    swipePost("skip");
  });
  card.querySelector(".ptk-wave-btn")?.addEventListener("click",e=>{
    e.stopPropagation();
    const user={uid:post.uid,displayName:post.displayName,mood:post.mood,distance:post.distance||0};
    openThread(user);
  });

  return card;
}

function attachSwipeListeners(card,post){
  let startX=0,startY=0,currentX=0,dragging=false;

  const onStart=(x,y)=>{startX=x;startY=y;currentX=x;dragging=true;card.style.transition="none";};
  const onMove=(x)=>{
    if(!dragging)return;
    currentX=x; const dx=x-startX;
    card.style.transform=`translateX(${dx}px) rotate(${dx*0.04}deg)`;
    const likeLabel=document.getElementById("swipe-like-label");
    const skipLabel=document.getElementById("swipe-skip-label");
    if(likeLabel)likeLabel.style.opacity=Math.min(dx/80,1).toString();
    if(skipLabel)skipLabel.style.opacity=Math.min(-dx/80,1).toString();
  };
  const onEnd=()=>{
    if(!dragging)return; dragging=false;
    const dx=currentX-startX;
    const likeLabel=document.getElementById("swipe-like-label");
    const skipLabel=document.getElementById("swipe-skip-label");
    if(likeLabel)likeLabel.style.opacity="0";
    if(skipLabel)skipLabel.style.opacity="0";
    if(dx>80)      swipePost("like",card);
    else if(dx<-80)swipePost("skip",card);
    else{card.style.transition="transform 0.35s cubic-bezier(0.34,1.56,0.64,1)";card.style.transform="";}
  };

  // Touch
  card.addEventListener("touchstart",e=>{onStart(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  card.addEventListener("touchmove",e=>{onMove(e.touches[0].clientX);},{passive:true});
  card.addEventListener("touchend",onEnd);

  // Mouse
  card.addEventListener("mousedown",e=>{onStart(e.clientX,e.clientY);});
  window.addEventListener("mousemove",e=>{if(dragging)onMove(e.clientX);});
  window.addEventListener("mouseup",onEnd);
}

function swipePost(direction,cardEl){
  const post=state.postQueue[state.currentPostIndex]; if(!post)return;
  const card=cardEl||document.querySelector(".post-tiktok");
  if(!card)return;

  // Animate card off screen
  card.style.transition="transform 0.4s cubic-bezier(0.4,0,1,1), opacity 0.3s";
  card.style.transform=direction==="like"
    ?"translateX(110vw) rotate(20deg)":"translateX(-110vw) rotate(-20deg)";
  card.style.opacity="0";

  // Record in Firestore
  if(state.uid&&post.id){
    const update=direction==="like"
      ?{likes:firebase.firestore.FieldValue.increment(1)}
      :{skips:firebase.firestore.FieldValue.increment(1)};
    db.collection("posts").doc(post.id).update(update).catch(()=>{});
  }

  // Mark as seen
  const seenKey=`drift_seen_${state.uid}`;
  const seen=JSON.parse(localStorage.getItem(seenKey)||"[]");
  seen.push(post.id); if(seen.length>500)seen.splice(0,seen.length-400);
  localStorage.setItem(seenKey,JSON.stringify(seen));

  // Advance queue
  state.currentPostIndex++;
  setTimeout(()=>{card.remove();renderCurrentPost();},380);

  if(direction==="like")showToast("Liked","success");
}

// ── CREATE POST ───────────────────────────────────
// Holds pending media before submitting
let pendingMedia = null; // { url, type: 'image'|'video' }

function initCreatePostModal(){
  const textarea=document.getElementById("cp-text");
  const counter=document.getElementById("cp-char-count");
  if(textarea){
    textarea.addEventListener("input",()=>{
      const left=300-textarea.value.length;
      if(counter)counter.textContent=left;
      if(counter)counter.style.color=left<30?"#ef4444":"";
    });
  }

  // Media upload buttons — use Cloudinary upload widget
  document.getElementById("btn-add-image")?.addEventListener("click",()=>openMediaUpload("image"));
  document.getElementById("btn-add-video")?.addEventListener("click",()=>openMediaUpload("video"));
  document.getElementById("cp-remove-media")?.addEventListener("click",clearPendingMedia);

  document.getElementById("btn-submit-post")?.addEventListener("click",async()=>{
    const text=textarea?.value.trim();
    if(!text&&!pendingMedia){showToast("Add some text or media first","error");return;}
    if(!state.coords){showToast("Location required","error");return;}
    const btn=document.getElementById("btn-submit-post");
    btn.disabled=true; btn.textContent="Posting...";
    try{
      await db.collection("posts").add({
        uid:state.uid,
        displayName:state.user?.displayName||"Anonymous",
        mood:state.user?.mood||null,
        text:text||"",
        mediaURL:pendingMedia?.url||null,
        mediaType:pendingMedia?.type||null,
        location:new firebase.firestore.GeoPoint(state.coords.lat,state.coords.lng),
        likes:0, skips:0,
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      });
      closeCreatePost();
      showToast("Post shared with your zone","success");
    }catch(e){showToast("Failed to post. Try again.","error");}
    btn.disabled=false; btn.textContent="Post";
  });
}

function openMediaUpload(resourceType){
  if(!window.cloudinary){showToast("Upload widget not loaded","error");return;}
  window.cloudinary.openUploadWidget({
    cloudName:CLOUDINARY_CLOUD_NAME,
    uploadPreset:CLOUDINARY_UPLOAD_PRESET,
    sources:["local","camera"],
    resourceType,
    multiple:false,
    maxFileSize:resourceType==="video"?100000000:10000000,
    clientAllowedFormats:resourceType==="video"
      ?["mp4","mov","webm","avi"]
      :["jpg","jpeg","png","gif","webp","heic"],
    styles:{palette:{window:"#0f0f1a",windowBorder:"#2a2a3a",tabIcon:"#7c3aed",
      menuIcons:"#94949e",textDark:"#ffffff",link:"#7c3aed",action:"#7c3aed",
      inProgress:"#7c3aed",complete:"#22c55e",error:"#ef4444"}},
  },(err,result)=>{
    if(err)return;
    if(result.event==="success"){
      pendingMedia={url:result.info.secure_url,type:resourceType};
      showMediaPreview(result.info.secure_url,resourceType);
    }
  });
}

function showMediaPreview(url,type){
  const preview=document.getElementById("cp-media-preview");
  const img=document.getElementById("cp-preview-img");
  const vid=document.getElementById("cp-preview-vid");
  if(!preview)return;
  preview.classList.remove("hidden");
  if(type==="image"){
    img.src=url; img.style.display="block";
    vid.style.display="none"; vid.src="";
  }else{
    vid.src=url; vid.style.display="block";
    img.style.display="none"; img.src="";
  }
}

function clearPendingMedia(){
  pendingMedia=null;
  const preview=document.getElementById("cp-media-preview");
  if(preview)preview.classList.add("hidden");
  const img=document.getElementById("cp-preview-img");
  const vid=document.getElementById("cp-preview-vid");
  if(img){img.src="";img.style.display="none";}
  if(vid){vid.src="";vid.style.display="none";}
}

function openCreatePost(){
  const avatar=document.getElementById("cp-avatar");
  if(avatar){
    avatar.style.background=orbColor(state.user?.mood);
    avatar.textContent=nameInitial(state.user?.displayName||"?");
  }
  const zoneEl=document.getElementById("cp-zone-radius");
  if(zoneEl)zoneEl.textContent=state.zoneRadius+"m";
  const modal=document.getElementById("modal-create-post");
  modal.classList.remove("hidden"); modal.classList.add("open");
  document.getElementById("cp-text")?.focus();
}

function closeCreatePost(){
  const modal=document.getElementById("modal-create-post");
  modal.classList.add("hidden"); modal.classList.remove("open");
  if(document.getElementById("cp-text")) document.getElementById("cp-text").value="";
  if(document.getElementById("cp-char-count")) document.getElementById("cp-char-count").textContent="300";
  clearPendingMedia();
}

// ══════════════════════════════════════════════════
//  SEED 20 TEST USERS
// ══════════════════════════════════════════════════
async function seedTestUsers(){
  if(!state.coords){showToast("Location needed to seed users","error");return;}
  const btn=document.getElementById("btn-seed-users");
  if(btn){btn.disabled=true;btn.innerHTML=`<span>Seeding...</span>`;}

  const batch=db.batch();
  const moods=["open","chill","lost","bored","curious","observe",null,null];

  for(let i=0;i<20;i++){
    const name=SEED_NAMES[i];
    const bio=SEED_BIOS[i%SEED_BIOS.length];
    const mood=moods[Math.floor(Math.random()*moods.length)];
    const offset=randomOffset(randomBetween(30,state.zoneRadius*0.9));
    const lat=state.coords.lat+offset.lat;
    const lng=state.coords.lng+offset.lng;
    const uid=`seed_user_${name.toLowerCase()}_drift`;

    const ref=db.collection("users").doc(uid);
    batch.set(ref,{
      uid,displayName:name,email:`${name.toLowerCase()}@drift.test`,
      photoURL:null,bio,mood,anchorMode:false,
      isVisible:true,isOnline:true,isSeeded:true,showTrail:true,
      driftScore:Math.floor(Math.random()*80),
      totalConvos:Math.floor(Math.random()*20),
      totalGhosts:Math.floor(Math.random()*5),
      location:new firebase.firestore.GeoPoint(lat,lng),
      lastSeen:firebase.firestore.FieldValue.serverTimestamp(),
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    },{merge:true});

    // Also seed a post from each user
    if(i<10){
      const postTexts=["anyone else just vibing out here?","this spot is so underrated","drifted here by accident. staying.",
        "good energy in this area","literally just exploring, what about you?","the city feels different at this hour",
        "first time here, what am I missing?","someone recommend a good coffee spot nearby","I see you drifting","quiet day or just me?"];
      const pRef=db.collection("posts").doc(`seed_post_${uid}`);
      batch.set(pRef,{
        uid,displayName:name,mood,text:postTexts[i%postTexts.length],
        location:new firebase.firestore.GeoPoint(lat,lng),
        likes:Math.floor(Math.random()*30),skips:Math.floor(Math.random()*10),
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      },{merge:true});
    }
  }

  try{
    await batch.commit();
    showToast("20 test users + 10 posts seeded nearby","success");
    loadNearbyUsers();
    if(state.currentView==="posts")loadPosts();
  }catch(e){
    showToast("Seed failed — check Firestore rules","error");
  }

  if(btn){
    btn.disabled=false;
    btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>Seed 20 Test Users Nearby`;
  }
}

// ── PROFILE ───────────────────────────────────────
function initProfile(){
  initInboxTabs();

  document.getElementById("btn-upload-photo")?.addEventListener("click",()=>{
    if(!window.cloudinary){showToast("Upload widget not loaded","error");return;}
    window.cloudinary.openUploadWidget({
      cloudName:CLOUDINARY_CLOUD_NAME,uploadPreset:CLOUDINARY_UPLOAD_PRESET,
      sources:["local","camera"],cropping:true,croppingAspectRatio:1,multiple:false,maxFileSize:5000000,
      styles:{palette:{window:"#0f0f1a",windowBorder:"#2a2a3a",tabIcon:"#7c3aed",
        menuIcons:"#94949e",textDark:"#ffffff",link:"#7c3aed",action:"#7c3aed",
        inProgress:"#7c3aed",complete:"#22c55e",error:"#ef4444"}},
    },(err,result)=>{if(!err&&result.event==="success")updateProfilePhoto(result.info.secure_url);});
  });

  document.getElementById("btn-save-bio")?.addEventListener("click",async()=>{
    const bio=document.getElementById("profile-bio-input")?.value.trim()||"";
    if(!state.uid)return;
    await db.collection("users").doc(state.uid).update({bio});
    if(state.user)state.user.bio=bio;
    showToast("Bio saved","success");
  });

  document.getElementById("btn-seed-users")?.addEventListener("click",seedTestUsers);

  document.getElementById("btn-logout")?.addEventListener("click",async()=>{
    if(!confirm("Sign out of Drift?"))return;
    if(state.uid) db.collection("users").doc(state.uid).update({isOnline:false}).catch(()=>{});
    cleanupApp(); await auth.signOut();
  });
}

async function updateProfilePhoto(url){
  if(!state.uid)return;
  await db.collection("users").doc(state.uid).update({photoURL:url});
  await state.authUser?.updateProfile({photoURL:url});
  if(state.user)state.user.photoURL=url;
  const img=document.getElementById("profile-avatar-img");
  const init=document.getElementById("profile-avatar-initial");
  if(img){img.src=url;img.style.display="block";}
  if(init)init.style.display="none";
  showToast("Photo updated","success");
}

function renderProfile(){
  const name=state.user?.displayName||state.authUser?.displayName||"Anonymous";
  const email=state.user?.email||state.authUser?.email||"";
  const photo=state.user?.photoURL||state.authUser?.photoURL||"";
  const bio=state.user?.bio||"";
  document.getElementById("profile-name-display").textContent=name;
  document.getElementById("profile-email-display").textContent=email;
  document.getElementById("profile-avatar-initial").textContent=nameInitial(name);
  document.getElementById("profile-bio-input").value=bio;
  const moodDisplay=document.getElementById("profile-mood-display");
  const moodLabels={open:"Open",chill:"Chill",lost:"Lost",bored:"Bored",curious:"Curious",observe:"Observing"};
  const mood=state.user?.mood;
  if(moodDisplay){moodDisplay.textContent=mood?moodLabels[mood]:"No mood set";moodDisplay.style.color=mood?orbColor(mood):"";}
  if(photo){
    const img=document.getElementById("profile-avatar-img");
    const init=document.getElementById("profile-avatar-initial");
    if(img){img.src=photo;img.style.display="block";}
    if(init)init.style.display="none";
  }
  if(state.uid){
    db.collection("users").doc(state.uid).get().then(snap=>{
      if(!snap.exists)return; const d=snap.data();
      document.getElementById("stat-zones").textContent=d.driftScore||0;
      document.getElementById("stat-convos").textContent=d.totalConvos||0;
      document.getElementById("stat-ghosts").textContent=d.totalGhosts||0;
    });
  }
}

// ── SETTINGS ──────────────────────────────────────
function initSettings(){
  // Theme toggle — persisted in localStorage
  const themeToggle=document.getElementById("setting-light-theme");
  if(themeToggle){
    const saved=localStorage.getItem("drift_light_theme")==="1";
    themeToggle.checked=saved;
    if(saved) document.body.classList.add("light-theme");
    themeToggle.addEventListener("change",function(){
      document.body.classList.toggle("light-theme",this.checked);
      localStorage.setItem("drift_light_theme",this.checked?"1":"0");
      showToast(this.checked?"Light theme on ☀️":"Dark theme on 🌙","info");
    });
  }
  document.getElementById("setting-visible")?.addEventListener("change",function(){
    if(!state.uid)return;
    db.collection("users").doc(state.uid).update({isVisible:this.checked}).catch(()=>{});
    showToast(this.checked?"Visible on map":"Hidden from map","info");
  });
  document.getElementById("setting-trail")?.addEventListener("change",function(){
    if(!state.uid)return; db.collection("users").doc(state.uid).update({showTrail:this.checked}).catch(()=>{});
  });
  document.getElementById("setting-radius")?.addEventListener("change",function(){
    state.zoneRadius=parseInt(this.value);
    document.getElementById("radius-label").textContent=`${this.value} meters`;
    loadNearbyUsers(); updateZoneRingSize(); syncOrbElements(true);
  });
  document.getElementById("btn-change-pw")?.addEventListener("click",async()=>{
    if(!state.authUser?.email)return;
    await auth.sendPasswordResetEmail(state.authUser.email);
    showToast("Reset email sent to "+state.authUser.email,"success");
  });
  document.getElementById("btn-delete-account")?.addEventListener("click",async()=>{
    if(!confirm("Permanently delete your account? This cannot be undone."))return;
    try{await db.collection("users").doc(state.uid).delete();await state.authUser.delete();}
    catch(e){showToast(e.code==="auth/requires-recent-login"?"Please re-login first, then try again.":"Error deleting account","error");}
  });
}

// ── BOOT ──────────────────────────────────────────
// Apply saved theme before first paint
if(localStorage.getItem("drift_light_theme")==="1") document.body.classList.add("light-theme");

window.addEventListener("load",()=>{
  setTimeout(()=>{showScreen("auth-screen");initAuth();initAuthCanvas();},2400);
});
window.addEventListener("beforeunload",()=>{
  if(state.uid) db.collection("users").doc(state.uid).update({isOnline:false}).catch(()=>{});
});

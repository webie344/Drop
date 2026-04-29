// notifications.js - With Visual Popups (No console needed)

// Your VAPID key
const VAPID_KEY = "BLQsknL2NRqCD5ZT5LwOSIloH9hnuAXk-0_I3N-AU3CV37CO871Uo508Own-XFzmrt-kQICZZ9mERyCP3C5nKTQ";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

// Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Initialize
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;

// ============================================
// VISUAL POPUP FUNCTION (Shows messages on screen)
// ============================================
function showPopup(message, type = "info", duration = 5000) {
    const popup = document.createElement("div");
    
    // Colors based on type
    const colors = {
        info: { border: "#4a90e2", bg: "#e3f2fd", icon: "ℹ️" },
        success: { border: "#28a745", bg: "#d4edda", icon: "✅" },
        error: { border: "#dc3545", bg: "#f8d7da", icon: "❌" },
        warning: { border: "#ffc107", bg: "#fff3cd", icon: "⚠️" }
    };
    
    const color = colors[type] || colors.info;
    
    popup.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${color.bg};
        border-left: 5px solid ${color.border};
        padding: 15px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 100000;
        max-width: 90%;
        width: 350px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        text-align: center;
        animation: slideUp 0.3s ease;
        cursor: pointer;
    `;
    
    popup.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">${color.icon}</span>
            <div style="flex: 1; text-align: left;">
                <strong style="display: block; margin-bottom: 5px; color: #333;">${type.toUpperCase()}</strong>
                <span style="color: #555;">${message}</span>
            </div>
            <button style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">&times;</button>
        </div>
    `;
    
    // Add animation style if not exists
    if (!document.querySelector("#popup-animation")) {
        const style = document.createElement("style");
        style.id = "popup-animation";
        style.textContent = `
            @keyframes slideUp {
                from {
                    transform: translateX(-50%) translateY(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(-50%) translateY(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(popup);
    
    // Close button
    const closeBtn = popup.querySelector("button");
    closeBtn.onclick = () => popup.remove();
    
    // Auto remove
    setTimeout(() => {
        if (popup.parentNode) popup.remove();
    }, duration);
    
    // Click anywhere to close
    popup.onclick = (e) => {
        if (e.target !== closeBtn) popup.remove();
    };
    
    return popup;
}

// ============================================
// MAIN NOTIFICATION FUNCTION
// ============================================
async function initPushNotifications() {
    showPopup("🚀 Starting push notifications setup...", "info", 3000);
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            showPopup(`✅ Logged in as: ${user.email}`, "success", 3000);
            await setupPushNotifications();
        } else {
            showPopup("⏳ Waiting for you to log in...", "info");
        }
    });
}

async function setupPushNotifications() {
    // 1. Check browser support
    if (!("Notification" in window)) {
        showPopup("❌ Your browser doesn't support notifications", "error");
        return;
    }
    
    if (!("serviceWorker" in navigator)) {
        showPopup("❌ Your browser doesn't support service workers", "error");
        return;
    }
    
    showPopup("✅ Browser supports notifications!", "success", 2000);
    
    // 2. Request permission
    if (Notification.permission !== "granted") {
        showPopup("🔔 Please allow notifications when prompted", "info", 3000);
        
        const permission = await Notification.requestPermission();
        
        if (permission !== "granted") {
            showPopup("❌ Notification permission denied. You won't receive alerts.", "error", 5000);
            return;
        }
    }
    
    showPopup("✅ Notification permission granted!", "success", 2000);
    
    // 3. Register service worker
    showPopup("📡 Registering service worker...", "info", 2000);
    
    let registration;
    try {
        registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        showPopup("✅ Service worker registered successfully!", "success", 2000);
    } catch (error) {
        showPopup(`❌ Service worker error: ${error.message}`, "error", 5000);
        showPopup("📝 Make sure 'firebase-messaging-sw.js' is in your website root folder", "warning", 8000);
        return;
    }
    
    // 4. Get FCM token
    showPopup("🔑 Getting notification token...", "info", 2000);
    
    try {
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
        });
        
        if (token) {
            showPopup("✅ Notification token obtained successfully!", "success", 2000);
            await saveToken(token);
        } else {
            showPopup("⚠️ Could not get notification token", "warning", 3000);
        }
    } catch (error) {
        showPopup(`❌ Token error: ${error.message}`, "error", 4000);
    }
    
    // 5. Listen for messages
    onMessage(messaging, (payload) => {
        const title = payload.notification?.title || "New Message";
        const body = payload.notification?.body || "";
        showPopup(`📨 ${title}: ${body}`, "info", 4000);
        showNotification(payload);
    });
    
    // 6. Listen for new messages in Firestore
    listenForNewMessages();
    
    // 7. Final success message
    setTimeout(() => {
        showPopup("🎉 NOTIFICATIONS READY! 🎉\nYou'll now receive alerts for new messages!", "success", 6000);
        
        // Show test notification
        if (Notification.permission === "granted") {
            new Notification("✅ Notifications Working!", {
                body: "You will now receive alerts when you get new messages"
            });
        }
    }, 2000);
}

async function saveToken(token) {
    if (!currentUser) return;
    
    try {
        const tokenRef = doc(db, "fcm_tokens", currentUser.uid);
        await setDoc(tokenRef, {
            userId: currentUser.uid,
            token: token,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        showPopup("💾 Token saved to database!", "success", 2000);
    } catch (error) {
        showPopup(`⚠️ Could not save token: ${error.message}`, "warning", 3000);
    }
}

function showNotification(payload) {
    const title = payload.notification?.title || "New Message";
    const body = payload.notification?.body || "";
    
    // Show in-app popup
    showPopup(`📨 ${title}\n${body}`, "info", 5000);
    
    // Also show browser notification
    if (Notification.permission === "granted") {
        new Notification(title, { body: body });
    }
}

async function listenForNewMessages() {
    if (!currentUser) return;
    
    showPopup("👂 Listening for new messages...", "info", 3000);
    
    const q = query(
        collection(db, "conversations"),
        where("participants", "array-contains", currentUser.uid)
    );
    
    onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            if (change.type === "modified") {
                const thread = change.doc.data();
                const partnerId = thread.participants.find(id => id !== currentUser.uid);
                
                if (partnerId) {
                    const messagesRef = collection(db, "conversations", change.doc.id, "messages");
                    const unreadQuery = query(
                        messagesRef,
                        where("senderId", "==", partnerId),
                        where("read", "==", false)
                    );
                    
                    const unreadMessages = await getDocs(unreadQuery);
                    
                    for (const msgDoc of unreadMessages.docs) {
                        const message = msgDoc.data();
                        
                        // Get sender name
                        const userQuery = query(collection(db, "users"), where("__name__", "==", partnerId));
                        const userDocs = await getDocs(userQuery);
                        let senderName = "Someone";
                        userDocs.forEach(doc => {
                            senderName = doc.data().name || "Someone";
                        });
                        
                        let messageText = message.text || "";
                        if (message.imageUrl) messageText = "📷 Sent a photo";
                        if (message.audioUrl) messageText = "🎤 Sent a voice message";
                        if (message.videoUrl) messageText = "🎥 Sent a video";
                        
                        // Show popup
                        showPopup(`💬 NEW MESSAGE from ${senderName}\n${messageText}`, "info", 8000);
                        
                        // Show browser notification
                        if (Notification.permission === "granted") {
                            new Notification(`💬 ${senderName}`, {
                                body: messageText,
                                icon: "/favicon.ico"
                            });
                        }
                    }
                }
            }
        }
    });
}

// ============================================
// START EVERYTHING
// ============================================
showPopup("📱 Push Notification Setup Starting...", "info", 3000);
initPushNotifications();

// Export for use
window.pushNotifications = { initPushNotifications };
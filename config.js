// ============================================================
//  ORBIT — Configuration
//  Fill in your Firebase project credentials and Cloudinary.
//  In Cloudinary: create an unsigned upload preset and paste
//  the preset name below.
// ============================================================

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

// How often (ms) to push location to Firestore
export const LOCATION_UPDATE_INTERVAL = 10000;

// Nearby discovery radius in km
export const EXPLORE_RADIUS_KM = 500;

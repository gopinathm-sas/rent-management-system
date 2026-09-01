import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, initializeAuth, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Capacitor } from '@capacitor/core';

// Use same-origin auth domain for web.app and firebaseapp.com to eliminate cross-site cookie blocking
const getAuthDomain = () => {
    if (typeof window !== 'undefined' && window.location.hostname) {
        const host = window.location.hostname;
        if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
            return host;
        }
    }
    return import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "munirathnam-illam.firebaseapp.com";
};

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: getAuthDomain(),
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// Initialize Auth with persistence based on platform
// Native: Use browserLocalPersistence (LocalStorage) to avoid IndexedDB hangs
// Web: Use default (IndexedDB) via getAuth()
export const auth = Capacitor.isNativePlatform()
    ? initializeAuth(app, { persistence: browserLocalPersistence })
    : getAuth(app);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;

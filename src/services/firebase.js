import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCH2Q18CquL9IGi9t6KovkSqQj3DYnXf9g",
    authDomain: "munirathnam-illam.firebaseapp.com",
    projectId: "munirathnam-illam",
    storageBucket: "munirathnam-illam.firebasestorage.app",
    messagingSenderId: "852272424128",
    appId: "1:852272424128:web:e5400d3d2f512d7e477925"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;

/**
 * Script to clear all tenant data from Firestore
 * Run this in browser console after logging in to clear existing data
 * 
 * Instructions:
 * 1. Open the app in browser
 * 2. Log in with your Google account
 * 3. Open DevTools (F12)
 * 4. Go to Console tab
 * 5. Copy and paste the clearAllTenants() function call
 * 6. Run: clearAllTenants()
 */

// To be run in browser console
async function clearAllTenants() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
    const { getFirestore, collection, getDocs, deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    
    const firebaseConfig = {
        apiKey: "AIzaSyCH2Q18CquL9IGi9t6KovkSqQj3DYnXf9g",
        authDomain: "munirathnam-illam.firebaseapp.com",
        projectId: "munirathnam-illam",
        storageBucket: "munirathnam-illam.firebasestorage.app",
        messagingSenderId: "852272424128",
        appId: "1:852272424128:web:e5400d3d2f512d7e477925",
        measurementId: "G-7NF6X62CKV"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    try {
        const snapshot = await getDocs(collection(db, "properties"));
        let count = 0;
        
        for (const docSnap of snapshot.docs) {
            await deleteDoc(doc(db, "properties", docSnap.id));
            count++;
            console.log(`Deleted: ${docSnap.id}`);
        }
        
        console.log(`✓ Successfully deleted ${count} tenant records`);
        console.log("Refresh the page to see changes");
    } catch (error) {
        console.error("Error clearing data:", error);
    }
}

// Run in console: clearAllTenants()

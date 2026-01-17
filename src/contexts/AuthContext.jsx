import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { App } from '@capacitor/app';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Default to LOCKED if native, to force check on launch
    const [isAppLocked, setIsAppLocked] = useState(Capacitor.isNativePlatform());

    // Guard to prevent background listener from locking during Face ID prompt
    const isBiometricAuthPending = useRef(false);

    const lockApp = () => setIsAppLocked(true);

    // New function to handle unlocking
    const unlockWithBiometrics = async () => {
        if (!Capacitor.isNativePlatform()) {
            setIsAppLocked(false);
            return;
        }

        try {
            isBiometricAuthPending.current = true;
            // console.log("Starting Biometric Auth (Pending=true)");

            const result = await NativeBiometric.verifyIdentity({
                reason: "Unlock Rent Manager",
                title: "Authentication Required",
                subtitle: "Confirm your identity",
                description: "Use Face ID to access the app",
            });

            // The plugin returns void (undefined) on success, so we don't check 'result'.
            // If it failed/cancelled, it would have thrown an error.
            // console.log("Biometric Promise Resolved. Unlocking...");
            setIsAppLocked(false);
        } catch (error) {
            console.error("Biometric Unlock Failed:", error);
            // Don't modify lock state on failure
        } finally {
            // Small delay to allow app to fully foreground before re-enabling listener
            setTimeout(() => {
                isBiometricAuthPending.current = false;
                // console.log("Biometric Auth Finished (Pending=false)");
            }, 500);
        }
    };

    async function loginWithGoogle() {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await FirebaseAuthentication.signInWithGoogle();
                const credential = GoogleAuthProvider.credential(result.credential.idToken);
                return await signInWithCredential(auth, credential);
            } catch (error) {
                console.error("Native Google Sign-In Error:", error);
                throw error;
            }
        } else {
            return signInWithPopup(auth, googleProvider);
        }
    }

    function logout() {
        if (Capacitor.isNativePlatform()) {
            return FirebaseAuthentication.signOut().then(() => signOut(auth));
        }
        return signOut(auth);
    }

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);

            if (!user) {
                // If logged out, unlock (login screen handles protection)
                setIsAppLocked(false);
            }
        });

        // App Lifecycle for Locking
        let appListener;
        if (Capacitor.isNativePlatform()) {
            appListener = App.addListener('appStateChange', ({ isActive }) => {
                // console.log(`AppState Change: isActive=${isActive}, PendingBio=${isBiometricAuthPending.current}`);

                if (!isActive && auth.currentUser) {
                    // Check if we are performing biometrics
                    if (isBiometricAuthPending.current) {
                        // console.log("Ignoring background event due to active biometric prompt.");
                        return;
                    }

                    // App went to background -> LOCK IT
                    console.log("App backgrounded. Locking...");
                    setIsAppLocked(true);
                }
            });
        }

        // Safety fallback
        const safetyTimer = setTimeout(() => {
            setLoading((l) => {
                if (l) return false;
                return l;
            });
        }, 5000);

        return () => {
            unsubscribeAuth();
            if (appListener) appListener.remove();
            clearTimeout(safetyTimer);
        };
    }, []);

    const value = {
        currentUser,
        loginWithGoogle,
        logout,
        loading,
        isAppLocked,
        lockApp,
        unlockWithBiometrics // Exposed function
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

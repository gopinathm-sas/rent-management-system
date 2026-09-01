import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import {
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    GoogleAuthProvider,
    signInWithCredential,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    User,
    UserCredential,
    ActionCodeSettings
} from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { App } from '@capacitor/app';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

interface AuthContextType {
    currentUser: User | null;
    loginWithGoogle: () => Promise<UserCredential | void>;
    sendMagicLink: (email: string) => Promise<void>;
    completeMagicLinkSignIn: (email: string, href?: string) => Promise<UserCredential>;
    logout: () => Promise<void>;
    loading: boolean;
    isAppLocked: boolean;
    lockApp: () => void;
    unlockWithBiometrics: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        return context as unknown as AuthContextType;
    }
    return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
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
            await NativeBiometric.verifyIdentity({
                reason: "Unlock Rent Manager",
                title: "Authentication Required",
                subtitle: "Confirm your identity",
                description: "Use Face ID to access the app",
            });
            setIsAppLocked(false);
        } catch (error) {
            console.error("Biometric Unlock Failed:", error);
        } finally {
            setTimeout(() => {
                isBiometricAuthPending.current = false;
            }, 500);
        }
    };

    async function sendMagicLink(email: string): Promise<void> {
        const actionCodeSettings: ActionCodeSettings = {
            url: `${window.location.origin}/login`,
            handleCodeInApp: true,
        };
        await sendSignInLinkToEmail(auth, email.trim(), actionCodeSettings);
        window.localStorage.setItem('emailForSignIn', email.trim());
    }

    async function completeMagicLinkSignIn(email: string, href: string = window.location.href): Promise<UserCredential> {
        const result = await signInWithEmailLink(auth, email.trim(), href);
        window.localStorage.removeItem('emailForSignIn');
        return result;
    }

    async function loginWithGoogle(): Promise<UserCredential | void> {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await FirebaseAuthentication.signInWithGoogle();
                const credential = GoogleAuthProvider.credential(result.credential?.idToken);
                return await signInWithCredential(auth, credential);
            } catch (error) {
                console.error("Native Google Sign-In Error:", error);
                throw error;
            }
        }

        // Strictly full-page redirect on web (No popup)
        return await signInWithRedirect(auth, googleProvider);
    }

    async function logout(): Promise<void> {
        if (Capacitor.isNativePlatform()) {
            await FirebaseAuthentication.signOut();
            await signOut(auth);
        } else {
            await signOut(auth);
            window.location.href = '/login';
        }
    }

    useEffect(() => {
        // Handle redirect result if user returned from Google redirect sign-in
        getRedirectResult(auth)
            .then((result) => {
                if (result?.user) {
                    setCurrentUser(result.user);
                    setLoading(false);
                }
            })
            .catch((err) => {
                console.error("Redirect auth error:", err);
            });

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);

            if (!user) {
                // If logged out, unlock (login screen handles protection)
                setIsAppLocked(false);
            }
        });

        // App Lifecycle for Locking
        let appListener: any;
        if (Capacitor.isNativePlatform()) {
            appListener = App.addListener('appStateChange', ({ isActive }) => {
                if (!isActive && auth.currentUser) {
                    // Check if we are performing biometrics
                    if (isBiometricAuthPending.current) {
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
            if (appListener && appListener.remove) appListener.remove();
            clearTimeout(safetyTimer);
        };
    }, []);

    // 15 minutes in milliseconds
    const AUTO_LOGOUT_TIME = 15 * 60 * 1000;

    useEffect(() => {
        // Only run if user is logged in
        if (!currentUser) return;

        let logoutTimer: NodeJS.Timeout;

        const resetTimer = () => {
            if (logoutTimer) clearTimeout(logoutTimer);
            logoutTimer = setTimeout(() => {
                console.log("User inactive for 15 mins, logging out...");
                logout();
            }, AUTO_LOGOUT_TIME);
        };

        // Comprehensive events to detect user activity across all elements
        const events = ['mousedown', 'mousemove', 'keydown', 'keypress', 'click', 'scroll', 'touchstart', 'touchmove', 'pointerdown'];

        // Initial set
        resetTimer();

        // Add listeners with capture to ensure nested clicks/events are always captured
        events.forEach(event => window.addEventListener(event, resetTimer, { passive: true, capture: true }));

        // Cleanup
        return () => {
            if (logoutTimer) clearTimeout(logoutTimer);
            events.forEach(event => window.removeEventListener(event, resetTimer, { capture: true } as any));
        };
    }, [currentUser]);

    const value: AuthContextType = {
        currentUser,
        loginWithGoogle,
        sendMagicLink,
        completeMagicLinkSignIn,
        logout,
        loading,
        isAppLocked,
        lockApp,
        unlockWithBiometrics
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div className="min-h-screen flex items-center justify-center bg-white flex-col gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
                    <p className="text-slate-500 font-medium">Initializing App...</p>
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
}

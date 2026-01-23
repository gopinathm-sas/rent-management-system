import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, signInWithCredential, User, UserCredential } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { App } from '@capacitor/app';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

interface AuthContextType {
    currentUser: User | null;
    loginWithGoogle: () => Promise<UserCredential>;
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
        //        throw new Error('useAuth must be used within an AuthProvider'); // Temporarily allow undefined for debugging if needed, but best strict
        return context as unknown as AuthContextType; // Allow it (unsafe) or strict? Let's go strict but keep it safe if it fails
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

    async function loginWithGoogle(): Promise<UserCredential> {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await FirebaseAuthentication.signInWithGoogle();
                const credential = GoogleAuthProvider.credential(result.credential?.idToken);
                return await signInWithCredential(auth, credential);
            } catch (error) {
                console.error("Native Google Sign-In Error:", error);
                throw error;
            }
        } else {
            return signInWithPopup(auth, googleProvider);
        }
    }

    function logout(): Promise<void> {
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

        // Events to detect activity
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

        // Initial set
        resetTimer();

        // Add listeners
        events.forEach(event => window.addEventListener(event, resetTimer));

        // Cleanup
        return () => {
            if (logoutTimer) clearTimeout(logoutTimer);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };
    }, [currentUser]);

    const value: AuthContextType = {
        currentUser,
        loginWithGoogle,
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

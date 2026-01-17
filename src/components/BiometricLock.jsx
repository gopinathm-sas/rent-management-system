import React, { useEffect, useState } from 'react';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';

export default function BiometricLock() {
    const { unlockWithBiometrics } = useAuth(); // Use the context function
    const [error, setError] = useState(null);
    const [isAvailable, setIsAvailable] = useState(false);

    useEffect(() => {
        checkAvailability();
    }, []);

    async function checkAvailability() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            const result = await NativeBiometric.isAvailable();
            setIsAvailable(result.isAvailable);
        } catch (err) {
            console.error("Biometric Check Error:", err);
            setError("Biometrics not available");
        }
    }

    const handleUnlock = async () => {
        setError(null);
        try {
            await unlockWithBiometrics();
        } catch (err) {
            setError("Authentication failed.");
        }
    };

    if (!Capacitor.isNativePlatform()) {
        return (
            <div className="fixed inset-0 z-[100] bg-stone-900 flex items-center justify-center">
                <div className="bg-white p-8 rounded-2xl text-center space-y-4">
                    <p>Biometrics not supported on Web.</p>
                    <button onClick={handleUnlock} className="px-4 py-2 bg-emerald-600 text-white rounded-lg">Mock Unlock</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-8 bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 text-white">
            <div className="flex flex-col items-center space-y-8 animate-in fade-in zoom-in duration-300">
                <div className="relative">
                    <div className="absolute inset-0 bg-emerald-400 rounded-full blur-3xl opacity-20"></div>
                    <div className="relative p-6 bg-white/10 backdrop-blur-xl rounded-full ring-1 ring-white/20 shadow-2xl">
                        <Lock size={48} className="text-emerald-100" />
                    </div>
                </div>

                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight">App Locked</h2>
                    <p className="text-emerald-100/70 text-sm">Munirathnam Illam Rental Manager</p>
                </div>

                <div className="pt-8 flex flex-col items-center gap-4">
                    <button
                        onClick={handleUnlock}
                        className="flex items-center gap-3 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-emerald-900/50"
                    >
                        <Fingerprint size={24} />
                        <span>Unlock with Face ID</span>
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-sm text-emerald-200/50 font-medium hover:text-white transition"
                    >
                        Reload App
                    </button>
                </div>

                {error && (
                    <p className="text-rose-300 text-sm font-medium mt-4 animate-pulse">
                        {error}
                    </p>
                )}
            </div>

            <div className="absolute bottom-8 text-center">
                <div className="flex items-center justify-center gap-2 text-xs text-white/30 uppercase tracking-widest font-bold">
                    <ShieldCheck size={12} />
                    <span>Secured by Biometrics</span>
                </div>
            </div>
        </div>
    );
}

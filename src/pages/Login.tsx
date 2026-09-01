import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building, Shield, AlertCircle } from 'lucide-react';

export function formatAuthError(error: unknown): string {
    const err = error as { code?: string; message?: string };
    const code = err?.code || '';

    switch (code) {
        case 'auth/user-disabled':
            return 'This account has been disabled. Please contact the administrator.';
        case 'auth/unauthorized-domain': {
            const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
            return `Domain "${domain}" is not authorized in Firebase Auth. Add it under Firebase Console > Authentication > Settings > Authorized domains.`;
        }
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection and try again.';
        default:
            return err?.message || 'Authentication failed. Please try again.';
    }
}

export default function Login() {
    const { currentUser, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [generalError, setGeneralError] = useState('');
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    // Reactive navigation if currentUser is present
    useEffect(() => {
        if (currentUser) {
            navigate('/', { replace: true });
        }
    }, [currentUser, navigate]);

    // If already logged in, navigate to dashboard
    if (currentUser) {
        return <Navigate to="/" replace />;
    }

    // Handle Google Login via full-page redirect (no popup window)
    const handleGoogleLogin = async () => {
        setGeneralError('');
        setIsGoogleLoading(true);
        try {
            await loginWithGoogle();
        } catch (err: any) {
            console.error('Google login failed:', err);
            setGeneralError(formatAuthError(err));
            setIsGoogleLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-white">
            {/* Left Panel - Branding */}
            <div className="w-full md:w-1/2 bg-gradient-to-br from-emerald-50 via-emerald-50 to-emerald-100 p-8 md:p-12 lg:p-20 flex flex-col justify-between relative overflow-hidden">
                {/* Decorative Circles */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-100/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-200/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 text-emerald-800 mb-8 md:mb-12">
                        <div className="p-2.5 bg-white/80 rounded-xl backdrop-blur-sm shadow-sm ring-1 ring-black/5">
                            <Building size={24} className="text-emerald-700" />
                        </div>
                        <span className="font-bold tracking-tight text-lg">Munirathnam Illam</span>
                    </div>

                    <div className="space-y-4 md:space-y-6 max-w-lg">
                        <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.15]">
                            Property Management System
                        </h1>
                        <p className="text-base md:text-lg text-slate-600 font-medium leading-relaxed">
                            Track tenants, rent payments, water meters, maintenance, and analytics from one unified dashboard.
                        </p>
                    </div>
                </div>

                <div className="relative z-10 mt-8 md:mt-12 text-xs md:text-sm font-medium text-emerald-800/60">
                    &copy; {new Date().getFullYear()} Munirathnam Illam. All rights reserved.
                </div>
            </div>

            {/* Right Panel - Login Card */}
            <div className="w-full md:w-1/2 p-6 md:p-12 flex items-center justify-center bg-white relative">
                {/* Mobile Safe Area Spacer */}
                <div className="absolute top-0 w-full h-[env(safe-area-inset-top)] bg-transparent md:hidden"></div>

                <div className="w-full max-w-md space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex p-3.5 bg-emerald-50 rounded-2xl ring-1 ring-emerald-100/80 shadow-sm">
                            <Shield className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to your account</h2>
                        <p className="text-sm text-slate-500">
                            Access the property management dashboard
                        </p>
                    </div>

                    {/* General Error Banner */}
                    {generalError && (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-sm animate-in fade-in duration-200">
                            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-semibold">Sign-in notice</p>
                                <p className="text-rose-700 leading-relaxed">{generalError}</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4 pt-2">
                        {/* Google Sign In (Redirect-based, no popup) */}
                        <button
                            type="button"
                            onClick={handleGoogleLogin}
                            disabled={isGoogleLoading}
                            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-stone-200 hover:border-stone-300 hover:bg-stone-50 rounded-2xl text-slate-800 font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm"
                        >
                            {isGoogleLoading ? (
                                <>
                                    <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></span>
                                    <span>Redirecting to Google...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                                        <path
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            fill="#4285F4"
                                        />
                                        <path
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            fill="#34A853"
                                        />
                                        <path
                                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                            fill="#FBBC05"
                                        />
                                        <path
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                            fill="#EA4335"
                                        />
                                    </svg>
                                    <span>Continue with Google</span>
                                </>
                            )}
                        </button>

                        <p className="text-center text-xs text-slate-400 font-medium pt-3">
                            Encrypted &amp; secure session with Firebase
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

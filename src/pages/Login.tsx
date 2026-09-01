import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building, Shield, Mail, CheckCircle, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { isSignInWithEmailLink, getRedirectResult } from 'firebase/auth';
import { auth } from '../services/firebase';

export function validateEmail(email: string): boolean {
    const trimmed = email.trim();
    if (!trimmed) return false;
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(trimmed);
}

export function formatAuthError(error: unknown): string {
    const err = error as { code?: string; message?: string };
    const code = err?.code || '';

    switch (code) {
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/user-disabled':
            return 'This account has been disabled. Please contact the administrator.';
        case 'auth/unauthorized-domain': {
            const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
            return `Domain "${domain}" is not authorized in Firebase Auth. Add it under Firebase Console > Authentication > Settings > Authorized domains.`;
        }
        case 'auth/quota-exceeded':
        case 'auth/too-many-requests':
            return 'Too many requests. Please wait a moment before trying again.';
        case 'auth/invalid-action-code':
            return 'This sign-in link is invalid or has already been used. Please request a new link.';
        case 'auth/expired-action-code':
            return 'This sign-in link has expired. Please request a new link.';
        case 'auth/popup-blocked':
        case 'auth/popup-closed-by-user':
            return 'Sign-in window was closed. Please try again.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection and try again.';
        default:
            return err?.message || 'Authentication failed. Please try again.';
    }
}

export default function Login() {
    const { currentUser, loginWithGoogle, sendMagicLink, completeMagicLinkSignIn } = useAuth();
    const navigate = useNavigate();

    // Form states
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState('');
    const [generalError, setGeneralError] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    // Link sent state
    const [linkSentEmail, setLinkSentEmail] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);

    // Magic link completion states
    const [isProcessingLink, setIsProcessingLink] = useState(false);
    const [needsEmailPrompt, setNeedsEmailPrompt] = useState(false);
    const [confirmEmail, setConfirmEmail] = useState('');
    const [confirmEmailError, setConfirmEmailError] = useState('');

    // Handle initial mount checks: email magic link or Google redirect result
    useEffect(() => {
        const checkIncomingAuth = async () => {
            const href = window.location.href;

            // 1. Check if user arrived via Email Sign-In Link
            if (isSignInWithEmailLink(auth, href)) {
                setIsProcessingLink(true);
                const savedEmail = window.localStorage.getItem('emailForSignIn');

                if (savedEmail) {
                    try {
                        await completeMagicLinkSignIn(savedEmail, href);
                        navigate('/', { replace: true });
                        return;
                    } catch (err) {
                        console.error('Sign-in with link failed:', err);
                        setGeneralError(formatAuthError(err));
                        setIsProcessingLink(false);
                    }
                } else {
                    // Link opened on another device/browser without localStorage
                    setIsProcessingLink(false);
                    setNeedsEmailPrompt(true);
                }
                return;
            }

            // 2. Check if user returned from Google Redirect
            try {
                const redirectResult = await getRedirectResult(auth);
                if (redirectResult?.user) {
                    navigate('/', { replace: true });
                }
            } catch (err) {
                console.error('Google redirect result error:', err);
                setGeneralError(formatAuthError(err));
            }
        };

        checkIncomingAuth();
    }, [completeMagicLinkSignIn, navigate]);

    // Resend countdown timer
    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => {
            setCooldown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    // Reactive navigation if currentUser is loaded
    useEffect(() => {
        if (currentUser) {
            navigate('/', { replace: true });
        }
    }, [currentUser, navigate]);

    // If already logged in, navigate to dashboard
    if (currentUser) {
        return <Navigate to="/" replace />;
    }

    // Handle sending the magic link
    const handleSendLink = async (e?: FormEvent) => {
        if (e) e.preventDefault();
        setEmailError('');
        setGeneralError('');

        const targetEmail = (email || '').trim();
        if (!targetEmail) {
            setEmailError('Please enter your email address.');
            return;
        }

        if (!validateEmail(targetEmail)) {
            setEmailError('Please enter a valid email address (e.g. name@example.com).');
            return;
        }

        setIsSending(true);
        try {
            await sendMagicLink(targetEmail);
            setLinkSentEmail(targetEmail);
            setCooldown(30);
        } catch (err) {
            console.error('Failed to send magic link:', err);
            setGeneralError(formatAuthError(err));
        } finally {
            setIsSending(false);
        }
    };

    // Handle completing sign-in when email had to be re-entered (cross-device/browser)
    const handleConfirmEmailSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setConfirmEmailError('');
        setGeneralError('');

        const targetEmail = confirmEmail.trim();
        if (!targetEmail) {
            setConfirmEmailError('Please enter your email to complete sign-in.');
            return;
        }

        if (!validateEmail(targetEmail)) {
            setConfirmEmailError('Please enter a valid email address.');
            return;
        }

        setIsProcessingLink(true);
        try {
            await completeMagicLinkSignIn(targetEmail, window.location.href);
            navigate('/', { replace: true });
        } catch (err) {
            console.error('Failed to complete sign-in with entered email:', err);
            setGeneralError(formatAuthError(err));
            setIsProcessingLink(false);
        }
    };

    // Handle Google Login
    const handleGoogleLogin = async () => {
        setGeneralError('');
        setIsGoogleLoading(true);
        try {
            const res = await loginWithGoogle();
            if (res?.user || auth.currentUser) {
                navigate('/', { replace: true });
            }
        } catch (err: any) {
            console.error('Google login failed:', err);
            if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
                setGeneralError(formatAuthError(err));
            }
        } finally {
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

            {/* Right Panel - Custom Login Experience */}
            <div className="w-full md:w-1/2 p-6 md:p-12 flex items-center justify-center bg-white relative">
                {/* Mobile Safe Area Spacer */}
                <div className="absolute top-0 w-full h-[env(safe-area-inset-top)] bg-transparent md:hidden"></div>

                <div className="w-full max-w-md space-y-6">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex p-3.5 bg-emerald-50 rounded-2xl ring-1 ring-emerald-100/80 shadow-sm">
                            <Shield className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to your account</h2>
                        <p className="text-sm text-slate-500">
                            {isProcessingLink
                                ? 'Verifying your sign-in link...'
                                : needsEmailPrompt
                                ? 'Confirm your email to complete sign in'
                                : linkSentEmail
                                ? 'Check your email inbox'
                                : "We'll email you a passwordless magic link"}
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

                    {/* State 1: Verifying Magic Link */}
                    {isProcessingLink && (
                        <div className="p-8 text-center space-y-4 bg-stone-50 rounded-2xl border border-stone-200/80">
                            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="text-sm font-medium text-slate-600">
                                Verifying your authentication link and signing you in...
                            </p>
                        </div>
                    )}

                    {/* State 2: Prompting Email for Cross-Device / Cross-Browser Link Click */}
                    {!isProcessingLink && needsEmailPrompt && (
                        <form onSubmit={handleConfirmEmailSubmit} className="space-y-4">
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 leading-relaxed">
                                You opened this sign-in link in a new browser or device. Please confirm your email address below to complete sign-in.
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="confirmEmail" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                    Email address
                                </label>
                                <div className="relative">
                                    <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        id="confirmEmail"
                                        type="email"
                                        value={confirmEmail}
                                        onChange={(e) => {
                                            setConfirmEmail(e.target.value);
                                            if (confirmEmailError) setConfirmEmailError('');
                                        }}
                                        placeholder="name@example.com"
                                        autoFocus
                                        className={`w-full pl-11 pr-4 py-3.5 text-sm bg-stone-50 border ${
                                            confirmEmailError ? 'border-rose-300 ring-2 ring-rose-100 bg-rose-50/20' : 'border-stone-200'
                                        } rounded-2xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-all`}
                                    />
                                </div>
                                {confirmEmailError && (
                                    <p className="text-xs text-rose-600 font-medium pt-1">{confirmEmailError}</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isProcessingLink}
                                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl transition-all shadow-sm shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                Complete Sign In <ArrowRight size={16} />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setNeedsEmailPrompt(false);
                                    setGeneralError('');
                                    navigate('/login', { replace: true });
                                }}
                                className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors py-2 text-center"
                            >
                                Cancel and request a new link
                            </button>
                        </form>
                    )}

                    {/* State 3: Magic Link Sent Confirmation */}
                    {!isProcessingLink && !needsEmailPrompt && linkSentEmail && (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-6 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl text-center space-y-3">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                    <CheckCircle size={24} />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-bold text-slate-900">Check your inbox</p>
                                    <p className="text-sm text-slate-600">
                                        We sent a sign-in link to{' '}
                                        <span className="font-semibold text-slate-900 break-all">{linkSentEmail}</span>
                                    </p>
                                </div>
                                <p className="text-xs text-slate-500 pt-2 border-t border-emerald-200/50">
                                    Click the link in the email to automatically sign in.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <button
                                    type="button"
                                    onClick={() => handleSendLink()}
                                    disabled={isSending || cooldown > 0}
                                    className="w-full py-3.5 px-4 bg-white border-2 border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-slate-700 font-bold text-sm rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSending ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-slate-400 border-t-slate-700 rounded-full animate-spin"></span>
                                            <span>Sending link...</span>
                                        </>
                                    ) : cooldown > 0 ? (
                                        <>
                                            <RefreshCw size={15} className="animate-spin text-slate-400" />
                                            <span>Resend link in {cooldown}s</span>
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw size={15} />
                                            <span>Resend sign-in link</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setLinkSentEmail(null);
                                        setEmail('');
                                        setGeneralError('');
                                    }}
                                    className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors py-1.5 text-center"
                                >
                                    Use a different email address
                                </button>
                            </div>
                        </div>
                    )}

                    {/* State 4: Default Initial Form (Magic Link + Google Redirect) */}
                    {!isProcessingLink && !needsEmailPrompt && !linkSentEmail && (
                        <div className="space-y-5">
                            <form onSubmit={handleSendLink} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Email address
                                    </label>
                                    <div className="relative">
                                        <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                        <input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => {
                                                setEmail(e.target.value);
                                                if (emailError) setEmailError('');
                                            }}
                                            placeholder="owner@example.com"
                                            disabled={isSending || isGoogleLoading}
                                            autoComplete="email"
                                            className={`w-full pl-11 pr-4 py-3.5 text-sm bg-stone-50 border ${
                                                emailError ? 'border-rose-300 ring-2 ring-rose-100 bg-rose-50/20' : 'border-stone-200'
                                            } rounded-2xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-all disabled:opacity-50`}
                                        />
                                    </div>
                                    {emailError && (
                                        <p className="text-xs text-rose-600 font-medium pt-1">{emailError}</p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSending || isGoogleLoading}
                                    className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl transition-all shadow-sm shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                                >
                                    {isSending ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                                            <span>Sending magic link...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Send magic link</span>
                                            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="relative flex items-center justify-center">
                                <div className="border-t border-stone-200 w-full"></div>
                                <span className="bg-white px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                                    or
                                </span>
                            </div>

                            {/* Google Sign In (Redirect-based) */}
                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={isSending || isGoogleLoading}
                                className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white border-2 border-stone-200 rounded-2xl text-slate-700 font-bold text-sm hover:bg-stone-50 hover:border-stone-300 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm"
                            >
                                {isGoogleLoading ? (
                                    <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></span>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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

                            <p className="text-center text-xs text-slate-400 font-medium pt-2">
                                Encrypted &amp; secure session with Firebase
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

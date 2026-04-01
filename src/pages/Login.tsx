import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Building, Shield } from 'lucide-react';

export default function Login() {
    const { loginWithGoogle, currentUser } = useAuth();
    const [loading, setLoading] = useState(false);

    if (currentUser) return <Navigate to="/" />;

    const handleLogin = async () => {
        try {
            setLoading(true);
            await loginWithGoogle();
        } catch (error) {
            console.error("Login failed:", error);
            alert("Login failed. Please try again.");
            setLoading(false);
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
                    <div className="flex items-center gap-3 text-emerald-800 mb-12">
                        <div className="p-2 bg-white/60 rounded-xl backdrop-blur-sm shadow-sm ring-1 ring-black/5">
                            <Building size={24} />
                        </div>
                        <span className="font-bold tracking-tight">Munirathnam Illam</span>
                    </div>

                    <div className="space-y-6 max-w-lg">
                        <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.1]">
                            Property Management System
                        </h1>
                        <p className="text-lg text-slate-600 font-medium leading-relaxed">
                            Manage tenants, rent, maintenance, and reports from one unified dashboard.
                        </p>
                    </div>
                </div>

                <div className="relative z-10 mt-12 text-sm font-medium text-emerald-800/60">
                    &copy; {new Date().getFullYear()} Munirathnam Illam
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="w-full md:w-1/2 p-4 flex items-center justify-center bg-white relative">
                {/* Mobile Safe Area Spacer for top notch if needed */}
                <div className="absolute top-0 w-full h-[env(safe-area-inset-top)] bg-transparent md:hidden"></div>

                <div className="w-full max-w-md space-y-8 p-8">
                    <div className="text-center space-y-4">
                        <div className="inline-flex p-4 bg-stone-50 rounded-2xl mb-4 ring-1 ring-stone-100 shadow-sm">
                            <Shield className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">Welcome Back</h2>
                        <p className="text-slate-500">Sign in to manage your property</p>
                    </div>

                    <div className="space-y-4 pt-4">
                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-stone-200 rounded-2xl text-slate-700 font-bold hover:bg-stone-50 hover:border-stone-300 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm"
                        >
                            {loading ? (
                                <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
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

                        <p className="text-center text-xs text-slate-400 font-medium pt-4">
                            Your data is securely encrypted
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

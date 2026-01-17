import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Building,
    LayoutDashboard,
    Home,
    Receipt,
    Droplet,
    Wallet,
    LogOut,
    User,
    Database
} from 'lucide-react';

export default function Layout({ children }) {
    const { currentUser, logout } = useAuth();
    const location = useLocation();

    const isActive = (path) => location.pathname === path;

    const NavItem = ({ to, icon: Icon, label, mobile = false }) => (
        <Link
            to={to}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${isActive(to)
                ? 'bg-emerald-100 text-emerald-900 font-bold shadow-sm ring-1 ring-emerald-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                } ${mobile ? 'flex-col text-[10px] gap-1 px-1 py-1 rounded-none bg-transparent hover:bg-transparent ring-0 shadow-none' : 'text-sm'}`}
        >
            <div className={`p-2 rounded-xl transition-colors ${isActive(to) && !mobile ? 'bg-emerald-200/50 text-emerald-800' : 'bg-transparent'}`}>
                <Icon size={mobile ? 20 : 18} />
            </div>
            <span>{label}</span>
        </Link>
    );

    return (
        <div className="min-h-screen bg-white md:bg-stone-50/30 flex flex-col md:flex-row">
            {/* Left Sidebar (Desktop) */}
            <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-stone-100 p-6 z-40">
                <div className="flex items-center gap-3 mb-10 px-2">
                    <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-emerald-100/70 border border-emerald-200/60 text-emerald-800 shadow-sm">
                        <Building size={20} />
                    </span>
                    <div>
                        <h1 className="text-lg font-extrabold tracking-tight text-slate-900 leading-tight">Munirathnam</h1>
                        <p className="text-xs font-bold text-emerald-600 tracking-wide uppercase">Illam Manager</p>
                    </div>
                </div>

                <nav className="space-y-2 flex-1">
                    <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Menu</div>
                    <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
                    <NavItem to="/rooms" icon={Home} label="Room Details" />
                    <NavItem to="/rent" icon={Receipt} label="Rent Status" />
                    <NavItem to="/water" icon={Droplet} label="Water Bill" />
                    <NavItem to="/expenses" icon={Wallet} label="Expenses" />
                    <div className="h-px bg-stone-100 my-2"></div>
                    <NavItem to="/admin" icon={User} label="Admin" />
                    <NavItem to="/admin/migrate" icon={Database} label="Migration" />
                </nav>

                <div className="pt-6 border-t border-stone-100">
                    <div className="flex items-center gap-3 px-2 py-2">
                        {currentUser && (
                            <>
                                <img
                                    src={currentUser.photoURL}
                                    alt="User"
                                    className="w-9 h-9 rounded-full border border-stone-200 bg-stone-50"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-700 truncate">{currentUser.displayName}</p>
                                    <p className="text-[10px] font-medium text-slate-400 truncate">Admin Access</p>
                                </div>
                                <button
                                    onClick={logout}
                                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                    title="Sign Out"
                                >
                                    <LogOut size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 flex flex-col min-h-screen">
                {/* Mobile Header (Safe Area Aware) */}
                <header className="md:hidden bg-white/90 backdrop-blur-md border-b border-stone-100 sticky top-0 z-30 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+16px)] flex items-center justify-between transition-all">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-50">
                            <Building size={18} />
                        </span>
                        <div>
                            <h1 className="font-black text-slate-900 text-base leading-tight tracking-tight">Munirathnam</h1>
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Rent Manager</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {currentUser && (
                            <img src={currentUser.photoURL} className="w-8 h-8 rounded-full border border-stone-200 shadow-sm" />
                        )}
                    </div>
                </header>

                <main className="p-4 md:p-8 lg:p-10 max-w-7xl w-full mx-auto pb-24 md:pb-10">
                    {children}
                </main>
            </div>

            {/* Mobile Bottom Navigation */}
            <div className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white border-t border-stone-100 pb-safe">
                <div className="grid grid-cols-5 gap-1 p-2">
                    <NavItem to="/" icon={LayoutDashboard} label="Dash" mobile />
                    <NavItem to="/rooms" icon={Home} label="Rooms" mobile />
                    <NavItem to="/rent" icon={Receipt} label="Rent" mobile />
                    <NavItem to="/water" icon={Droplet} label="Water" mobile />
                    <NavItem to="/expenses" icon={Wallet} label="Expenses" mobile />
                </div>
            </div>
        </div>
    );
}

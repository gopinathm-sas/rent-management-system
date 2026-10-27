import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { testGeminiHealth } from '../services/gemini';
import {
    Zap,
    Clock,
    CreditCard,
    AlertTriangle,
    CheckCircle2,
    RefreshCw,
    ExternalLink,
    BarChart3,
    Activity,
    Settings2,
    Calendar,
    Sparkles,
    ShieldAlert,
    Info,
    Loader2
} from 'lucide-react';

export default function GeminiQuotaTab({ showToast }) {
    const [quotaData, setQuotaData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [showTopUpModal, setShowTopUpModal] = useState(false);

    // Modal Form State
    const [initialCredits, setInitialCredits] = useState(500);
    const [currency, setCurrency] = useState('INR');
    const [topUpDate, setTopUpDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [costPerRequest, setCostPerRequest] = useState(0.05);
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Live Countdown to Pacific Midnight (Daily Quota Reset)
    const [timeUntilReset, setTimeUntilReset] = useState({ hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'geminiQuota'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setQuotaData(data);
                if (data.prepaid) {
                    setInitialCredits(data.prepaid.initialCredits ?? 500);
                    setCurrency(data.prepaid.currency || 'INR');
                    setTopUpDate(data.prepaid.topUpDate || new Date().toISOString().slice(0, 10));
                    setCostPerRequest(data.prepaid.costPerRequestEstimated ?? 0.05);
                    setNotes(data.prepaid.notes || '');
                }
            } else {
                setQuotaData(null);
            }
            setLoading(false);
        }, (err) => {
            console.error('Error listening to geminiQuota:', err);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    // Calculate time until midnight Pacific Time (00:00 PT)
    useEffect(() => {
        function calculateReset() {
            const now = new Date();
            // Get current Pacific Time string
            const ptString = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
            const ptDate = new Date(ptString);
            
            // Next midnight Pacific
            const nextMidnightPT = new Date(ptDate);
            nextMidnightPT.setDate(nextMidnightPT.getDate() + 1);
            nextMidnightPT.setHours(0, 0, 0, 0);

            const diffMs = nextMidnightPT.getTime() - ptDate.getTime();
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

            setTimeUntilReset({ hours, minutes, seconds });
        }

        calculateReset();
        const interval = setInterval(calculateReset, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleRunHealthCheck = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await testGeminiHealth();
            setTestResult(res);
            if (res.success) {
                showToast?.(`Gemini API connection healthy (${res.latency}ms)`, 'success');
            } else {
                showToast?.(`Gemini API issue: ${res.error}`, 'error');
            }
        } catch (err) {
            setTestResult({ success: false, error: err.message, latency: 0 });
            showToast?.(`Test failed: ${err.message}`, 'error');
        } finally {
            setIsTesting(false);
        }
    };

    const handleSavePrepaidConfig = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'geminiQuota'), {
                prepaid: {
                    initialCredits: Number(initialCredits) || 0,
                    currency,
                    topUpDate,
                    costPerRequestEstimated: Number(costPerRequest) || 0.05,
                    notes: notes.trim(),
                    updatedAt: new Date().toISOString()
                }
            }, { merge: true });

            showToast?.('Prepaid credit settings saved successfully', 'success');
            setShowTopUpModal(false);
        } catch (err) {
            console.error('Failed to save prepaid config:', err);
            showToast?.(`Error saving settings: ${err.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Computations
    const todayKey = new Date().toISOString().slice(0, 10);
    const currentMonthKey = todayKey.slice(0, 7);

    const dailyLimit = 1500; // Free tier standard RPD
    const todayUsage = quotaData?.dailyUsage?.[todayKey]?.requests || 0;
    const todayTokens = quotaData?.dailyUsage?.[todayKey]?.tokens || 0;
    const percentUsed = Math.min(100, Math.round((todayUsage / dailyLimit) * 100));
    const remainingRequests = Math.max(0, dailyLimit - todayUsage);

    // Prepaid calculations
    const prepaid = quotaData?.prepaid || null;
    const currencySymbol = prepaid?.currency === 'USD' ? '$' : '₹';

    let requestsSinceTopUp = 0;
    let daysSinceTopUp = 0;
    let estimatedSpend = 0;
    let remainingCredits = 0;
    let estimatedDaysLeft = null;

    if (prepaid && prepaid.initialCredits > 0) {
        const topDateObj = new Date(prepaid.topUpDate || todayKey);
        const diffDays = Math.max(0, Math.floor((new Date() - topDateObj) / (1000 * 60 * 60 * 24)));
        daysSinceTopUp = diffDays;

        // Sum requests on or after topUpDate
        const dailyMap = quotaData?.dailyUsage || {};
        Object.entries(dailyMap).forEach(([dateStr, u]) => {
            if (dateStr >= (prepaid.topUpDate || todayKey)) {
                requestsSinceTopUp += (u?.requests || 0);
            }
        });

        const costRate = prepaid.costPerRequestEstimated || 0.05;
        estimatedSpend = Math.round(requestsSinceTopUp * costRate * 100) / 100;
        remainingCredits = Math.max(0, Math.round((prepaid.initialCredits - estimatedSpend) * 100) / 100);

        const avgRequestsPerDay = daysSinceTopUp > 0 ? (requestsSinceTopUp / (daysSinceTopUp + 1)) : requestsSinceTopUp;
        if (avgRequestsPerDay > 0 && costRate > 0) {
            const dailyBurn = avgRequestsPerDay * costRate;
            estimatedDaysLeft = Math.floor(remainingCredits / dailyBurn);
        }
    }

    const isDepleted = quotaData?.status === 'depleted' || (quotaData?.lastError && quotaData.lastError.toLowerCase().includes('depleted'));
    const isRateLimited = quotaData?.status === 'rate_limited';

    // Last 7 days usage array for visual bars
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
        const count = quotaData?.dailyUsage?.[key]?.requests || 0;
        last7Days.push({ key, label: dayLabel, count });
    }
    const maxDayCount = Math.max(...last7Days.map(d => d.count), 10);

    return (
        <div className="space-y-8 animate-in fade-in duration-350">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-indigo-500/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold uppercase tracking-wider text-blue-100 border border-white/20">
                        <Sparkles size={14} />
                        Gemini AI Studio Monitor
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black tracking-tight">AI Quotas & Prepaid Credits</h3>
                    <p className="text-blue-100 text-xs sm:text-sm max-w-xl">
                        Monitor daily API request quotas, manage prepayment credits, track real-time health, and keep rental automations running smoothly.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleRunHealthCheck}
                        disabled={isTesting}
                        className="px-4 py-2.5 rounded-xl bg-white text-indigo-700 font-bold text-xs sm:text-sm shadow-md hover:bg-blue-50 transition active:scale-95 flex items-center gap-2 disabled:opacity-75"
                    >
                        {isTesting ? <Loader2 size={16} className="animate-spin text-indigo-600" /> : <Zap size={16} className="text-amber-500 fill-amber-500" />}
                        <span>{isTesting ? 'Testing API...' : 'Test Connection'}</span>
                    </button>
                    <button
                        onClick={() => setShowTopUpModal(true)}
                        className="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs sm:text-sm backdrop-blur-md border border-white/30 transition active:scale-95 flex items-center gap-2"
                    >
                        <Settings2 size={16} />
                        <span>Prepaid Settings</span>
                    </button>
                </div>
            </div>

            {/* Critical Alert if Depleted */}
            {isDepleted && (
                <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-rose-500 text-white rounded-2xl shadow-md">
                            <ShieldAlert size={28} />
                        </div>
                        <div>
                            <h4 className="text-base sm:text-lg font-black text-rose-900">Prepayment Credits Depleted</h4>
                            <p className="text-xs sm:text-sm text-rose-700 mt-0.5">
                                Your Google AI Studio project credits have ran out. AI Assistant, meter readings, and vault queries will be blocked until credits are added or a free key is used.
                            </p>
                            {quotaData?.lastError && (
                                <p className="text-[11px] font-mono text-rose-800 bg-rose-100/70 px-2 py-1 rounded-md mt-2 max-w-xl truncate">
                                    {quotaData.lastError}
                                </p>
                            )}
                        </div>
                    </div>
                    <a
                        href="https://console.cloud.google.com/billing"
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition flex items-center gap-2 whitespace-nowrap self-stretch sm:self-auto justify-center"
                    >
                        <span>Top Up in Google Cloud</span>
                        <ExternalLink size={14} />
                    </a>
                </div>
            )}

            {/* Test Result Message Banner */}
            {testResult && (
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in ${
                    testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                    <div className="flex items-center gap-3 text-xs sm:text-sm font-bold">
                        {testResult.success ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-rose-600" />}
                        <span>
                            {testResult.success
                                ? `API Ping Succeeded! Model: ${testResult.model} • Latency: ${testResult.latency}ms`
                                : `API Ping Failed: ${testResult.error}`}
                        </span>
                    </div>
                    <button
                        onClick={() => setTestResult(null)}
                        className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Main 4 Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. API Status */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">API Health</span>
                            <Activity size={18} className="text-slate-400" />
                        </div>
                        <div className="mt-3 flex items-center gap-2.5">
                            <span className={`size-3.5 rounded-full ${isDepleted ? 'bg-rose-500 animate-ping' : (isRateLimited ? 'bg-amber-500' : 'bg-emerald-500')}`} />
                            <h4 className="text-xl font-black text-slate-900">
                                {isDepleted ? 'Credits Depleted' : (isRateLimited ? 'Throttled (429)' : 'Active & Ready')}
                            </h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                            Model: <span className="font-mono font-bold text-indigo-600">{quotaData?.lastModel || 'gemini-3.5-flash-lite'}</span>
                        </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Last Used:</span>
                        <span className="font-semibold text-slate-700">
                            {quotaData?.lastUsedAt?.toDate ? quotaData.lastUsedAt.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : (quotaData?.lastUsedAt ? new Date(quotaData.lastUsedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Never')}
                        </span>
                    </div>
                </div>

                {/* 2. Free Daily Limit */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Quota (RPD)</span>
                            <BarChart3 size={18} className="text-slate-400" />
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-3xl font-black text-slate-900">{todayUsage.toLocaleString()}</span>
                            <span className="text-xs font-bold text-slate-400">/ {dailyLimit.toLocaleString()} requests</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="mt-3 w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ${
                                    percentUsed > 85 ? 'bg-rose-500' : (percentUsed > 60 ? 'bg-amber-500' : 'bg-emerald-500')
                                }`}
                                style={{ width: `${percentUsed}%` }}
                            />
                        </div>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">{percentUsed}% consumed</span>
                        <span className="font-bold text-emerald-600">{remainingRequests.toLocaleString()} remaining</span>
                    </div>
                </div>

                {/* 3. Daily Reset Countdown */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Quota Reset</span>
                            <Clock size={18} className="text-slate-400" />
                        </div>
                        <div className="mt-3">
                            <div className="text-3xl font-black font-mono text-indigo-600 tracking-tight">
                                {String(timeUntilReset.hours).padStart(2, '0')}:{String(timeUntilReset.minutes).padStart(2, '0')}:{String(timeUntilReset.seconds).padStart(2, '0')}
                            </div>
                            <p className="text-xs text-slate-500 mt-1 font-medium">
                                Left until 24h quota refreshes
                            </p>
                        </div>
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Reset Schedule:</span>
                        <span className="font-bold text-slate-700">12:30 PM IST (00:00 PT)</span>
                    </div>
                </div>

                {/* 4. Prepaid Balance & Days */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prepaid Balance</span>
                            <CreditCard size={18} className="text-slate-400" />
                        </div>
                        {prepaid && prepaid.initialCredits > 0 ? (
                            <div className="mt-3">
                                <div className="text-3xl font-black text-slate-900">
                                    {currencySymbol}{remainingCredits.toFixed(2)}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 font-medium">
                                    of {currencySymbol}{prepaid.initialCredits.toFixed(2)} initial top-up
                                </p>
                            </div>
                        ) : (
                            <div className="mt-3">
                                <button
                                    onClick={() => setShowTopUpModal(true)}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100"
                                >
                                    + Add Prepayment Record
                                </button>
                                <p className="text-[11px] text-slate-400 mt-1">Track balance &amp; auto-calculated burn</p>
                            </div>
                        )}
                    </div>
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Status:</span>
                        <span className="font-bold text-slate-700">
                            {prepaid && prepaid.initialCredits > 0 ? (
                                estimatedDaysLeft !== null ? `~${estimatedDaysLeft} days left` : `Active (${daysSinceTopUp}d)`
                            ) : 'Free Tier Mode'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Middle Section: 7-Day Chart & Quick External Console Shortcuts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 7-Day Usage Activity */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h4 className="font-bold text-slate-900 text-lg">7-Day Request Activity</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Requests processed across all rental manager features</p>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">This Month</span>
                            <div className="text-base font-black text-indigo-600">
                                {(quotaData?.monthlyUsage?.[currentMonthKey]?.requests || todayUsage).toLocaleString()} reqs
                            </div>
                        </div>
                    </div>

                    {/* Simple HTML/CSS Bar Chart */}
                    <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-40 pt-4 pb-2 border-b border-slate-100">
                        {last7Days.map((day) => {
                            const barHeightPercent = Math.max(6, Math.round((day.count / maxDayCount) * 100));
                            const isToday = day.key === todayKey;

                            return (
                                <div key={day.key} className="flex flex-col items-center gap-2 h-full justify-end group">
                                    <span className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {day.count}
                                    </span>
                                    <div
                                        className={`w-full max-w-[36px] rounded-t-xl transition-all duration-300 ${
                                            isToday
                                                ? 'bg-gradient-to-t from-indigo-600 to-blue-500 shadow-md shadow-indigo-200'
                                                : 'bg-slate-200 hover:bg-slate-300'
                                        }`}
                                        style={{ height: `${barHeightPercent}%` }}
                                        title={`${day.key}: ${day.count} requests`}
                                    />
                                    <span className={`text-[11px] font-bold ${isToday ? 'text-indigo-600 font-black' : 'text-slate-500'}`}>
                                        {day.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                            <span className="size-2.5 rounded-full bg-indigo-600" />
                            <span>Today's active volume</span>
                        </div>
                        <div>
                            Lifetime requests: <strong className="text-slate-800">{(quotaData?.totalRequests || 0).toLocaleString()}</strong>
                        </div>
                    </div>
                </div>

                {/* Google Consoles Direct Access */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between space-y-6">
                    <div>
                        <h4 className="font-bold text-slate-900 text-lg">Official Google Consoles</h4>
                        <p className="text-xs text-slate-500 mt-1">
                            Google manages API keys, prepay billing, and hard token quotas directly in these dashboards.
                        </p>

                        <div className="mt-5 space-y-3">
                            <a
                                href="https://console.cloud.google.com/billing"
                                target="_blank"
                                rel="noreferrer"
                                className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                                        <CreditCard size={18} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition">Google Cloud Billing</div>
                                        <div className="text-[11px] text-slate-400">View prepaid balance &amp; invoices</div>
                                    </div>
                                </div>
                                <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600 transition" />
                            </a>

                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noreferrer"
                                className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                                        <Zap size={18} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition">Google AI Studio Keys</div>
                                        <div className="text-[11px] text-slate-400">Generate or rotate free API keys</div>
                                    </div>
                                </div>
                                <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600 transition" />
                            </a>

                            <a
                                href="https://ai.google.dev/pricing"
                                target="_blank"
                                rel="noreferrer"
                                className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                                        <Info size={18} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition">Gemini API Pricing Docs</div>
                                        <div className="text-[11px] text-slate-400">Rate limits, models &amp; tiers</div>
                                    </div>
                                </div>
                                <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600 transition" />
                            </a>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/60 text-xs text-slate-500 flex items-start gap-2.5">
                        <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                        <span>
                            Free tier keys include <strong>1,500 free requests/day</strong>. If you run out of prepaid credits, generating a new Free Tier key on a new project restores service instantly.
                        </span>
                    </div>
                </div>
            </div>

            {/* Prepaid Configuration Modal */}
            {showTopUpModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 pt-6 pb-2 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Configure Prepayment Tracker</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Track your credits balance and burn rate</p>
                            </div>
                            <button
                                onClick={() => setShowTopUpModal(false)}
                                className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSavePrepaidConfig} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Top-Up Amount
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        value={initialCredits}
                                        onChange={(e) => setInitialCredits(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold"
                                        placeholder="500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Currency
                                    </label>
                                    <select
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold"
                                    >
                                        <option value="INR">₹ INR (Rupees)</option>
                                        <option value="USD">$ USD (Dollars)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Top-Up Date
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={topUpDate}
                                    onChange={(e) => setTopUpDate(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Est. Cost Per Request ({currencySymbol})
                                </label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={costPerRequest}
                                    onChange={(e) => setCostPerRequest(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                                    placeholder="0.05"
                                />
                                <span className="text-[10px] text-slate-400 mt-1 block">Default is ₹0.05 (5 paise per AI query/image scan).</span>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Note / Transaction Ref (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                                    placeholder="e.g. Added ₹500 via Google Cloud Billing"
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowTopUpModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save Settings'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

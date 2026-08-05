import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import {
    MONTHS,
    getMonthKey,
    computeWaterForMonth,
    getDefaultWaterRateForRoom,
    RENT_WATER_SERVICE_CHARGE,
    getRentRevisionDetails
} from '../lib/utils';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Droplets,
    PieChart as PieChartIcon,
    Printer,
    Building,
    BarChart3,
    Clock,
    Sparkles,
    ArrowUpRight,
    ArrowDownRight,
    Lightbulb,
    ArrowRightLeft,
    CheckCircle2,
    ShieldAlert
} from 'lucide-react';

export default function Analytics() {
    const { rooms, tenants, expenses, loading } = useData();

    // Total rooms in the property
    const totalRoomsCount = Object.keys(IMMUTABLE_ROOMS_DATA).length;

    // Collect all unique month keys from data + last 12 calendar months
    const availableMonths = useMemo(() => {
        const keysSet = new Set();

        // 1. Collect from tenants
        const tenantList = Array.isArray(tenants) ? tenants : Object.values(tenants || {});
        tenantList.forEach(t => {
            if (t.paymentTotals) Object.keys(t.paymentTotals).forEach(k => keysSet.add(k));
            if (t.paymentHistory) Object.keys(t.paymentHistory).forEach(k => keysSet.add(k));
            if (t.waterReadings) Object.keys(t.waterReadings).forEach(k => keysSet.add(k));
        });

        // 2. Collect from expenses
        const expenseList = Array.isArray(expenses) ? expenses : Object.values(expenses || {});
        expenseList.forEach(e => {
            if (e.monthKey) keysSet.add(e.monthKey);
        });

        // 3. Add last 12 calendar months
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            keysSet.add(getMonthKey(d.getFullYear(), d.getMonth()));
        }

        const list = Array.from(keysSet).filter(k => k && typeof k === 'string' && k.includes('-'));

        // Sort descending by Year and Month
        list.sort((a, b) => {
            const [yA, mA] = a.split('-');
            const [yB, mB] = b.split('-');
            if (yA !== yB) return Number(yB) - Number(yA);
            const monthIdxA = MONTHS.indexOf(mA);
            const monthIdxB = MONTHS.indexOf(mB);
            return monthIdxB - monthIdxA;
        });

        return list;
    }, [tenants, expenses]);

    // Current month key e.g. "2026-Jan"
    const currentMonthKey = useMemo(() => {
        const now = new Date();
        return getMonthKey(now.getFullYear(), now.getMonth());
    }, []);

    // Selected month state - default to current month or first available month with data
    const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);

    useEffect(() => {
        if (availableMonths.length > 0 && !availableMonths.includes(selectedMonthKey)) {
            setSelectedMonthKey(availableMonths[0]);
        }
    }, [availableMonths, selectedMonthKey]);

    // Financial Computations for Selected Month AND Previous Month for MoM Comparison
    const analyticsData = useMemo(() => {
        if (!tenants || !rooms) return null;

        const tenantList = Array.isArray(tenants) ? tenants : Object.values(tenants || {});
        const expenseList = Array.isArray(expenses) ? expenses : Object.values(expenses || {});
        const isAllTime = selectedMonthKey === 'all';

        // Helper function to calculate full monthly stats for a given monthKey
        const calculateMonthStats = (mKey) => {
            let rev = 0;
            let rentRev = 0;
            let waterRev = 0;
            let svcRev = 0;
            let totalLiters = 0;
            let paidCount = 0;
            const roomWaterList = [];

            let y = new Date().getFullYear();
            let mIdx = new Date().getMonth();

            if (mKey && mKey.includes('-')) {
                const [yStr, mStr] = mKey.split('-');
                const yP = parseInt(yStr, 10);
                const mP = MONTHS.indexOf(mStr);
                if (!isNaN(yP) && mP !== -1) {
                    y = yP;
                    mIdx = mP;
                }
            }

            tenantList.forEach(t => {
                const paidAmt = t.paymentTotals?.[mKey];
                const status = t.paymentHistory?.[mKey];

                if (paidAmt && (status === 'Paid' || status === 'Rent Only')) {
                    rev += Number(paidAmt) || 0;
                    paidCount++;

                    const waterRate = t.waterRate || getDefaultWaterRateForRoom(t.roomNo);
                    const waterCalc = computeWaterForMonth(t, y, mIdx, waterRate);
                    const roomWaterCost = waterCalc?.amount || 0;
                    const roomWaterUnits = waterCalc?.units || 0;

                    if (roomWaterUnits > 0) {
                        totalLiters += roomWaterUnits;
                        roomWaterList.push({
                            roomNo: t.roomNo || 'N/A',
                            tenant: t.tenant || 'Occupant',
                            liters: roomWaterUnits,
                            cost: roomWaterCost
                        });
                    }

                    if (status === 'Paid') {
                        svcRev += RENT_WATER_SERVICE_CHARGE;
                        waterRev += roomWaterCost;
                        rentRev += Math.max(0, Number(paidAmt) - roomWaterCost - RENT_WATER_SERVICE_CHARGE);
                    } else {
                        rentRev += Number(paidAmt);
                    }
                }
            });

            let exp = 0;
            const catMap = {};

            expenseList.forEach(e => {
                const eMonth = e.monthKey || (e.date ? getMonthKey(new Date(e.date).getFullYear(), new Date(e.date).getMonth()) : '');
                if (eMonth === mKey) {
                    const amt = Number(e.amount) || 0;
                    exp += amt;
                    const cat = e.category || 'General';
                    catMap[cat] = (catMap[cat] || 0) + amt;
                }
            });

            roomWaterList.sort((a, b) => (b.liters || 0) - (a.liters || 0));

            return {
                totalRevenue: rev,
                rentRevenue: rentRev,
                waterRevenue: waterRev,
                serviceChargeRevenue: svcRev,
                totalExpenses: exp,
                netProfit: rev - exp,
                profitMargin: rev > 0 ? Math.round(((rev - exp) / rev) * 100) : 0,
                totalWaterLiters: totalLiters,
                waterUsageByRoom: roomWaterList,
                categoryMap: catMap,
                roomsPaidCount: paidCount
            };
        };

        // 1. Current Selected Month Stats
        const currentStats = calculateMonthStats(selectedMonthKey);

        // 2. Previous Month Key & Stats for MoM Comparison
        let prevMonthKey = '';
        if (selectedMonthKey && selectedMonthKey.includes('-')) {
            const [yStr, mStr] = selectedMonthKey.split('-');
            const y = parseInt(yStr, 10);
            const mIdx = MONTHS.indexOf(mStr);
            if (!isNaN(y) && mIdx !== -1) {
                let pY = y;
                let pM = mIdx - 1;
                if (pM < 0) {
                    pM = 11;
                    pY -= 1;
                }
                prevMonthKey = getMonthKey(pY, pM);
            }
        }

        const prevStats = prevMonthKey ? calculateMonthStats(prevMonthKey) : null;

        // 3. Month-over-Month (MoM) Deltas
        const momDeltas = prevStats ? {
            revenueDiff: currentStats.totalRevenue - prevStats.totalRevenue,
            revenuePct: prevStats.totalRevenue > 0 ? (((currentStats.totalRevenue - prevStats.totalRevenue) / prevStats.totalRevenue) * 100).toFixed(1) : 0,
            expenseDiff: currentStats.totalExpenses - prevStats.totalExpenses,
            expensePct: prevStats.totalExpenses > 0 ? (((currentStats.totalExpenses - prevStats.totalExpenses) / prevStats.totalExpenses) * 100).toFixed(1) : 0,
            profitDiff: currentStats.netProfit - prevStats.netProfit,
            profitPct: prevStats.netProfit !== 0 ? (((currentStats.netProfit - prevStats.netProfit) / Math.abs(prevStats.netProfit)) * 100).toFixed(1) : 0,
            waterDiff: currentStats.totalWaterLiters - prevStats.totalWaterLiters,
            waterPct: prevStats.totalWaterLiters > 0 ? (((currentStats.totalWaterLiters - prevStats.totalWaterLiters) / prevStats.totalWaterLiters) * 100).toFixed(1) : 0,
        } : null;

        // 4. Advance Held & Occupancy
        const activeOccupied = tenantList.filter(t => t.status === 'Occupied');
        const totalAdvanceHeld = activeOccupied.reduce((acc, t) => acc + (Number(t.advance) || 0), 0);
        const occupancyRate = Math.round((activeOccupied.length / totalRoomsCount) * 100);

        // 5. Monthly History Trend (Last 6 Months)
        const recent6Months = availableMonths.slice(0, 6).reverse();
        const monthlyTrend = recent6Months.map(mKey => {
            const st = calculateMonthStats(mKey);
            return {
                month: mKey,
                revenue: st.totalRevenue,
                expenses: st.totalExpenses,
                profit: st.netProfit
            };
        });

        // 6. Rent Revision Radar (Excludes rooms with noRevision or eviction confirmed)
        const rentRevisions = activeOccupied
            .filter(t => !t.noRevision && !t.isEvictionConfirmed)
            .map(t => {
                const revDetails = getRentRevisionDetails(t);
                if (!revDetails || revDetails.reason === 'Disabled' || revDetails.reason === 'Eviction in progress') return null;
                const currentRent = Number(t.rent) || 0;
                const targetRent = revDetails.revisedRent || Math.round(currentRent * 1.1);

                return {
                    tenant: t,
                    roomNo: t.roomNo,
                    name: t.tenant,
                    currentRent: currentRent,
                    targetRent: targetRent,
                    daysRemaining: revDetails.daysRemaining !== undefined ? revDetails.daysRemaining : 999,
                    isDue: Boolean(revDetails.isDue),
                    dueDateStr: revDetails.nextDue ? revDetails.nextDue.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                };
            })
            .filter(Boolean)
            .filter(r => r.isDue || (r.daysRemaining !== undefined && r.daysRemaining <= 60))
            .sort((a, b) => a.daysRemaining - b.daysRemaining);

        return {
            ...currentStats,
            prevStats,
            prevMonthKey,
            momDeltas,
            totalAdvanceHeld,
            occupancyRate,
            activeOccupiedCount: activeOccupied.length,
            monthlyTrend,
            rentRevisions
        };
    }, [tenants, rooms, expenses, selectedMonthKey, availableMonths, totalRoomsCount]);

    if (loading || !analyticsData) {
        return (
            <div className="p-12 text-center text-slate-400">
                <BarChart3 size={32} className="mx-auto mb-3 animate-pulse text-blue-500" />
                Calculating analytics and comparisons...
            </div>
        );
    }

    const {
        totalRevenue,
        rentRevenue,
        waterRevenue,
        serviceChargeRevenue,
        totalExpenses,
        netProfit,
        profitMargin,
        prevStats,
        prevMonthKey,
        momDeltas,
        totalAdvanceHeld,
        occupancyRate,
        activeOccupiedCount,
        totalWaterLiters,
        waterUsageByRoom,
        categoryMap,
        monthlyTrend,
        rentRevisions,
        roomsPaidCount
    } = analyticsData;

    const maxTrendVal = Math.max(...monthlyTrend.map(m => Math.max(m.revenue, m.expenses)), 10000);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Bar / Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-3xl text-white shadow-xl border border-slate-800">
                <div>
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-extrabold uppercase tracking-widest mb-1">
                        <Sparkles size={14} /> Property Insights & Analytics
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-white">Interactive Performance Dashboard</h1>
                    <p className="text-xs text-slate-400 mt-1">Real-time revenue comparisons, expense breakdowns & water tracking</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select
                            value={selectedMonthKey}
                            onChange={(e) => setSelectedMonthKey(e.target.value)}
                            className="bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs px-4 py-2.5 rounded-2xl backdrop-blur-md outline-none cursor-pointer transition pr-8"
                        >
                            <option value="all" className="bg-slate-900 text-white">All Time</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m} className="bg-slate-900 text-white">
                                    {m}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => window.print()}
                        className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition shadow-md flex items-center gap-2 text-xs font-bold"
                        title="Print Financial Report"
                    >
                        <Printer size={16} />
                        <span className="hidden sm:inline">Print Statement</span>
                    </button>
                </div>
            </div>

            {/* KPI Cards Grid with MoM Comparison Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Revenue Card */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                            <DollarSign size={22} />
                        </div>
                        {momDeltas && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full ${momDeltas.revenueDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {momDeltas.revenueDiff >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {momDeltas.revenueDiff >= 0 ? '+' : ''}{momDeltas.revenuePct}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Revenue</p>
                    <h3 className="text-2xl font-black text-slate-900 mt-1">₹{(totalRevenue || 0).toLocaleString('en-IN')}</h3>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium flex items-center justify-between">
                        <span>{roomsPaidCount}/{totalRoomsCount} Rooms Paid</span>
                        {momDeltas && (
                            <span className="text-[10px] font-bold text-slate-400">
                                {momDeltas.revenueDiff >= 0 ? '+' : ''}₹{momDeltas.revenueDiff.toLocaleString('en-IN')} vs {prevMonthKey}
                            </span>
                        )}
                    </p>
                </div>

                {/* Total Expenses Card */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                            <TrendingDown size={22} />
                        </div>
                        {momDeltas && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full ${momDeltas.expenseDiff <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {momDeltas.expenseDiff <= 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                                {momDeltas.expenseDiff <= 0 ? '' : '+'}{momDeltas.expensePct}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Expenses</p>
                    <h3 className="text-2xl font-black text-slate-900 mt-1">₹{(totalExpenses || 0).toLocaleString('en-IN')}</h3>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium flex items-center justify-between">
                        <span>{Object.keys(categoryMap).length} Categories</span>
                        {momDeltas && (
                            <span className="text-[10px] font-bold text-slate-400">
                                {momDeltas.expenseDiff <= 0 ? '-' : '+'}₹{Math.abs(momDeltas.expenseDiff).toLocaleString('en-IN')} vs {prevMonthKey}
                            </span>
                        )}
                    </p>
                </div>

                {/* Net Profit Card */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-2">
                        <div className={`p-3 rounded-2xl ${netProfit >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                            <TrendingUp size={22} />
                        </div>
                        {momDeltas && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full ${momDeltas.profitDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {momDeltas.profitDiff >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {momDeltas.profitDiff >= 0 ? '+' : ''}{momDeltas.profitPct}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Operating Profit</p>
                    <h3 className={`text-2xl font-black mt-1 ${netProfit >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                        ₹{(netProfit || 0).toLocaleString('en-IN')}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium flex items-center justify-between">
                        <span>{profitMargin}% Margin</span>
                        {momDeltas && (
                            <span className="text-[10px] font-bold text-slate-400">
                                {momDeltas.profitDiff >= 0 ? '+' : ''}₹{momDeltas.profitDiff.toLocaleString('en-IN')} vs {prevMonthKey}
                            </span>
                        )}
                    </p>
                </div>

                {/* Water Consumption Card */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
                            <Droplets size={22} />
                        </div>
                        {momDeltas && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full ${momDeltas.waterDiff <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {momDeltas.waterDiff <= 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                                {momDeltas.waterDiff <= 0 ? '' : '+'}{momDeltas.waterPct}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Water Consumption</p>
                    <h3 className="text-2xl font-black text-slate-900 mt-1">{(totalWaterLiters || 0).toLocaleString('en-IN')} <span className="text-sm font-bold text-slate-500">Liters</span></h3>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium flex items-center justify-between">
                        <span>{waterUsageByRoom.length} Rooms Tracked</span>
                        {momDeltas && (
                            <span className="text-[10px] font-bold text-slate-400">
                                {momDeltas.waterDiff >= 0 ? '+' : ''}{momDeltas.waterDiff.toLocaleString('en-IN')} L vs {prevMonthKey}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {/* NEW: Month-over-Month Comparison Breakdown Widget */}
            {prevStats && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                                <ArrowRightLeft size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">Month-over-Month (MoM) Financial Comparison</h3>
                                <p className="text-xs text-slate-500">Comparing <span className="font-extrabold text-slate-900">{selectedMonthKey}</span> vs <span className="font-extrabold text-slate-900">{prevMonthKey}</span></p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                        {/* Revenue Comparison */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Revenue</span>
                            <div className="flex items-baseline justify-between pt-1">
                                <span className="text-lg font-black text-slate-900">₹{totalRevenue.toLocaleString('en-IN')}</span>
                                <span className="text-xs font-bold text-slate-400">vs ₹{prevStats.totalRevenue.toLocaleString('en-IN')}</span>
                            </div>
                            <div className={`text-xs font-extrabold flex items-center gap-1 pt-1 ${momDeltas.revenueDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {momDeltas.revenueDiff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {momDeltas.revenueDiff >= 0 ? '+' : ''}₹{momDeltas.revenueDiff.toLocaleString('en-IN')} ({momDeltas.revenuePct}%)
                            </div>
                        </div>

                        {/* Expense Comparison */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Expenses</span>
                            <div className="flex items-baseline justify-between pt-1">
                                <span className="text-lg font-black text-slate-900">₹{totalExpenses.toLocaleString('en-IN')}</span>
                                <span className="text-xs font-bold text-slate-400">vs ₹{prevStats.totalExpenses.toLocaleString('en-IN')}</span>
                            </div>
                            <div className={`text-xs font-extrabold flex items-center gap-1 pt-1 ${momDeltas.expenseDiff <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {momDeltas.expenseDiff <= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                                {momDeltas.expenseDiff <= 0 ? '' : '+'}{momDeltas.expenseDiff.toLocaleString('en-IN')} ({momDeltas.expensePct}%)
                            </div>
                        </div>

                        {/* Net Profit Comparison */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Operating Income</span>
                            <div className="flex items-baseline justify-between pt-1">
                                <span className="text-lg font-black text-slate-900">₹{netProfit.toLocaleString('en-IN')}</span>
                                <span className="text-xs font-bold text-slate-400">vs ₹{prevStats.netProfit.toLocaleString('en-IN')}</span>
                            </div>
                            <div className={`text-xs font-extrabold flex items-center gap-1 pt-1 ${momDeltas.profitDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {momDeltas.profitDiff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {momDeltas.profitDiff >= 0 ? '+' : ''}₹{momDeltas.profitDiff.toLocaleString('en-IN')} ({momDeltas.profitPct}%)
                            </div>
                        </div>

                        {/* Water Usage Comparison */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Water Consumption</span>
                            <div className="flex items-baseline justify-between pt-1">
                                <span className="text-lg font-black text-slate-900">{totalWaterLiters.toLocaleString('en-IN')} L</span>
                                <span className="text-xs font-bold text-slate-400">vs {prevStats.totalWaterLiters.toLocaleString('en-IN')} L</span>
                            </div>
                            <div className={`text-xs font-extrabold flex items-center gap-1 pt-1 ${momDeltas.waterDiff <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {momDeltas.waterDiff <= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                                {momDeltas.waterDiff >= 0 ? '+' : ''}{momDeltas.waterDiff.toLocaleString('en-IN')} Liters ({momDeltas.waterPct}%)
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Middle Section: Financial Trend Chart & Expense Categories */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Monthly Revenue vs Expenses Trend (2 cols) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-base font-black text-slate-900">Graphical Performance Trajectory</h3>
                            <p className="text-xs text-slate-500">Revenue vs. Expenses over recent months</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-bold">
                            <div className="flex items-center gap-1.5 text-emerald-600">
                                <div className="w-3 h-3 rounded-full bg-emerald-500"></div> Revenue
                            </div>
                            <div className="flex items-center gap-1.5 text-rose-500">
                                <div className="w-3 h-3 rounded-full bg-rose-400"></div> Expenses
                            </div>
                        </div>
                    </div>

                    {/* Visual Bar Chart */}
                    <div className="space-y-4 pt-2">
                        {monthlyTrend.map((m) => {
                            const revPct = Math.round(((m.revenue || 0) / maxTrendVal) * 100);
                            const expPct = Math.round(((m.expenses || 0) / maxTrendVal) * 100);

                            return (
                                <div key={m.month} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs font-bold">
                                        <span className="text-slate-700 w-24 font-extrabold">{m.month}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-emerald-700 font-extrabold">₹{(m.revenue || 0).toLocaleString('en-IN')}</span>
                                            <span className="text-slate-300">/</span>
                                            <span className="text-rose-600 font-extrabold">₹{(m.expenses || 0).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                    <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5 p-0.5">
                                        <div
                                            style={{ width: `${Math.max(revPct, 2)}%` }}
                                            className="bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full h-full transition-all duration-500"
                                            title={`Revenue: ₹${m.revenue || 0}`}
                                        />
                                        <div
                                            style={{ width: `${Math.max(expPct, 2)}%` }}
                                            className="bg-gradient-to-r from-rose-400 to-pink-500 rounded-full h-full transition-all duration-500"
                                            title={`Expenses: ₹${m.expenses || 0}`}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Expense Category Breakdown (1 col) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-base font-black text-slate-900">Expense Distribution</h3>
                                <p className="text-xs text-slate-500">Categorized costs for {selectedMonthKey}</p>
                            </div>
                            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
                                <PieChartIcon size={18} />
                            </div>
                        </div>

                        {Object.keys(categoryMap).length === 0 ? (
                            <div className="py-12 text-center text-slate-400 text-xs italic">
                                No expenses logged for this month.
                            </div>
                        ) : (
                            <div className="space-y-4 my-2">
                                {Object.entries(categoryMap).map(([cat, amt]) => {
                                    const pct = totalExpenses > 0 ? Math.round(((amt || 0) / totalExpenses) * 100) : 0;
                                    return (
                                        <div key={cat} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs font-bold">
                                                <span className="text-slate-700 capitalize">{cat}</span>
                                                <span className="text-slate-900">₹{(amt || 0).toLocaleString('en-IN')} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                                            </div>
                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    style={{ width: `${pct}%` }}
                                                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4 text-xs text-slate-500 flex items-center justify-between">
                        <span>Total Tracked Expenses</span>
                        <span className="font-extrabold text-slate-900">₹{(totalExpenses || 0).toLocaleString('en-IN')}</span>
                    </div>
                </div>
            </div>

            {/* NEW: Smart Owner AI Insights Widget */}
            <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-orange-500/10 p-6 rounded-3xl border border-amber-200/60 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500 text-white rounded-2xl shadow-sm">
                        <Lightbulb size={20} />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-amber-950">Property Owner Smart Insights</h3>
                        <p className="text-xs text-amber-800/80">Automated key takeaways & cost optimization recommendations</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="bg-white/80 p-3.5 rounded-2xl border border-amber-200/50 backdrop-blur-sm text-xs space-y-1">
                        <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-emerald-600" /> Revenue Health
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            {profitMargin >= 80 ? `Excellent profit margin of ${profitMargin}%. Rent collection is performing strongly.` : `Current profit margin is ${profitMargin}%.`}
                        </p>
                    </div>

                    <div className="bg-white/80 p-3.5 rounded-2xl border border-amber-200/50 backdrop-blur-sm text-xs space-y-1">
                        <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                            <Droplets size={14} className="text-sky-600" /> Utility Analysis
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            {waterUsageByRoom.length > 0 ? `Room ${waterUsageByRoom[0]?.roomNo} is the highest consumer (${waterUsageByRoom[0]?.liters.toLocaleString('en-IN')} L).` : `No unusual water consumption detected.`}
                        </p>
                    </div>

                    <div className="bg-white/80 p-3.5 rounded-2xl border border-amber-200/50 backdrop-blur-sm text-xs space-y-1">
                        <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                            <Clock size={14} className="text-amber-600" /> Escalation Radar
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            {rentRevisions.length > 0 ? `${rentRevisions.length} room(s) are due or upcoming for 10% annual rent revision.` : `All tenant rent revisions are up to date.`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Water Consumption & Rent Revision Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Water Consumption Analytics */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-sky-100 text-sky-600 rounded-2xl">
                                <Droplets size={22} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">Water Consumption Rankings</h3>
                                <p className="text-xs text-slate-500">Total: <span className="font-extrabold text-sky-700">{(totalWaterLiters || 0).toLocaleString('en-IN')} Liters</span> for {selectedMonthKey}</p>
                            </div>
                        </div>
                    </div>

                    {waterUsageByRoom.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs italic">
                            No water meter readings logged for this month.
                        </div>
                    ) : (
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                            {waterUsageByRoom.map((w, idx) => (
                                <div key={w.roomNo} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-sky-50/50 transition">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-amber-400 text-amber-950 font-black' : 'bg-slate-200 text-slate-600'}`}>
                                            #{idx + 1}
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-800">Room {w.roomNo} <span className="text-slate-400 font-normal">({w.tenant})</span></h4>
                                            <p className="text-[10px] text-slate-500 font-semibold">{(w.liters || 0).toLocaleString('en-IN')} Liters consumed</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-black text-sky-800">₹{(w.cost || 0).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Rent Revision Radar */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
                                <Clock size={22} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">Annual Rent Revision Radar</h3>
                                <p className="text-xs text-slate-500">Upcoming 10% rent escalations (Within 60 days)</p>
                            </div>
                        </div>
                    </div>

                    {rentRevisions.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs italic">
                            No rent revisions due in the next 60 days. All tenant revisions up to date!
                        </div>
                    ) : (
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                            {rentRevisions.map((rev) => (
                                <div
                                    key={rev.roomNo}
                                    className={`p-3.5 rounded-2xl border transition ${rev.isDue ? 'bg-amber-50/80 border-amber-200' : 'bg-slate-50 border-slate-100'}`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-slate-800">Room {rev.roomNo}</span>
                                            <span className="text-xs text-slate-500 font-medium">({rev.name})</span>
                                        </div>
                                        {rev.isDue ? (
                                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-extrabold rounded-full animate-pulse">
                                                REVISION DUE
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                                In {rev.daysRemaining} days
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between text-xs pt-1">
                                        <span className="text-slate-500 font-medium">Current Rent: ₹{(rev.currentRent || 0).toLocaleString('en-IN')}</span>
                                        <span className="font-extrabold text-blue-700">Target (+10%): ₹{(rev.targetRent || 0).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

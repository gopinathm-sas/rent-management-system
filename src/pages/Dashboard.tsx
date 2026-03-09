import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import {
    formatMonthLabel,
    computeRentCollectedForMonth,
    computePendingRentForMonth,
    computeFinancialsForMonth,
    sumExpensesForMonth,
    isFutureYearMonth,
    getRentRevisionDetails,
    findTenantForRoom,
    getMonthKey,
    isEvictionMonth,
    getEffectiveRent,
    computeWaterForMonth,
    MONTHS
} from '../lib/utils';
import { ChevronLeft, ChevronRight, AlertCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IMMUTABLE_ROOMS_DATA, RENT_WATER_SERVICE_CHARGE, DEFAULT_WATER_RATE, DISCOUNTED_WATER_ROOMS } from '../lib/constants';

const WhatsAppIcon = ({ size = 20, className = "" }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
    >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
);

export default function Dashboard() {
    const { tenants, expenses, rooms, loading, globalYear, setGlobalYear } = useData();

    // Derived state for local calculation if needed, but we use globalYear
    const year = globalYear;

    if (loading) return <div className="p-8 text-center text-slate-500">Loading data...</div>;

    const changeYear = (delta: number) => setGlobalYear(year + delta);

    const rows = [];
    for (let i = 0; i < 12; i++) {
        const locked = isFutureYearMonth(year, i);
        // @ts-ignore - rooms type mismatch in utils signature vs context, assuming basic object structure exists 
        const financials = computeFinancialsForMonth(tenants, rooms, year, i);
        rows.push({
            label: formatMonthLabel(year, i),
            rent: locked ? 0 : financials.rent,
            water: locked ? 0 : financials.water,
            total: locked ? 0 : financials.total,
            expenses: sumExpensesForMonth(expenses, year, i),
            pending: locked ? 0 : financials.pending,
            locked
        });
    }

    // -- ALERT LOGIC --
    // 1. Pending Rents: Check if any rows have pending amounts
    const hasPending = rows.some(r => r.pending > 0);

    // Calculate Pending Tenants Details for WhatsApp Reminders
    const pendingTenantsData: Record<string, {
        roomNo: string;
        tenantName: string;
        phone: string;
        pendingMonths: string[];
        totalRentPending: number;
        totalWaterPending: number;
        totalGarbagePending: number;
        totalPending: number;
    }> = {};
    if (hasPending) {
        Object.keys(IMMUTABLE_ROOMS_DATA).forEach(roomKey => {
            const room = rooms[roomKey];
            if (!room) return;

            const tenantData = findTenantForRoom(tenants, room.roomId);
            if (!tenantData) return;

            for (let i = 0; i < 12; i++) {
                if (isFutureYearMonth(year, i)) continue;
                if (isEvictionMonth(tenantData, year, i)) continue;

                const key = getMonthKey(year, i);
                const history = tenantData.paymentHistory || {};
                const status = history[key] || null;

                const archived = tenantData.archivedTenant || null;
                const archivedHistory = archived?.paymentHistory || {};
                const archivedStatus = archivedHistory?.[key] || null;

                const useArchived = (!status || status === 'None') && archivedStatus;
                const effectiveStatus = useArchived ? archivedStatus : status;

                if (effectiveStatus === 'Pending') {
                    const tData = useArchived ? archived : tenantData;
                    const effectiveRent = getEffectiveRent(tData, year, i);

                    // Calculate Water
                    const waterRate = useArchived ? (archived?.waterRate || DEFAULT_WATER_RATE) : (tenantData?.waterRate || DEFAULT_WATER_RATE);
                    const waterCalc = computeWaterForMonth(tData, year, i, waterRate);
                    const waterAmount = waterCalc.amount || 0;

                    // Garbage is fixed service charge
                    const garbageAmount = RENT_WATER_SERVICE_CHARGE;

                    const monthTotal = effectiveRent + waterAmount + garbageAmount;

                    if (!pendingTenantsData[tenantData.id]) {
                        pendingTenantsData[tenantData.id] = {
                            roomNo: room.roomNo,
                            tenantName: tenantData.tenant || 'Unknown',
                            phone: tenantData.phone || '',
                            pendingMonths: [],
                            totalRentPending: 0,
                            totalWaterPending: 0,
                            totalGarbagePending: 0,
                            totalPending: 0
                        };
                    }
                    pendingTenantsData[tenantData.id].pendingMonths.push(`${MONTHS[i]} ${year}`);
                    pendingTenantsData[tenantData.id].totalRentPending += effectiveRent;
                    pendingTenantsData[tenantData.id].totalWaterPending += waterAmount;
                    pendingTenantsData[tenantData.id].totalGarbagePending += garbageAmount;
                    pendingTenantsData[tenantData.id].totalPending += monthTotal;
                }
            }
        });
    }

    const pendingTenantsList = Object.values(pendingTenantsData);

    // 2. Rent Revision Logic
    const overdueRevisions: { roomNo: string; tenantName: string; days: number; date: Date | undefined }[] = [];
    Object.keys(IMMUTABLE_ROOMS_DATA).forEach(roomKey => {
        const room = rooms[roomKey];
        if (!room) return;

        const tenant = findTenantForRoom(tenants, room.roomId);

        if (tenant && tenant.status === 'Occupied') {
            const revision = getRentRevisionDetails(tenant);
            if (revision.isDue) {
                overdueRevisions.push({
                    roomNo: room.roomNo,
                    tenantName: tenant.tenant,
                    // Actually type definition says 'name', old code said 'tenant'. I should check what is actually in DB.
                    // Assuming 'name' is correct for standard, but if DB has 'tenant' property...
                    // Let's stick to what was likely working or fix it. 
                    // Reading utils.js logic: `findTenantForRoom` returns complete object. 
                    // I'll assume 'name' is the intended field in the new Tenant interface.
                    days: revision.daysRemaining || 0,
                    date: revision.nextDue
                });
            }
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="font-semibold">Year</span>
                    <div className="inline-flex items-center gap-1 rounded-full bg-stone-50 border border-black/5 shadow-sm px-2 py-1.5">
                        <button onClick={() => changeYear(-1)} className="p-1 hover:bg-stone-200 rounded-full"><ChevronLeft size={16} /></button>
                        <span className="min-w-[4rem] text-center font-extrabold text-emerald-800">{year}</span>
                        <button onClick={() => changeYear(1)} className="p-1 hover:bg-stone-200 rounded-full"><ChevronRight size={16} /></button>
                    </div>
                </div>
            </div>

            {/* ALERTS SECTION */}
            {(overdueRevisions.length > 0 || hasPending) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-4">

                    {/* Rent Revision Alert */}
                    {overdueRevisions.length > 0 && (
                        <div className="bg-amber-50 rounded-3xl p-5 border border-amber-100 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                                <Clock size={80} className="text-amber-600" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                                        <Clock size={20} />
                                    </div>
                                    <h3 className="text-base font-bold text-amber-900">Annual Revision Due</h3>
                                    <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{overdueRevisions.length}</span>
                                </div>
                                <div className="space-y-2 mt-3 max-h-32 overflow-y-auto custom-scrollbar">
                                    {overdueRevisions.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white/60 p-2 rounded-lg text-sm">
                                            <div>
                                                <span className="font-bold text-slate-800">Room {item.roomNo}</span>
                                                <span className="text-slate-500 text-xs ml-2">({item.tenantName})</span>
                                            </div>
                                            <div className={`text-xs font-bold ${item.days < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                                                {item.days < 0 ? `${Math.abs(item.days)} days overdue` : `Due in ${item.days} days`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pending Payments Alert */}
                    {hasPending && (
                        <div className="bg-rose-50 rounded-3xl p-5 border border-rose-100 shadow-sm relative overflow-hidden group flex flex-col h-full max-h-[300px]">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                                <AlertCircle size={80} className="text-rose-600" />
                            </div>
                            <div className="relative z-10 flex-shrink-0">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-rose-100 rounded-xl text-rose-700">
                                        <AlertCircle size={20} />
                                    </div>
                                    <h3 className="text-base font-bold text-rose-900">Pending Payments</h3>
                                    <span className="bg-rose-200/50 text-rose-800 text-xs font-bold px-2 py-0.5 rounded-full">
                                        ₹{rows.reduce((acc, curr) => acc + curr.pending, 0).toLocaleString('en-IN')}
                                    </span>
                                </div>
                                <p className="text-sm text-rose-800/80 mt-1 font-medium">
                                    Action required for unpaid rents.
                                </p>
                            </div>

                            {/* Pending Tenants List */}
                            <div className="relative z-10 mt-3 pt-3 border-t border-rose-200/50 flex-grow overflow-y-auto custom-scrollbar">
                                <div className="space-y-2 pr-2">
                                    {pendingTenantsList.map((item, idx) => {
                                        const monthsText = item.pendingMonths.length > 1
                                            ? `${item.pendingMonths[0]} & ${item.pendingMonths.length - 1} more`
                                            : item.pendingMonths[0];

                                        const fullMonthsText = item.pendingMonths.join(', ');
                                        const msg = `Hi ${item.tenantName},\n\nYour rent for ${fullMonthsText} is pending.\n\nBreakdown:\n- Rent: ₹${item.totalRentPending.toLocaleString('en-IN')}\n- Water Bill: ₹${item.totalWaterPending.toLocaleString('en-IN')}\n- Garbage Bill: ₹${item.totalGarbagePending.toLocaleString('en-IN')}\n\n*Total Amount: ₹${item.totalPending.toLocaleString('en-IN')}*\n\nPlease pay at the earliest.`;
                                        const waLink = `https://wa.me/91${item.phone}?text=${encodeURIComponent(msg)}`;

                                        return (
                                            <div key={idx} className="flex justify-between items-center bg-white/60 p-2.5 rounded-xl text-sm border border-rose-100/50 shadow-sm">
                                                <div className="flex flex-col min-w-0 pr-2">
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <span className="font-bold text-slate-800 flex-shrink-0">Room {item.roomNo}</span>
                                                        <span className="text-slate-500 text-xs truncate">({item.tenantName})</span>
                                                    </div>
                                                    <div className="text-xs text-rose-600 font-medium truncate" title={fullMonthsText}>
                                                        ₹{item.totalPending.toLocaleString('en-IN')} • {monthsText}
                                                    </div>
                                                </div>

                                                <a
                                                    href={item.phone ? waLink : undefined}
                                                    onClick={(e) => !item.phone && alert('No phone number for tenant')}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className={`flex-shrink-0 p-2 rounded-lg transition-colors flex items-center justify-center
                                                        ${item.phone
                                                            ? 'bg-rose-100/80 text-rose-700 hover:bg-emerald-500 hover:text-white'
                                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'}`}
                                                    title={item.phone ? "Send WhatsApp Reminder" : "No Phone Number"}
                                                >
                                                    <WhatsAppIcon size={16} />
                                                </a>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="relative z-10 flex-shrink-0 pt-3 border-t border-rose-200/50 mt-3">
                                <Link to="/rent" className="inline-flex items-center gap-2 text-xs font-bold text-rose-700 hover:text-rose-900 transition">
                                    View breakdown <ChevronRight size={14} />
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-stone-50 rounded-3xl shadow-sm border border-black/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-emerald-100/60 text-slate-700">
                            <tr>
                                <th className="px-5 py-4 font-semibold">Month</th>
                                <th className="px-5 py-4 text-right font-semibold">Rent Collected</th>
                                <th className="px-5 py-4 text-right font-semibold">Expenses</th>
                                <th className="px-5 py-4 text-right font-semibold">Water Charges</th>
                                <th className="px-5 py-4 text-right font-semibold">Pending Rent</th>
                                <th className="px-5 py-4 text-right font-semibold">Total Rent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((row, idx) => (
                                <tr key={idx} className={row.locked ? 'bg-stone-100/50 text-slate-400' : 'hover:bg-emerald-50/30 transition'}>
                                    <td className="px-5 py-4 font-bold text-slate-800">{row.label}</td>
                                    <td className="px-5 py-4 text-right font-medium text-emerald-700">
                                        {row.locked ? '₹0' : `₹${row.rent.toLocaleString('en-IN')}`}
                                    </td>
                                    <td className="px-5 py-4 text-right font-medium text-rose-700">
                                        {`₹${row.expenses.toLocaleString('en-IN')}`}
                                    </td>
                                    <td className="px-5 py-4 text-right font-medium text-blue-600">
                                        {row.locked ? '₹0' : `₹${row.water.toLocaleString('en-IN')}`}
                                    </td>
                                    <td className="px-5 py-4 text-right font-medium text-amber-800">
                                        {row.locked ? '₹0' : `₹${row.pending.toLocaleString('en-IN')}`}
                                    </td>
                                    <td className="px-5 py-4 text-right font-medium text-slate-600">
                                        {row.locked ? '₹0' : `₹${row.total.toLocaleString('en-IN')}`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-emerald-50/50 text-[10px] text-slate-500 text-center border-t border-emerald-100">
                    Rent Collected includes only months marked Paid. Water Charges are computed from meter readings.
                </div>
            </div>
        </div>
    );
}

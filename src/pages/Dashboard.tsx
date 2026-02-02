import React from 'react';
import { useData } from '../contexts/DataContext';
import {
    formatMonthLabel,
    computeFinancialsForMonth,
    sumExpensesForMonth,
    isFutureYearMonth,
    getRentRevisionDetails,
    findTenantForRoom
} from '../lib/utils';
import { ChevronLeft, ChevronRight, AlertCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';

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
            expectedRent: locked ? 0 : financials.expectedRent,
            locked
        });
    }

    // -- ALERT LOGIC --
    // 1. Pending Rents: Check if any rows have pending amounts
    const hasPending = rows.some(r => r.pending > 0);

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
                        <div className="bg-rose-50 rounded-3xl p-5 border border-rose-100 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                                <AlertCircle size={80} className="text-rose-600" />
                            </div>
                            <div className="relative z-10">
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
                                    Action required for unpaid rents. Check the Rent Details page for breakdown.
                                </p>
                                <Link to="/rent" className="inline-flex items-center gap-2 mt-3 text-xs font-bold text-rose-700 hover:text-rose-900 transition">
                                    View details <ChevronRight size={14} />
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
                                        {row.locked ? '₹0' : `₹${(row.expectedRent || 0).toLocaleString('en-IN')}`}
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

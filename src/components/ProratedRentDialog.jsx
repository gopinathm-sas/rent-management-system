import React, { useState, useMemo } from 'react';
import { X, Calculator, Calendar, Minus, Plus } from 'lucide-react';
import { getDaysInMonth, getProratedRent } from '../lib/utils';

/**
 * ProratedRentDialog — appears when marking the first month as "Paid"
 * for a new tenant who joined mid-month.
 *
 * Props:
 *   tenant       — tenant object (needs .rent, .joinDate, .tenant name)
 *   year         — payment year
 *   monthIndex   — payment month (0-indexed)
 *   waterAmount  — total water amount (water.amount + service charge)
 *   onConfirm(deductionDays) — called with the deduction days when confirmed
 *   onCancel()   — called when dialog is dismissed
 */
export default function ProratedRentDialog({ tenant, year, monthIndex, waterAmount, onConfirm, onCancel }) {
    const [deductionDays, setDeductionDays] = useState(0);

    const rent = Number(tenant?.rent) || 0;
    const joinDate = tenant?.joinDate;
    const joinDay = new Date(joinDate).getDate();
    const daysInMonth = getDaysInMonth(year, monthIndex);
    const monthName = new Date(year, monthIndex).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    const calculation = useMemo(() => {
        const baseBillableDays = daysInMonth - (joinDay - 1);
        const finalBillableDays = Math.max(0, baseBillableDays - deductionDays);
        const proratedRent = getProratedRent(rent, joinDate, year, monthIndex, deductionDays);
        const totalPayable = proratedRent + (waterAmount || 0);
        return {
            baseBillableDays,
            finalBillableDays,
            perDayRent: Math.round((rent / daysInMonth) * 100) / 100,
            proratedRent,
            totalPayable
        };
    }, [rent, joinDate, year, monthIndex, deductionDays, daysInMonth, joinDay, waterAmount]);

    const maxDeduction = Math.max(0, daysInMonth - (joinDay - 1));

    const handleDeductionChange = (val) => {
        const n = Math.max(0, Math.min(maxDeduction, Number(val) || 0));
        setDeductionDays(n);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <Calculator size={20} />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-lg">Prorated Rent</h3>
                                <p className="text-sm text-white/80 font-medium">{monthName}</p>
                            </div>
                        </div>
                        <button
                            onClick={onCancel}
                            className="p-2 hover:bg-white/20 rounded-full transition"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Info Banner */}
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                        <p className="text-sm text-amber-800 font-medium">
                            <span className="font-bold">{tenant?.tenant || 'Tenant'}</span> joined on{' '}
                            <span className="font-bold">
                                {new Date(joinDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            . Rent is calculated for occupied days only.
                        </p>
                    </div>

                    {/* Calculation Breakdown */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-slate-500 font-medium">Monthly Rent</span>
                            <span className="text-sm font-bold text-slate-900">₹{rent.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-px bg-slate-100"></div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-slate-500 font-medium">Days in {monthName.split(' ')[0]}</span>
                            <span className="text-sm font-bold text-slate-900">{daysInMonth} days</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-slate-500 font-medium">Per Day Rent</span>
                            <span className="text-sm font-bold text-slate-900">₹{calculation.perDayRent.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-px bg-slate-100"></div>
                        <div className="flex justify-between items-center py-2">
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-emerald-500" />
                                <span className="text-sm text-slate-500 font-medium">
                                    Occupied from Day {joinDay} → {daysInMonth}
                                </span>
                            </div>
                            <span className="text-sm font-bold text-emerald-600">{calculation.baseBillableDays} days</span>
                        </div>

                        {/* Deduction Days Input */}
                        <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200">
                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3 block">
                                Deduction Days (Maintenance / Delay)
                            </label>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => handleDeductionChange(deductionDays - 1)}
                                    disabled={deductionDays <= 0}
                                    className="p-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Minus size={16} className="text-slate-600" />
                                </button>
                                <input
                                    type="number"
                                    min="0"
                                    max={maxDeduction}
                                    value={deductionDays}
                                    onChange={(e) => handleDeductionChange(e.target.value)}
                                    className="w-20 text-center bg-white border border-stone-200 rounded-xl px-3 py-2 text-lg font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                />
                                <button
                                    onClick={() => handleDeductionChange(deductionDays + 1)}
                                    disabled={deductionDays >= maxDeduction}
                                    className="p-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Plus size={16} className="text-slate-600" />
                                </button>
                                <span className="text-xs text-slate-400 font-medium ml-1">
                                    days
                                </span>
                            </div>
                            {deductionDays > 0 && (
                                <p className="text-xs text-amber-600 font-medium mt-2">
                                    Deducting {deductionDays} day{deductionDays > 1 ? 's' : ''} for maintenance/delay
                                </p>
                            )}
                        </div>

                        <div className="h-px bg-slate-100"></div>

                        {/* Final Billable Days */}
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-slate-500 font-bold">Final Billable Days</span>
                            <span className="text-sm font-extrabold text-slate-900">
                                {calculation.finalBillableDays} days
                            </span>
                        </div>

                        {/* Prorated Rent */}
                        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-emerald-800">Prorated Rent</span>
                                <span className="text-xl font-extrabold text-emerald-700">
                                    ₹{calculation.proratedRent.toLocaleString('en-IN')}
                                </span>
                            </div>
                            {waterAmount > 0 && (
                                <>
                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-emerald-200/50">
                                        <span className="text-xs text-emerald-600 font-medium">+ Water & Service</span>
                                        <span className="text-sm font-bold text-emerald-600">
                                            ₹{waterAmount.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-emerald-300/50">
                                        <span className="text-sm font-bold text-emerald-900">Total Payable</span>
                                        <span className="text-xl font-extrabold text-emerald-900">
                                            ₹{calculation.totalPayable.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        <p className="text-[11px] text-slate-400 font-medium text-center">
                            Formula: ₹{rent.toLocaleString('en-IN')} ÷ {daysInMonth} × {calculation.finalBillableDays} = ₹{calculation.proratedRent.toLocaleString('en-IN')}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-slate-700 font-bold rounded-xl transition text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(deductionDays)}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm shadow-emerald-200 transition text-sm"
                    >
                        Confirm & Mark Paid
                    </button>
                </div>
            </div>
        </div>
    );
}

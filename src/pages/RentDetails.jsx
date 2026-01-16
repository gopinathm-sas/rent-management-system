import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import {
    findTenantForRoom,
    isOccupiedRecord,
    MONTHS,
    isFutureYearMonth,
    getMonthKey,
    formatMonthLabel,
    computeWaterForMonth,
    DEFAULT_WATER_RATE,
    RENT_WATER_SERVICE_CHARGE
} from '../lib/utils';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import { ChevronLeft, ChevronRight, Check, X, Minus } from 'lucide-react';

export default function RentDetails() {
    const { rooms, tenants, loading, updateRentStatus, globalYear } = useData();
    const { showToast } = useUI();
    const year = globalYear;

    if (loading) return <div className="p-12 text-center text-slate-400">Loading rent details...</div>;

    // Use IMMUTABLE_ROOMS_DATA keys to strictly filter and map valid rooms
    const roomList = Object.keys(IMMUTABLE_ROOMS_DATA).map(key => rooms[key] || IMMUTABLE_ROOMS_DATA[key]).sort((a, b) =>
        String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true })
    );

    const handleCellClick = async (roomData, monthIndex, currentStatus) => {
        const tenantData = findTenantForRoom(tenants, roomData.roomId);
        if (!isOccupiedRecord(tenantData)) return; // Can't toggle for vacant

        const key = getMonthKey(year, monthIndex);

        // Strict Rule: Block Current and Future
        const currentD = new Date();
        const isCurrentOrFuture = isFutureYearMonth(year, monthIndex) || (year === currentD.getFullYear() && monthIndex === currentD.getMonth());

        if (isCurrentOrFuture) return; // Can't toggle future/current

        try {
            await updateRentStatus(roomData.roomId, key, currentStatus, tenantData, year, monthIndex);
        } catch (e) {
            showToast(e.message, 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-3xl font-extrabold text-slate-900">Rent Status</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="font-semibold">Year: {year}</span>
                    <span className="text-xs text-slate-400">(Change in Dashboard)</span>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-base text-left whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-2 py-4 border-r border-slate-200 sticky left-0 bg-slate-50 z-10 w-20 text-center">Room ID</th>
                                <th className="px-2 py-4 border-r border-slate-200 w-20 text-center">Room No</th>
                                <th className="px-4 py-4 border-r border-slate-200 w-40">Tenant</th>
                                {MONTHS.map(m => (
                                    <th key={m} className="px-1 py-4 text-center w-12">{m}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {roomList.map(room => {
                                const tenant = findTenantForRoom(tenants, room.roomId);
                                const isOccupied = isOccupiedRecord(tenant);
                                const tenantName = isOccupied ? (tenant?.tenant || 'Unknown') : 'Vacant';
                                const history = tenant?.paymentHistory || {};

                                return (
                                    <tr key={room.roomId} className={isOccupied ? 'hover:bg-slate-50' : 'bg-slate-50/50'}>
                                        <td className="px-2 py-4 border-r border-slate-100 font-bold text-blue-600 sticky left-0 bg-white z-10 text-center">
                                            {room.roomId}
                                        </td>
                                        <td className="px-2 py-4 border-r border-slate-100 font-medium text-center">
                                            {room.roomNo}
                                        </td>
                                        <td className={`px-4 py-4 border-r border-slate-100 font-medium truncate max-w-[160px] ${isOccupied ? 'text-slate-800' : 'text-slate-400 italic'}`} title={tenantName}>
                                            {tenantName}
                                        </td>
                                        {MONTHS.map((month, idx) => {
                                            const key = getMonthKey(year, idx);
                                            const status = history[key] || 'None';
                                            // Strict Rule: Can only mark rent for PAST months. Current and Future are locked.
                                            const currentD = new Date();
                                            const isCurrentMonth = year === currentD.getFullYear() && idx === currentD.getMonth();
                                            const isFuture = isFutureYearMonth(year, idx) || isCurrentMonth;

                                            let cellContent = <Minus size={14} className="mx-auto text-slate-300" />;
                                            let cellClass = "cursor-not-allowed bg-slate-100/50";

                                            if (isOccupied) {
                                                if (isFuture) {
                                                    cellContent = <Minus size={14} className="mx-auto text-slate-300" />;
                                                    cellClass = "cursor-not-allowed bg-slate-50";
                                                } else {
                                                    // Editable states

                                                    // Check if SD applies (Must be >= Notice Month)
                                                    let isSD = false;
                                                    if (tenant.isEvictionConfirmed) {
                                                        if (tenant.evictionNoticeDate) {
                                                            const nDate = new Date(tenant.evictionNoticeDate);
                                                            // Normalize to start of month for comparison
                                                            const noticeMonthStart = new Date(nDate.getFullYear(), nDate.getMonth(), 1);
                                                            const cellMonthStart = new Date(year, idx, 1);
                                                            if (cellMonthStart >= noticeMonthStart) {
                                                                isSD = true;
                                                            }
                                                        } else {
                                                            isSD = true; // Fallback 
                                                        }
                                                    }

                                                    if (isSD) {
                                                        // Automatically show SD if eviction confirmed and not explicitly Paid
                                                        cellContent = <span className="text-[10px] font-black text-cyan-600">SD</span>;
                                                        cellClass = "cursor-not-allowed bg-cyan-50";
                                                    } else if (status === 'Paid') {
                                                        cellContent = <Check size={16} className="mx-auto text-green-600" strokeWidth={3} />;
                                                        cellClass = "cursor-pointer bg-green-50 hover:bg-green-100";
                                                    } else if (status === 'Pending') {
                                                        cellContent = <X size={16} className="mx-auto text-amber-600" strokeWidth={3} />;
                                                        cellClass = "cursor-pointer bg-amber-50 hover:bg-amber-100";
                                                    } else if (status === 'Rent Only') {
                                                        cellContent = <Check size={16} className="mx-auto text-purple-600" strokeWidth={3} />;
                                                        cellClass = "cursor-pointer bg-purple-50 hover:bg-purple-100";
                                                    } else { // None
                                                        cellContent = <Minus size={14} className="mx-auto text-slate-400" />;
                                                        cellClass = "cursor-pointer bg-white hover:bg-slate-50";
                                                    }
                                                }
                                            }

                                            return (
                                                <td
                                                    key={key}
                                                    className={`px-1 py-4 border-r border-slate-100 text-center transition-colors ${cellClass}`}
                                                    onClick={() => handleCellClick(room, idx, status)}
                                                    title={isOccupied ? (isFuture ? 'Locked' : status) : 'Vacant'}
                                                >
                                                    {cellContent}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* RENT AND WATER DETAIL TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mt-8">
                <div className="p-6 border-b border-slate-100 bg-emerald-50/50">
                    <h3 className="text-xl font-bold text-emerald-900">Rent and Water</h3>
                    <p className="text-sm text-emerald-700 mt-1">
                        Auto-calculated from Rent Details.
                    </p>
                </div>
                <div className="overflow-x-auto text-sm">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-emerald-100 text-emerald-900 font-bold">
                            <tr>
                                <th className="px-2 py-4 sticky left-0 bg-emerald-100 z-10 w-20 text-center">Room ID</th>
                                <th className="px-2 py-4 border-r border-emerald-200/50 w-20 text-center">Room No</th>
                                <th className="px-4 py-4 border-r border-emerald-200/50 w-40">Tenant Name</th>
                                {/* Months Header */}
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <th key={i} className="px-1 py-4 text-center min-w-[70px]">
                                        {formatMonthLabel(year, i).split(' ')[0]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-50">
                            {roomList.map(room => {
                                const tenant = findTenantForRoom(tenants, room.roomId);
                                const isOccupied = tenant && tenant.status === 'Occupied';
                                return (
                                    <tr key={room.roomId} className="hover:bg-slate-50 transition">
                                        <td className="px-2 py-4 font-bold text-blue-600 sticky left-0 bg-white shadow-[1px_0_5px_-2px_rgba(0,0,0,0.1)] text-center">
                                            {room.roomId}
                                        </td>
                                        <td className="px-2 py-4 border-r border-slate-100 font-medium text-slate-700 text-center">
                                            {room.roomNo}
                                        </td>
                                        <td className="px-4 py-4 border-r border-slate-100 font-medium text-slate-900 truncate max-w-[160px]" title={isOccupied ? tenant.tenant : 'Vacant'}>
                                            {isOccupied ? tenant.tenant : <span className="text-slate-400 italic">Vacant</span>}
                                        </td>
                                        {Array.from({ length: 12 }).map((_, i) => {
                                            // Logic to get the total amount
                                            const key = `${year}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}`;
                                            let display = '-';
                                            let cellClass = "text-slate-300";

                                            if (tenant) {
                                                const history = tenant.paymentHistory || {};
                                                const totals = tenant.paymentTotals || {};
                                                const status = history[key];

                                                // Determine Effective Rent (Historical v/s Current)
                                                let effectiveRent = Number(tenant.rent);

                                                if (tenant.lastRevision) {
                                                    const revDate = new Date(tenant.lastRevision);
                                                    const cellDate = new Date(year, i, 1);
                                                    const revisionMonthStart = new Date(revDate.getFullYear(), revDate.getMonth(), 1);
                                                    const isBefore = cellDate < revisionMonthStart;

                                                    if (isBefore) {
                                                        effectiveRent = Number(tenant.lastRent) || effectiveRent;
                                                    }
                                                }

                                                // Calculate Water Component
                                                const finalWaterRate = tenant.waterRate || DEFAULT_WATER_RATE;
                                                const waterRes = computeWaterForMonth(tenant, year, i, finalWaterRate);
                                                const waterTotal = (waterRes.amount || 0) + RENT_WATER_SERVICE_CHARGE;

                                                // Eviction Rule
                                                let isEvictionMonth = false;
                                                if (tenant.isEvictionConfirmed && tenant.evictionNoticeDate) {
                                                    const nDate = new Date(tenant.evictionNoticeDate);
                                                    const cellDate = new Date(year, i, 1);
                                                    const noticeMonthStart = new Date(nDate.getFullYear(), nDate.getMonth(), 1);

                                                    if (cellDate >= noticeMonthStart) {
                                                        isEvictionMonth = true;
                                                        effectiveRent = 0; // For fallback
                                                    }
                                                }

                                                if (status === 'Paid') {
                                                    if (isEvictionMonth) {
                                                        // STRICT: Show 0 (None included)
                                                        display = '0';
                                                        cellClass = "text-slate-900 font-bold";
                                                    } else {
                                                        const total = totals[key];
                                                        if (Number.isFinite(total)) {
                                                            display = total.toLocaleString('en-IN');
                                                            cellClass = "text-slate-900 font-bold";
                                                        } else {
                                                            // Fallback using effective rent + water
                                                            display = (effectiveRent + waterTotal).toLocaleString('en-IN');
                                                            cellClass = "text-slate-900 font-bold";
                                                        }
                                                    }
                                                }
                                            }

                                            return (
                                                <td key={i} className={`px-1 py-4 text-center ${cellClass} border-r border-slate-50`}>
                                                    {display}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

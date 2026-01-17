import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import {
    findTenantForRoom,
    isOccupiedRecord,
    MONTHS,
    isFutureYearMonth,
    getMonthKey,
    getWaterMonthKey,
    computeWaterForMonth,
    getDefaultWaterRateForRoom,
    WATER_UNITS_MULTIPLIER,
    getPrevYearMonth
} from '../lib/utils';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import { ChevronLeft, ChevronRight, Droplets, RotateCcw, AlertTriangle, Save, Camera, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getMeterReadingFromImage } from '../services/gemini';

const WhatsAppIcon = ({ size = 24, className = "" }) => (
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

export default function WaterBill() {
    const { rooms, tenants, loading, globalYear } = useData();
    const { showToast, confirm } = useUI();
    const year = globalYear;

    // UI State for Modal
    const [editingCell, setEditingCell] = useState(null); // { roomId, roomNo, year, monthIndex, currentVal, prevVal, isReset }
    const [inputValue, setInputValue] = useState('');
    const [isResetChecked, setIsResetChecked] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    if (loading) return <div className="p-12 text-center text-slate-400">Loading water details...</div>;

    // Use IMMUTABLE_ROOMS_DATA keys to strictly filter and map valid rooms
    const roomList = Object.keys(IMMUTABLE_ROOMS_DATA).map(key => rooms[key] || IMMUTABLE_ROOMS_DATA[key]).sort((a, b) =>
        String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true })
    );

    const handleCellClick = (room, monthIndex, isFuture, canShowHistory, currentVal, existingReset, prevVal) => {
        if (!canShowHistory && !isOccupiedRecord(findTenantForRoom(tenants, room.roomId))) return; // Ignore if vacant and no history
        if (isFuture) return;

        setEditingCell({
            room,
            monthIndex,
            currentVal,
            prevVal,
            existingReset
        });
        setInputValue(currentVal ?? '');
        setIsResetChecked(!!existingReset); // Ensure boolean
    };

    const handleSave = async () => {
        if (!editingCell) return;
        const { room, monthIndex } = editingCell;

        try {
            const tenant = findTenantForRoom(tenants, room.roomId);
            if (!tenant || !tenant.id) throw new Error("Tenant record not found");

            const readingNum = Number(inputValue);
            if (inputValue !== '' && (!Number.isFinite(readingNum) || readingNum < 0)) {
                showToast("Please enter a valid non-negative reading", 'warning');
                return;
            }

            const key = getWaterMonthKey(year, monthIndex);

            // Validation regarding previous reading
            // If not reset, check if lower than previous
            if (!isResetChecked && inputValue !== '' && Number.isFinite(editingCell.prevVal)) {
                if (readingNum < editingCell.prevVal) {
                    const isConfirmed = await confirm({
                        title: 'Potential Meter Reset?',
                        message: `Reading (${readingNum}) is lower than previous (${editingCell.prevVal}).\n\nIs this a meter reset/replacement?`,
                        confirmText: 'Yes, Meter Reset',
                        cancelText: 'No, Save Anyway',
                        type: 'danger'
                    });

                    if (isConfirmed) {
                        setIsResetChecked(true);
                    }
                }
            }

            const updatePayload = {
                [`waterReadings.${key}`]: inputValue === '' ? null : readingNum,
                [`waterMeterReset.${key}`]: !!isResetChecked // Ensure strictly boolean
            };

            await updateDoc(doc(db, 'properties', tenant.id), updatePayload);
            setEditingCell(null);
            showToast("Water reading saved successfully", "success");
        } catch (e) {
            console.error(e);
            showToast("Error saving reading: " + e.message, "error");
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                // reader.result contains the data URL
                // We need to split it to get the base64 part
                const base64String = reader.result.toString().split(',')[1];
                const mimeType = file.type;

                const reading = await getMeterReadingFromImage(base64String, mimeType);

                if (reading !== null) {
                    setInputValue(reading.toString());
                    showToast("Reading extracted successfully!", "success");
                } else {
                    showToast("Could not extract reading. Please try again or enter manually.", "error");
                }
                setIsAnalyzing(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error(error);
            showToast("Error processing image: " + error.message, "error");
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6">

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-3xl font-extrabold text-slate-900">Water Bill</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="font-semibold">Year: {year}</span>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 border-r border-slate-200 sticky left-0 bg-slate-50 z-10 text-left min-w-[100px]">Room</th>
                                {MONTHS.map(m => (
                                    <th key={m} className="px-2 py-3 w-24">{m}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {roomList.map(room => {
                                const tenant = findTenantForRoom(tenants, room.roomId);
                                const isOccupied = isOccupiedRecord(tenant);
                                const hasWaterHistory = tenant?.waterReadings && Object.keys(tenant.waterReadings).length > 0;
                                const archivedName = tenant?.archivedTenant?.tenant || '';
                                const displayName = isOccupied ? (tenant?.tenant || 'Unknown') : (archivedName ? `${archivedName} (Vacated)` : 'Vacant');

                                return (
                                    <tr key={room.roomId} className="hover:bg-slate-50/50">
                                        <td className="px-4 py-3 border-r border-slate-100 sticky left-0 bg-white z-10 text-left">
                                            <div className="font-bold text-blue-600">{room.roomNo}</div>
                                            <div className="text-xs text-slate-500 truncate max-w-[120px]">{displayName}</div>
                                        </td>
                                        {MONTHS.map((month, idx) => {
                                            const isFuture = isFutureYearMonth(year, idx);
                                            const canShowHistory = isOccupied || hasWaterHistory;

                                            // Get Data
                                            const rate = Number(tenant?.waterRate);
                                            const effectiveRate = Number.isFinite(rate) ? rate : getDefaultWaterRateForRoom(room.roomNo);
                                            const result = computeWaterForMonth(tenant, year, idx, effectiveRate);

                                            const key = getWaterMonthKey(year, idx);
                                            const savedReading = tenant?.waterReadings?.[key];
                                            const isReset = (tenant?.waterMeterReset || {})[key];

                                            let cellContent = <span className="text-slate-300">-</span>;
                                            let cellClass = "bg-slate-50 text-slate-400 cursor-not-allowed";

                                            if (canShowHistory) {
                                                if (isFuture && isOccupied) {
                                                    cellContent = <span className="text-slate-300">-</span>;
                                                    cellClass = "bg-slate-100 text-slate-400 cursor-not-allowed";
                                                } else {
                                                    cellClass = "cursor-pointer bg-white hover:bg-blue-50 transition-colors";

                                                    if (result.units !== null && result.amount !== null) {
                                                        const isNegative = result.units < 0;
                                                        cellContent = (
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="font-extrabold text-blue-700">₹{result.amount}</span>
                                                                <span className={`text-[10px] ${isNegative ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                                                                    Units: {result.units}
                                                                </span>
                                                                {isReset && <span className="text-[9px] text-amber-600 font-bold flex items-center gap-0.5"><RotateCcw size={8} /> Reset</span>}
                                                            </div>
                                                        );
                                                        if (isNegative) cellClass += " bg-red-50 hover:bg-red-100";
                                                    } else if (Number.isFinite(Number(savedReading))) {
                                                        cellContent = (
                                                            <div className="flex flex-col items-center">
                                                                <span className="font-semibold text-slate-700">{savedReading}</span>
                                                                <span className="text-[9px] text-slate-400">reading</span>
                                                            </div>
                                                        );
                                                    } else {
                                                        cellContent = <span className="text-slate-200">—</span>;
                                                    }
                                                }
                                            }

                                            // Determine prev value for modal
                                            const prev = getPrevYearMonth(year, idx);
                                            const prevKey = getWaterMonthKey(prev.year, prev.monthIndex);
                                            const prevVal = Number(tenant?.waterReadings?.[prevKey]);

                                            return (
                                                <td
                                                    key={idx}
                                                    className={`px-1 py-2 border-r border-slate-100 h-16 align-middle ${cellClass}`}
                                                    onClick={() => handleCellClick(room, idx, (canShowHistory && isFuture && isOccupied), canShowHistory, savedReading, isReset, prevVal)}
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

            {/* Refactored Input Modal matching Legacy Design */}
            {editingCell && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[340px] overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="bg-white px-6 pt-6 pb-2">
                            <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">Water meter reading</h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">
                                Room {editingCell.room.roomNo} • {MONTHS[editingCell.monthIndex]} {year}
                            </p>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Previous Reading */}
                            <div className="space-y-1">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Previous month reading ({MONTHS[(editingCell.monthIndex - 1 + 12) % 12]} {editingCell.monthIndex === 0 ? year - 1 : year})</label>
                                <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-mono font-bold text-lg">
                                    {Number.isFinite(editingCell.prevVal) ? editingCell.prevVal : 'N/A'}
                                </div>
                            </div>

                            {/* Multiplier & Reset Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Units multiplier</label>
                                    <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-bold">
                                        ×{WATER_UNITS_MULTIPLIER}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Meter reset?</label>
                                    <select
                                        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                        value={isResetChecked ? "Yes" : "No"}
                                        onChange={(e) => setIsResetChecked(e.target.value === "Yes")}
                                    >
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>
                            </div>

                            {/* Current Reading Input with AI Scan */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-bold text-blue-900">Current reading</label>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            onChange={handleImageUpload}
                                            disabled={isAnalyzing}
                                        />
                                        {isAnalyzing ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Analyzing...
                                            </>
                                        ) : (
                                            <>
                                                <Camera size={14} />
                                                Scan Meter
                                            </>
                                        )}
                                    </label>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        autoFocus
                                        className="w-full px-4 py-3 rounded-xl border-2 border-blue-100 bg-blue-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-2xl font-mono font-bold text-blue-900 placeholder:text-blue-200 transition-all"
                                        placeholder="000"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions Footer */}
                        <div className="px-6 pb-6 flex items-center justify-end gap-3">
                            {/* Close Button */}
                            <button
                                onClick={() => setEditingCell(null)}
                                className="size-12 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all"
                                title="Close"
                            >
                                <span className="text-2xl leading-none">&times;</span>
                            </button>

                            {/* WhatsApp Button */}
                            {(() => {
                                const tenant = findTenantForRoom(tenants, editingCell.room.roomId);
                                const phone = tenant?.phone;
                                const readingVal = Number(inputValue);

                                let waLink = '#';
                                let isValidCalc = false;

                                if (!phone) {
                                    // No phone, disable or show error alert on click (handled by empty href usually)
                                } else if (inputValue !== '' && Number.isFinite(readingVal)) {
                                    // Calculate bill
                                    const prevVal = Number.isFinite(editingCell.prevVal) ? editingCell.prevVal : 0; // fallback 0 if missing? Legacy logic handled missing prev by blocking. 
                                    // But here let's assume if prevVal is missing, we can't calc unless reset.

                                    const isReset = isResetChecked; // Prioritize checkbox

                                    let units = null;
                                    if (isReset) {
                                        units = readingVal * WATER_UNITS_MULTIPLIER;
                                    } else if (Number.isFinite(editingCell.prevVal)) {
                                        units = (readingVal - editingCell.prevVal) * WATER_UNITS_MULTIPLIER;
                                    }

                                    if (units !== null && units >= 0) {
                                        const rate = Number(tenant?.waterRate);
                                        const effectiveRate = Number.isFinite(rate) ? rate : getDefaultWaterRateForRoom(editingCell.room.roomNo);
                                        const amount = Math.round(units * effectiveRate);

                                        const monthLabel = `${MONTHS[editingCell.monthIndex]} ${year}`;
                                        const msg = `Water Bill - ${monthLabel}\nNo of Ltrs - ${units}\nAmnt.        - ₹${amount}`;

                                        waLink = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
                                        isValidCalc = true;
                                    }
                                }

                                // Fallback: Request Reading
                                if (!isValidCalc && phone) {
                                    waLink = `https://wa.me/91${phone}?text=Hi, please send the water meter reading for ${MONTHS[editingCell.monthIndex]} ${year}.`;
                                }

                                return (
                                    <a
                                        href={phone ? waLink : undefined}
                                        onClick={(e) => !phone && alert('No phone number for tenant')}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="size-12 rounded-2xl flex items-center justify-center bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                        title={isValidCalc ? "Send Bill on WhatsApp" : "Request Reading on WhatsApp"}
                                    >
                                        <WhatsAppIcon />
                                    </a>
                                );
                            })()}

                            {/* Save Button */}
                            <button
                                onClick={handleSave}
                                className="size-12 rounded-2xl flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-200"
                                title="Save Recording"
                            >
                                <Save size={24} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

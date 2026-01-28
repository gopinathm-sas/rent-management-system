import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, User, CreditCard, Home, Edit2, Save, Link as LinkIcon, ExternalLink, Trash2, Copy, Check } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import {
    computeWaterForMonth,
    getDefaultWaterRateForRoom,
    MONTHS,
    formatMonthLabel,
    getMonthKey,
    getPrevYearMonth
} from '../lib/utils';

export default function RoomDetailsModal({ room, tenant, onClose }) {
    if (!room) return null;
    const { updateTenant, createTenant } = useData();
    const { showToast, confirm } = useUI();


    // Local Status State
    const initialStatus = tenant?.status || 'Vacant';
    const [status, setStatus] = useState(initialStatus);

    const isOccupied = status === 'Occupied';

    // Sync local status if prop changes
    React.useEffect(() => {
        setStatus(tenant?.status || 'Vacant');
    }, [tenant]);

    // Handle Escape Key to Close
    React.useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Accordion State
    const [expandedSection, setExpandedSection] = useState('tenant'); // 'tenant', 'financial', 'room'

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});

    // Handle Status Change
    const handleStatusChange = (e) => {
        const newStatus = e.target.value;
        setStatus(newStatus);

        if (newStatus === 'Occupied' && !tenant) {
            // Switching Vacant -> Occupied (New Tenant)
            setIsEditing(true);
            setEditForm({
                tenant: '',
                phone: '',
                email: '',
                rent: '',
                waterRate: '0.25',
                advance: '',
                lastRevision: '',
                joinDate: new Date().toISOString().split('T')[0],
                status: 'Occupied',
                roomNo: room.roomNo,
                roomId: room.roomId
            });
            setExpandedSection('tenant');
        } else if (newStatus === 'Vacant' && tenant) {
            // Reverting to Vacant (handled by Mark Vacant usually)
            // For now, valid selection
        }
    };

    const handleEditClick = () => {
        setEditForm({
            tenant: tenant?.tenant ?? '',
            phone: tenant?.phone ?? '',
            email: tenant?.email ?? '',
            rent: tenant?.rent ?? '',
            waterRate: tenant?.waterRate ?? '0.25',
            advance: tenant?.advance ?? '',
            lastRevision: tenant?.lastRevision ?? '',
            joinDate: tenant?.joinDate ?? ''
        });
        setIsEditing(true);
        setExpandedSection('tenant'); // Auto-expand tenant section
    };

    // Saving State
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = {
                ...editForm,
                status,
                isEvictionConfirmed,
                noRevision,
                // Save dates if eviction confirmed
                evictionNoticeDate: isEvictionConfirmed ? noticeDate : null,
                evictionDate: isEvictionConfirmed ? evictionDate : null
            };

            // Check if rent has changed (Revision) - Save old rent
            if (tenant?.rent && String(tenant.rent) !== String(payload.rent)) {
                payload.lastRent = tenant.rent;
            }

            // Ensure waterRate is saved (even if 0)
            if (payload.waterRate === undefined || payload.waterRate === '') {
                payload.waterRate = '0.25'; // Default fallback
            }

            if (tenant?.id) {
                // Update existing
                await updateTenant(tenant.id, payload);
                showToast("Tenant details updated successfully", "success");
            } else {
                // Create new tenant
                if (!room.roomId) throw new Error("Room ID missing");

                await createTenant({
                    ...payload,
                    status: 'Occupied',
                    roomId: room.roomId,
                    roomNo: room.roomNo
                });
                showToast("New tenant created successfully", "success");
            }
            setIsEditing(false);
            // Optionally close or rely on parent refresh
            if (!tenant?.id) onClose(); // Close modal after creating new tenant to force refresh
        } catch (error) {
            console.error("Failed to update/create tenant:", error);
            showToast("Failed to save: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    // Eviction State
    // Eviction & Revision State
    const [isEvictionConfirmed, setIsEvictionConfirmed] = useState(false);
    const [noRevision, setNoRevision] = useState(false);

    // Sync eviction/revision state from tenant when loaded
    React.useEffect(() => {
        if (tenant) {
            setIsEvictionConfirmed(!!tenant.isEvictionConfirmed);
            setNoRevision(!!tenant.noRevision);
            setNoticeDate(tenant.evictionNoticeDate || '');
            setEvictionDate(tenant.evictionDate || '');
        } else {
            setIsEvictionConfirmed(false);
            setNoRevision(false);
            setNoticeDate('');
            setEvictionDate('');
        }
    }, [tenant]);
    const [noticeDate, setNoticeDate] = useState('');
    const [evictionDate, setEvictionDate] = useState('');

    // Date Helpers
    const parseDate = (d) => new Date(d);
    const formatDateDisplay = (dStr) => {
        if (!dStr) return '-';
        const d = new Date(dStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Settlement Calculation
    const settlementData = useMemo(() => {
        if (!isOccupied || !noticeDate || !evictionDate) return null;

        const start = new Date(noticeDate);
        const end = new Date(evictionDate);
        const rent = Number(tenant.rent || 0);
        const deposit = Number(tenant.advance || 0); // Assuming 'advance' is security deposit

        const months = [];
        let current = new Date(start.getFullYear(), start.getMonth(), 1);
        const loopEnd = new Date(end.getFullYear(), end.getMonth(), 1);

        while (current <= loopEnd) {
            months.push({
                year: current.getFullYear(),
                monthIndex: current.getMonth(),
                label: formatMonthLabel(current.getFullYear(), current.getMonth())
            });
            current.setMonth(current.getMonth() + 1);
        }

        const monthsCount = months.length;
        const rentDeduction = monthsCount * rent;
        const mandatoryRent = rent; // 1 Month Mandatory as per screenshot

        // Calculate Water
        const waterRate = getDefaultWaterRateForRoom(room.roomNo);
        let totalWaterCost = 0;
        const serviceChargePerMonth = 60;
        let totalServiceCharge = monthsCount * serviceChargePerMonth; // Assuming service charge per month

        const monthDetails = months.map(m => {
            const waterData = computeWaterForMonth(tenant, m.year, m.monthIndex, waterRate);
            const waterCost = (waterData.amount || 0);
            totalWaterCost += waterCost;

            // Notes logic
            let notes = "";
            if (waterData.units !== null) {
                notes = `${waterData.units} units + ₹${serviceChargePerMonth}`;
            } else {
                notes = `Water data missing + ₹${serviceChargePerMonth}`;
            }

            return {
                ...m,
                rent,
                waterCost,
                totalWater: waterCost + serviceChargePerMonth, // Row usually shows water amount, notes explains split
                notes
            };
        });

        const waterAndServiceTotal = totalWaterCost + totalServiceCharge;
        const totalDue = rentDeduction + mandatoryRent + waterAndServiceTotal;
        const balance = totalDue - deposit; // Positive = Tenant Owes, Negative = Refund

        return {
            monthsCount,
            rentDeduction,
            mandatoryRent,
            waterAndServiceTotal,
            deposit,
            balance,
            monthDetails,
            isWaterComplete: monthDetails.every(m => !m.notes.includes('missing'))
        };

    }, [isOccupied, noticeDate, evictionDate, tenant, room.roomNo]);

    const toggleSection = (section) => {
        setExpandedSection(prev => prev === section ? null : section);
    };

    const handleInputChange = (fieldKey, value) => {
        // Validation for Phone: Numeric only & max 10 chars
        if (fieldKey === 'phone') {
            const numericValue = value.replace(/\D/g, ''); // Remove non-digits
            if (numericValue.length > 10) return; // Prevent >10
            setEditForm(prev => ({ ...prev, [fieldKey]: numericValue }));
            return;
        }
        setEditForm(prev => ({ ...prev, [fieldKey]: value }));
    };
    const sanitizePayload = (obj) => {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            if (value === undefined) {
                acc[key] = null;
            } else if (value && typeof value === 'object' && !(value instanceof Date)) {
                acc[key] = sanitizePayload(value);
            } else {
                acc[key] = value;
            }
            return acc;
        }, {});
    };

    const handleFinalizeEviction = async () => {
        const isConfirmed = await confirm({
            title: 'Finalize Eviction?',
            message: 'Are you sure you want to finalize this eviction? This will clear tenant data and mark the room as Vacant.',
            confirmText: 'Yes, Evict & Vacate',
            type: 'danger'
        });

        if (!isConfirmed) return;


        setIsSaving(true);
        try {
            const settlementSnapshot = {
                ...settlementData,
                vacatedDate: new Date().toISOString(),
                noticeDate,
                scheduledEvictionDate: evictionDate
            };

            const payload = {
                status: 'Vacant',
                isEvictionConfirmed: false,
                evictionNoticeDate: null,
                evictionDate: null,
                lastSettlement: settlementSnapshot,
            };

            const sanitizedPayload = sanitizePayload(payload);

            await updateTenant(tenant.id, sanitizedPayload);

            showToast("Eviction finalized & room marked vacant", "success");
            onClose();
        } catch (error) {
            console.error("Eviction error:", error);
            showToast("Failed to finalize eviction: " + error.message, "error");
        } finally {

            setIsSaving(false);
        }
    };

    const handleMarkVacant = async () => {
        const isConfirmed = await confirm({
            title: 'Mark Room Vacant?',
            message: 'This will remove the current tenant status. Ensure all dues are cleared before proceeding.',
            confirmText: 'Mark Vacant',
            type: 'danger'
        });

        if (!isConfirmed) return;


        setIsSaving(true);
        try {
            await updateTenant(tenant.id, {
                status: 'Vacant',
                isEvictionConfirmed: false
            });
            showToast("Room marked vacant", "success");
            onClose();
        } catch (error) {
            showToast("Failed to mark vacant", "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-stone-50 rounded-[2rem] shadow-2xl w-full max-w-lg h-[90vh] md:h-auto md:max-h-[90vh] overflow-y-auto flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-start p-6 pb-2 bg-stone-50 sticky top-0 z-10">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-2xl font-extrabold text-slate-900">Room {room.roomNo}</h3>
                            {isOccupied && (
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border border-emerald-200/50">Occupied</span>
                            )}
                        </div>
                        <p className="text-xs font-bold text-slate-400">ID: {room.roomId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isOccupied && !isEditing && (
                            <button
                                onClick={handleEditClick}
                                className="p-2 bg-white rounded-full hover:bg-stone-200 transition text-slate-400 border border-stone-100 shadow-sm"
                                title="Edit Tenant Details"
                            >
                                <Edit2 size={18} />
                            </button>
                        )}
                        {isEditing && (
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition shadow-sm flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                            >
                                <Save size={16} /> {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        )}
                        <button
                            onClick={() => { setIsEditing(false); onClose(); }}
                            className="p-2 bg-white rounded-full hover:bg-stone-200 transition text-slate-400 border border-stone-100 shadow-sm"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">

                    {/* Room Status Dropdown */}
                    <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1">Room Status</label>
                        <div className="relative">
                            <select
                                className="w-full appearance-none bg-stone-50 border border-stone-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                value={status}
                                onChange={handleStatusChange}
                            >
                                <option value="Occupied">Occupied - Tenant Present</option>
                                <option value="Vacant">Vacant - Ready for Tenant</option>
                                <option value="Maintenance">Maintenance - Not Available</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-3.5 text-slate-400 pointer-events-none" size={16} />
                        </div>
                    </div>

                    {/* Accordions */}
                    <div className="space-y-4">
                        {/* Tenant Information */}
                        <AccordionItem
                            id="tenant"
                            title="Tenant Information"
                            icon={User}
                            badge={isOccupied ? 'Occupied' : null}
                            expandedSection={expandedSection}
                            onToggle={toggleSection}
                        >
                            {isOccupied ? (
                                <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                                    <Field label="Tenant Name" value={tenant.tenant} fieldKey="tenant" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} />
                                    <Field label="Phone" value={tenant.phone} fieldKey="phone" type="tel" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} maxLength={10} />
                                    <Field label="Email" value={tenant.email} fieldKey="email" type="email" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} />
                                    <Field label="Move-in Date" value={tenant.joinDate} fieldKey="joinDate" type="date" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} />
                                    <Field label="Room ID" value={room.roomId} />
                                </div>
                            ) : (
                                <div className="text-center py-4 text-slate-400 text-sm">No tenant assigned.</div>
                            )}
                        </AccordionItem>

                        {/* Financial Details */}
                        <AccordionItem
                            id="financial"
                            title="Financial Details"
                            icon={CreditCard}
                            badge={(() => {
                                if (!isOccupied) return null;
                                if (isEvictionConfirmed) return 'Adjusted in SD';
                                // Dynamic Status check for Previous Month
                                const now = new Date();
                                const prev = getPrevYearMonth(now.getFullYear(), now.getMonth());
                                const k = getMonthKey(prev.year, prev.monthIndex);
                                const s = tenant?.paymentHistory?.[k];
                                return s === 'Paid' ? 'Paid' : 'Pending';
                            })()}
                            expandedSection={expandedSection}
                            onToggle={toggleSection}
                        >
                            {isOccupied ? (
                                <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                                    <Field label="Monthly Rent" value={`₹${Number(tenant.rent || 0).toLocaleString('en-IN')}`} fieldKey="rent" type="number" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} />
                                    <Field label="Water Rate (₹/Unit)" value={tenant.waterRate || '0.25'} fieldKey="waterRate" type="number" step="0.01" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} />
                                    <Field
                                        label={`Payment Status (${(() => {
                                            const now = new Date();
                                            const prev = getPrevYearMonth(now.getFullYear(), now.getMonth());
                                            return formatMonthLabel(prev.year, prev.monthIndex);
                                        })()})`}
                                        value={(() => {
                                            if (isEvictionConfirmed) return "Adjusted in SD";
                                            if (!tenant) return "Pending";
                                            const now = new Date();
                                            const prev = getPrevYearMonth(now.getFullYear(), now.getMonth());
                                            const k = getMonthKey(prev.year, prev.monthIndex);
                                            const s = tenant.paymentHistory?.[k];
                                            return s === 'Paid' ? "Paid" : "Pending";
                                        })()}
                                    />
                                    <Field label="Advance Amount" value={`₹${Number(tenant.advance || 0).toLocaleString('en-IN')}`} fieldKey="advance" type="number" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} />
                                    <Field label="Advance Balance" value={`₹${Number(tenant.advance || 0).toLocaleString('en-IN')}`} />
                                    <Field label="Last Rent Revision" value={tenant.lastRevision || 'N/A'} fieldKey="lastRevision" type="date" isEditing={isEditing} editForm={editForm} onChange={handleInputChange} />
                                    {tenant.lastRent && (
                                        <Field label="Last Recorded Rent" value={`₹${Number(tenant.lastRent).toLocaleString('en-IN')}`} />
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-slate-400 text-sm">No financial data.</div>
                            )}
                        </AccordionItem>



                        {/* Room Details */}
                        <AccordionItem
                            id="room"
                            title="Room Details"
                            icon={Home}
                            badge={null}
                            expandedSection={expandedSection}
                            onToggle={toggleSection}
                        >
                            <div className="grid grid-cols-1 gap-y-4">
                                {/* Status Badges Row */}
                                {/* Status Badges Row */}
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {isEvictionConfirmed ? (
                                        <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-600 text-[10px] font-bold uppercase border border-rose-100">Eviction: Pending</span>
                                    ) : (
                                        <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">Paid</span>
                                    )}
                                </div>
                                <Field label="Room Number" value={room.roomNo} />
                                <Field label="EB Service No" value={room.ebServNo} />
                            </div>
                        </AccordionItem>
                    </div>

                    {/* Checkboxes Group */}
                    <div className="space-y-3 pt-2">
                        <EvictionCheckBoxes
                            isOccupied={isOccupied}
                            isEvictionConfirmed={isEvictionConfirmed}
                            setIsEvictionConfirmed={setIsEvictionConfirmed}
                            noRevision={noRevision}
                            setNoRevision={setNoRevision}
                        />

                        {/* Eviction Logic Container */}
                        {isEvictionConfirmed && isOccupied && (
                            <div className="bg-stone-50 rounded-3xl p-6 border border-stone-200 mt-4 animate-in slide-in-from-top-4">
                                {/* Eviction Dates Inputs - Always show if confirmed */}
                                <div className="mb-8">
                                    <h4 className="font-bold text-slate-800 text-sm mb-4">Eviction dates</h4>
                                    <div className="grid grid-cols-2 gap-6 mb-4">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Eviction notice date</p>
                                            <input
                                                type="date"
                                                value={noticeDate}
                                                onChange={(e) => setNoticeDate(e.target.value)}
                                                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Eviction date</p>
                                            <input
                                                type="date"
                                                value={evictionDate}
                                                onChange={(e) => setEvictionDate(e.target.value)}
                                                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-3 font-medium">
                                        Step 1: Set Notice → Step 2: Set Eviction. When eviction date is reached, scheduler auto-vacates.
                                    </p>
                                </div>

                                {/* Settlement Calculation - Only show if dates selected & data valid */}
                                {settlementData && (
                                    <>
                                        <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm mb-6">
                                            <h4 className="font-bold text-slate-800 text-sm mb-1">Eviction Settlement (from deposit)</h4>
                                            <p className="text-[10px] text-slate-400 font-medium mb-4">
                                                Deduct rent + water + ₹60 service (full months), plus mandatory 1 month rent.
                                            </p>

                                            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Months (Notice → Vacate)</p>
                                                    <div className="text-2xl font-extrabold text-slate-900">{settlementData.monthsCount}</div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Mandatory 1 Month Rent</p>
                                                    <div className="text-xl font-bold text-slate-900">₹{settlementData.mandatoryRent.toLocaleString('en-IN')}</div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Rent Deduction ({settlementData.monthsCount} months)</p>
                                                    <div className="text-xl font-bold text-slate-900">₹{settlementData.rentDeduction.toLocaleString('en-IN')}</div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Water + Service (known)</p>
                                                    <div className="text-xl font-bold text-slate-900">₹{settlementData.waterAndServiceTotal.toLocaleString('en-IN')}</div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Security Deposit</p>
                                                    <div className="text-xl font-bold text-slate-900">₹{settlementData.deposit.toLocaleString('en-IN')}</div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Result (known)</p>
                                                    <div className={`text-xl font-extrabold ${settlementData.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {settlementData.balance > 0 ? 'Tenant owes' : 'Refund'}: ₹{Math.abs(settlementData.balance).toLocaleString('en-IN')}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Month-wise Table */}
                                            <div className="mt-6 bg-rose-50/50 rounded-xl overflow-hidden border border-rose-100">
                                                <div className="px-4 py-2 bg-rose-100/50 border-b border-rose-100">
                                                    <h5 className="text-xs font-bold text-rose-800">Month-wise deduction</h5>
                                                </div>
                                                <table className="w-full text-xs text-left">
                                                    <thead>
                                                        <tr className="text-slate-500 border-b border-rose-100/50">
                                                            <th className="px-4 py-2 font-bold">Month</th>
                                                            <th className="px-4 py-2 text-right font-bold">Rent</th>
                                                            <th className="px-4 py-2 text-right font-bold">Water</th>
                                                            <th className="px-4 py-2 font-bold">Notes</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-rose-100/50">
                                                        {settlementData.monthDetails.map((row, idx) => (
                                                            <tr key={idx} className="bg-white">
                                                                <td className="px-4 py-2 font-bold text-slate-800">{row.label}</td>
                                                                <td className="px-4 py-2 text-right font-medium text-slate-600">₹{row.rent.toLocaleString('en-IN')}</td>
                                                                <td className="px-4 py-2 text-right font-medium text-slate-600">₹{(row.waterCost).toLocaleString('en-IN')}</td>
                                                                <td className="px-4 py-2 text-slate-500">{row.notes}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <p className="text-[11px] text-slate-400 font-medium mb-4">
                                            {settlementData.isWaterComplete
                                                ? "All required water readings are available for the selected months."
                                                : "⚠️ Some water readings are missing. Please update them in Water Bill section."}
                                        </p>

                                        <button
                                            onClick={handleFinalizeEviction}
                                            disabled={isSaving}
                                            className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm shadow-rose-200 transition disabled:opacity-50"
                                        >
                                            {isSaving ? 'Processing...' : 'Finalize Settlement & Mark Vacant'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bottom Actions - Sticky/Fixed usually, but inline here for now */}
                    <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-stone-100">
                        <button className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl shadow-sm shadow-amber-200 transition">
                            Mark Rent Revised
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleMarkVacant}
                                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl shadow-sm shadow-rose-200 transition"
                            >
                                Mark Vacant
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm shadow-emerald-200 transition disabled:opacity-50"
                                title="Save Changes"
                            >
                                <Save size={20} />
                            </button>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2.5 bg-stone-100 hover:bg-stone-200 text-slate-600 rounded-xl transition"
                        >
                            <X size={18} />
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}

// Sub-component for checkboxes to keep clean
function EvictionCheckBoxes({ isOccupied, isEvictionConfirmed, setIsEvictionConfirmed, noRevision, setNoRevision }) {
    return (
        <>
            <label className={`flex items-start gap-3 p-1 cursor-pointer group ${!isOccupied ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="relative flex items-center">
                    <input
                        type="checkbox"
                        checked={isEvictionConfirmed}
                        onChange={(e) => setIsEvictionConfirmed(e.target.checked)}
                        className="peer size-5 appearance-none rounded-md border-2 border-slate-300 checked:bg-emerald-500 checked:border-emerald-500 transition cursor-pointer"
                    />
                    <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition" viewBox="0 0 14 14" fill="none">
                        <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <div>
                    <div className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition flex items-center gap-2">
                        Tenant confirmed eviction
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-0.5">
                        Enable eviction notice/date and deposit settlement controls.
                    </p>
                </div>
            </label>

            <label className="flex items-start gap-3 p-1 cursor-pointer group">
                <div className="relative flex items-center">
                    <input
                        type="checkbox"
                        checked={noRevision}
                        onChange={(e) => setNoRevision(e.target.checked)}
                        className="peer size-5 appearance-none rounded-md border-2 border-slate-300 checked:bg-emerald-500 checked:border-emerald-500 transition cursor-pointer"
                    />
                    <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition" viewBox="0 0 14 14" fill="none">
                        <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <div>
                    <div className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition">
                        No annual revision
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed mt-0.5">
                        Exclude from Rent Revision Due Soon list.
                    </p>
                </div>
            </label>
        </>
    );
}

const AccordionItem = ({ id, title, icon: Icon, badge, expandedSection, onToggle, children }) => {
    const isOpen = expandedSection === id;
    return (
        <div className={`bg-white rounded-3xl border transition-all duration-200 overflow-hidden ${isOpen ? 'border-emerald-500 shadow-md ring-1 ring-emerald-100' : 'border-stone-200'}`}>
            <button
                onClick={() => onToggle(id)}
                className="w-full flex items-center justify-between p-4 bg-white"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-slate-500'}`}>
                        <Icon size={18} />
                    </div>
                    <div className="text-left">
                        <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
                        <p className="text-[10px] text-slate-400 font-medium">Hover (or tap) to expand</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {badge && (
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${badge === 'Occupied' ? 'bg-emerald-100 text-emerald-700' :
                            badge === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-stone-100 text-slate-500'
                            }`}>
                            {badge}
                        </span>
                    )}
                    {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
            </button>

            {isOpen && (
                <div className="px-4 pb-5 pt-0 animate-in slide-in-from-top-2 duration-200">
                    <div className="h-px bg-stone-100 mb-4 mx-2"></div>
                    {children}
                </div>
            )}
        </div>
    );
}

function DocumentVaultSection({ tenant, updateTenant, showToast }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const documents = tenant?.documents || {};

    const generateLink = async () => {
        const token = crypto.randomUUID();
        try {
            await updateTenant(tenant.id, {
                uploadToken: token,
                uploadTokenCreatedAt: new Date().toISOString()
            });
            showToast("Secure upload link generated", "success");
        } catch (e) {
            showToast("Failed to generate link", "error");
        }
    };

    const copyLink = () => {
        const url = `${window.location.origin}/upload/${tenant.uploadToken}`;
        navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard", "success");
    };

    const shareViaEmail = () => {
        const url = `${window.location.origin}/upload/${tenant.uploadToken}`;
        const subject = `Document Upload Link for Room ${tenant.roomNo}`;
        const body = `Hi ${tenant.tenant},\n\nPlease use the following secure link to upload your documents (Aadhar, ID Proof, Agreement, Photo) for Room ${tenant.roomNo}.\n\n${url}\n\nThis link is valid for 24 hours.\n\nRegards,\nMunirathnam Illam`;
        window.open(`mailto:${tenant.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    };

    const deleteDoc = async (key) => {
        // ideally delete from storage too, but for now just unlink
        const newDocs = { ...documents };
        delete newDocs[key];
        try {
            await updateTenant(tenant.id, { documents: newDocs });
            showToast("Document removed", "success");
        } catch (e) {
            showToast("Failed to remove document", "error");
        }
    };

    return (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-6 bg-slate-50/50 hover:bg-slate-50 transition"
            >
                <div className="flex items-center gap-4">
                    <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                        <LinkIcon size={24} />
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-slate-900">Document Vault</h3>
                        <p className="text-xs text-slate-500">Manage tenant documents</p>
                    </div>
                </div>
                {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
            </button>

            {isExpanded && (
                <div className="p-6 border-t border-slate-100 animate-in slide-in-from-top-2">
                    {/* Link Generator */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Secure Upload Link</label>
                        {tenant?.uploadToken ? (
                            <div className="flex gap-2">
                                <div className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 truncate font-mono">
                                    {window.location.origin}/upload/{tenant.uploadToken}
                                </div>
                                <button onClick={copyLink} className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition" title="Copy Link">
                                    <Copy size={18} />
                                </button>
                                <button onClick={shareViaEmail} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition" title="Share via Email">
                                    <ExternalLink size={18} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={generateLink}
                                className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition"
                            >
                                Generate Link
                            </button>
                        )}
                        <p className="text-[10px] text-slate-400 mt-2">
                            Link expires in 24 hours. Tenant needs Google Sign-in to access.
                        </p>
                    </div>

                    {/* Documents List */}
                    <div className="space-y-3">
                        {/* Family Members Display */}
                        {tenant.familyMembers && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                                <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Family Contacts</h4>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{tenant.familyMembers}</p>
                            </div>
                        )}

                        <DocItem title="Tenant Photo" docUrl={documents.photo} onDelete={() => deleteDoc('photo')} />
                        <DocItem title="Aadhar Card" docUrl={documents.aadhar} onDelete={() => deleteDoc('aadhar')} />
                        <DocItem title="ID Proof" docUrl={documents.pan} onDelete={() => deleteDoc('pan')} />
                        <DocItem title="Rental Agreement" docUrl={documents.agreement} onDelete={() => deleteDoc('agreement')} />
                    </div>
                </div>
            )}
        </div>
    );
}

function DocItem({ title, docUrl, onDelete }) {
    return (
        <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${docUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {docUrl ? <Check size={16} /> : <User size={16} />}
                </div>
                <div>
                    <div className="font-bold text-sm text-slate-700">{title}</div>
                    <div className="text-[10px] text-slate-400">{docUrl ? 'Uploaded' : 'Pending'}</div>
                </div>
            </div>
            {docUrl && (
                <div className="flex gap-2">
                    <a
                        href={docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="View Document"
                    >
                        <ExternalLink size={16} />
                    </a>
                    <button
                        onClick={onDelete}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                        title="Remove Document"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};

const Field = ({ label, value, fieldKey, type = "text", step, isEditing, editForm, onChange, maxLength }) => (
    <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
        {isEditing && fieldKey ? (
            <input
                type={type}
                step={step}
                maxLength={maxLength}
                value={editForm[fieldKey] || ''}
                onChange={(e) => onChange(fieldKey, e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
            />
        ) : (
            <div className="text-sm font-bold text-slate-800 break-words">{value || 'N/A'}</div>
        )}
    </div>
);

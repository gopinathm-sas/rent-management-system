import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../contexts/DataContext';
import { findTenantForRoom, isOccupiedRecord, computeFinancialsForMonth } from '../lib/utils';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import { Users, Save, X, Link as LinkIcon, ExternalLink, Copy, Check, Trash2, ChevronUp, ChevronDown, User, Mail, Send, FileText, ChevronLeft, ChevronRight, Plus, Sparkles, Clipboard, Upload, Loader2 } from 'lucide-react';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import RoomCard from '../components/RoomCard'; // Reusing RoomCard for consistent layout
import { getClearedDocumentUploadFields, hasActiveDocumentUploadData } from '../lib/tenantDocuments';
import { analyzeBudgetSpreadsheet } from '../services/gemini';
import { uploadToCloudinary } from '../services/cloudinary';

export default function Admin() {
    const { rooms, tenants, loading } = useData();
    const { showToast } = useUI();
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' or 'stats'

    if (loading) return <div className="p-12 text-center text-slate-400">Loading admin panel...</div>;

    const floors = [
        { name: 'Ground Floor', rooms: ['01', '02'] },
        { name: '1st Floor', rooms: ['04'] },
        { name: '2nd Floor', rooms: ['05', '06', '07'] },
        { name: '3rd Floor', rooms: ['08', '09', '10'] },
        { name: '4th Floor', rooms: ['11', '12', '13'] },
    ];

    const handleRoomClick = (room, tenant) => {
        setSelectedRoom({ room, tenant });
    };

    return (
        <div className="space-y-8 pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <h2 className="text-3xl font-extrabold text-slate-900">Admin</h2>
                <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl self-start sm:self-auto">
                    <button
                        onClick={() => setActiveTab('rooms')}
                        className={`px-5 py-2.5 font-bold text-sm rounded-xl transition-all ${
                            activeTab === 'rooms'
                                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-100'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Rooms
                    </button>
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`px-5 py-2.5 font-bold text-sm rounded-xl transition-all ${
                            activeTab === 'stats'
                                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-100'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Stats (Budgeting)
                    </button>
                </div>
            </div>

            {activeTab === 'rooms' ? (
                <>
                    {/* Room Layout Grid */}
                    <div className="space-y-8 bg-stone-50/50 p-6 rounded-3xl border border-stone-100 animate-in fade-in duration-350">
                        {floors.map((floor) => (
                            <div key={floor.name} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-1 flex items-center">
                                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{floor.name}</span>
                                </div>
                                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {floor.rooms.map(roomNo => {
                                        const room = rooms[roomNo];
                                        const tenant = findTenantForRoom(tenants, room?.roomId);
                                        return (
                                            <RoomCard
                                                key={roomNo}
                                                roomNo={roomNo}
                                                roomData={room}
                                                tenantData={tenant}
                                                rentStatus={null}
                                                isPlaceholder={!room}
                                                onClick={() => handleRoomClick(room, tenant)}
                                                showStatus={false} // Don't show rent status tags
                                            />
                                        )
                                    })}
                                    {/* Fillers for alignment */}
                                    {Array.from({ length: 3 - floor.rooms.length }).map((_, i) => (
                                        <RoomCard key={`placeholder-${i}`} isPlaceholder={true} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Simplified Admin Modal */}
                    {selectedRoom && (
                        <AdminRoomModal
                            room={selectedRoom.room}
                            tenant={findTenantForRoom(tenants, selectedRoom.room?.roomId)}
                            onClose={() => setSelectedRoom(null)}
                            showToast={showToast}
                            updateTenant={useData().updateTenant}
                        />
                    )}
                </>
            ) : (
                <div className="animate-in fade-in duration-350">
                    <BudgetStatsTab tenants={tenants} rooms={rooms} showToast={showToast} />
                </div>
            )}
        </div>
    );
}

// Stats / Personal Budgeting Helper Components
// Stats / Personal Budgeting Helper Components
const TableHeader = ({ title }) => (
    <>
        <colgroup>
            <col className="w-[58%]" />
            <col className="w-[42%]" />
        </colgroup>
        <thead className="bg-blue-600 text-white font-extrabold text-xs select-none">
            <tr>
                <th className="p-2 text-left tracking-wide rounded-tl-xl">{title}</th>
                <th className="p-2 text-right tracking-wide rounded-tr-xl">Amount (₹)</th>
            </tr>
        </thead>
    </>
);

const SpreadsheetRow = ({ label, value, onChange, isFormula = false }) => (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
        <td className="p-1.5 text-slate-700 font-bold text-xs select-none pl-3 truncate">{label}</td>
        <td className="p-0.5 text-right">
            {isFormula ? (
                <span className="font-mono font-bold text-xs text-slate-800 pr-3 block">
                    {Number(value || 0).toLocaleString('en-IN')}
                </span>
            ) : (
                <input
                    type="number"
                    value={value === 0 ? '' : value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="w-full bg-transparent font-mono text-right pr-3 font-bold text-xs text-slate-800 focus:outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-blue-400 rounded py-1 transition-all"
                    placeholder="0"
                />
            )}
        </td>
    </tr>
);

const EditableSpreadsheetRow = ({ label, onLabelChange, value, onValueChange, onDelete, isFormula = false }) => (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
        <td className="p-0.5 text-left flex items-center gap-1">
            {onDelete && (
                <button
                    onClick={onDelete}
                    className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition-all shrink-0"
                    title="Delete Row"
                >
                    <Trash2 size={12} />
                </button>
            )}
            {onLabelChange ? (
                <input
                    type="text"
                    value={label}
                    onChange={(e) => onLabelChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="w-full bg-transparent font-bold text-xs text-slate-700 focus:outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-blue-400 rounded py-1 px-1.5 transition-all"
                    placeholder="Enter description"
                />
            ) : (
                <span className="p-1.5 font-bold text-xs text-slate-700 select-none pl-2 truncate">{label}</span>
            )}
        </td>
        <td className="p-0.5 text-right">
            {isFormula ? (
                <span className="font-mono font-bold text-xs text-slate-800 pr-3 block">
                    {Number(value || 0).toLocaleString('en-IN')}
                </span>
            ) : (
                <input
                    type="number"
                    value={value === 0 ? '' : value}
                    onChange={(e) => onValueChange(Number(e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="w-full bg-transparent font-mono text-right pr-3 font-bold text-xs text-slate-800 focus:outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-blue-400 rounded py-1 transition-all"
                    placeholder="0"
                />
            )}
        </td>
    </tr>
);

const AddRowButton = ({ onClick }) => (
    <tr>
        <td colSpan="2" className="p-0">
            <button
                onClick={onClick}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition border-t border-slate-100 select-none"
            >
                <Plus size={14} /> Add Row
            </button>
        </td>
    </tr>
);

function BudgetStatsTab({ tenants, rooms, showToast }) {
    const MONTHS_ARRAY = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    const currentMonthIndex = new Date().getMonth();

    const [year, setYear] = useState(currentYear);
    const [monthIndex, setMonthIndex] = useState(currentMonthIndex);
    const [loadingData, setLoadingData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [showImportMenu, setShowImportMenu] = useState(false);
    const fileInputRef = useRef(null);

    const monthKey = `${year}-${MONTHS_ARRAY[monthIndex]}`;

    const createId = () => Math.random().toString(36).substring(2, 9);

    const getDefaultOtherCredits = () => [
        { id: createId(), label: "1 RK Advance", value: 0 }
    ];

    const getDefaultDebits = () => [
        { id: createId(), label: "Housing Loan", value: 0 },
        { id: createId(), label: "Fullerton PL", value: 0 },
        { id: createId(), label: "Amma's PL", value: 0 },
        { id: createId(), label: "MF's", value: 0 },
        { id: createId(), label: "PPF", value: 0 },
        { id: createId(), label: "10 L", value: 0 },
        { id: createId(), label: "Other", value: 0 },
        { id: createId(), label: "Gold SIP", value: 0 },
        { id: createId(), label: "SizeU Payback", value: 0 },
        { id: createId(), label: "Ramya's Payback", value: 0 }
    ];

    const getDefaultCcBills = () => [
        { id: createId(), label: "HDFC Credit Card", value: 0 },
        { id: createId(), label: "HDFC UPI", value: 0 },
        { id: createId(), label: "IDFC 54", value: 0 },
        { id: createId(), label: "IDFC 97", value: 0 },
        { id: createId(), label: "Axis ACE", value: 0 },
        { id: createId(), label: "Indus Ind", value: 0 },
        { id: createId(), label: "Indus Ind Legend", value: 0 },
        { id: createId(), label: "Kotak 59", value: 0 },
        { id: createId(), label: "Kotak 74", value: 0 },
        { id: createId(), label: "Jupiter", value: 0 },
        { id: createId(), label: "Axis RuPay 6700", value: 0 },
        { id: createId(), label: "ICICI", value: 0 },
        { id: createId(), label: "Axis Neo", value: 0 }
    ];

    const getDefaultOtherDebits = () => [
        { id: createId(), label: "Vanitha Pay", value: 0 }
    ];

    const [credits, setCredits] = useState({
        rents: 0,
        waterGarbage: 0,
        freelance: 0,
        sal: 0,
        othersCredits: 0
    });

    const [otherCredits, setOtherCredits] = useState([]);
    const [debits, setDebits] = useState([]);
    const [ccBills, setCcBills] = useState([]);
    const [otherDebits, setOtherDebits] = useState([]);

    const autoFinancials = computeFinancialsForMonth(tenants, rooms, year, monthIndex);
    const autoRents = autoFinancials.rent;
    const autoWater = autoFinancials.water;

    useEffect(() => {
        const fetchBudgetData = async () => {
            setLoadingData(true);
            try {
                const docRef = doc(db, 'budgetStats', monthKey);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setCredits(prev => ({ ...prev, ...data.credits }));

                    if (Array.isArray(data.otherCreditsNew)) {
                        setOtherCredits(data.otherCreditsNew);
                    } else if (data.otherCreditLabel !== undefined) {
                        setOtherCredits([{ id: createId(), label: data.otherCreditLabel, value: data.otherCreditVal || 0 }]);
                    } else if (data.otherCredits?.oneRkAdvance !== undefined) {
                        setOtherCredits([{ id: createId(), label: "1 RK Advance", value: data.otherCredits.oneRkAdvance }]);
                    } else {
                        setOtherCredits(getDefaultOtherCredits());
                    }

                    if (Array.isArray(data.debitsNew)) {
                        setDebits(data.debitsNew);
                    } else if (data.debits) {
                        const cleanDebits = [];
                        Object.entries(data.debits)
                            .filter(([k]) => k !== 'creditCardBills' && k !== 'other')
                            .forEach(([k, v]) => {
                                cleanDebits.push({
                                    id: createId(),
                                    label: k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                                    value: Number(v) || 0
                                });
                            });
                        cleanDebits.push({
                            id: createId(),
                            label: data.debitOtherLabel || "Other",
                            value: data.debitOtherVal !== undefined ? data.debitOtherVal : (Number(data.debits.other) || 0)
                        });
                        setDebits(cleanDebits);
                    } else {
                        setDebits(getDefaultDebits());
                    }

                    if (Array.isArray(data.ccBillsNew)) {
                        setCcBills(data.ccBillsNew);
                    } else if (data.ccBills) {
                        const cleanCc = Object.entries(data.ccBills).map(([k, v]) => ({
                            id: createId(),
                            label: k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                            value: Number(v) || 0
                        }));
                        setCcBills(cleanCc);
                    } else {
                        setCcBills(getDefaultCcBills());
                    }

                    if (Array.isArray(data.otherDebitsNew)) {
                        setOtherDebits(data.otherDebitsNew);
                    } else if (data.otherDebitLabel !== undefined) {
                        setOtherDebits([{ id: createId(), label: data.otherDebitLabel, value: data.otherDebitVal || 0 }]);
                    } else if (data.otherDebits?.vanithaPay !== undefined) {
                        setOtherDebits([{ id: createId(), label: "Vanitha Pay", value: data.otherDebits.vanithaPay }]);
                    } else {
                        setOtherDebits(getDefaultOtherDebits());
                    }
                } else {
                    setCredits({
                        rents: autoRents,
                        waterGarbage: autoWater,
                        freelance: 0,
                        sal: 0,
                        othersCredits: 0
                    });
                    setOtherCredits(getDefaultOtherCredits());
                    setDebits(getDefaultDebits());
                    setCcBills(getDefaultCcBills());
                    setOtherDebits(getDefaultOtherDebits());
                }
                setIsDirty(false);
            } catch (err) {
                console.error("Error loading budget data:", err);
                showToast("Failed to load budget data", "error");
            } finally {
                setLoadingData(false);
            }
        };

        fetchBudgetData();
    }, [monthKey, tenants, rooms]);

    useEffect(() => {
        const handlePaste = async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (!file) continue;

                    setIsScanning(true);
                    try {
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                            try {
                                const base64Data = reader.result.split(',')[1];
                                const result = await analyzeBudgetSpreadsheet(base64Data, file.type);
                                if (result) {
                                    if (result.credits) {
                                        setCredits(prev => ({ ...prev, ...result.credits }));
                                    }
                                    if (Array.isArray(result.otherCreditsNew)) {
                                        setOtherCredits(result.otherCreditsNew.map(item => ({ ...item, id: createId() })));
                                    }
                                    if (Array.isArray(result.debitsNew)) {
                                        setDebits(result.debitsNew.map(item => ({ ...item, id: createId() })));
                                    }
                                    if (Array.isArray(result.ccBillsNew)) {
                                        setCcBills(result.ccBillsNew.map(item => ({ ...item, id: createId() })));
                                    }
                                    if (Array.isArray(result.otherDebitsNew)) {
                                        setOtherDebits(result.otherDebitsNew.map(item => ({ ...item, id: createId() })));
                                    }

                                    setIsDirty(true);
                                    showToast("Clipboard screenshot scanned and populated!", "success");
                                } else {
                                    showToast("Failed to parse data from pasted image", "error");
                                }
                            } catch (err) {
                                console.error(err);
                                showToast("Failed to parse pasted image: " + err.message, "error");
                            } finally {
                                setIsScanning(false);
                            }
                        };
                        reader.readAsDataURL(file);
                    } catch (err) {
                        console.error(err);
                        setIsScanning(false);
                    }
                    break;
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [tenants, rooms, monthKey]);

    const handlePasteFromClipboard = async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        setIsScanning(true);

                        const reader = new FileReader();
                        reader.onloadend = async () => {
                            try {
                                const base64Data = reader.result.split(',')[1];
                                const result = await analyzeBudgetSpreadsheet(base64Data, type);
                                if (result) {
                                    if (result.credits) {
                                        setCredits(prev => ({ ...prev, ...result.credits }));
                                    }
                                    if (Array.isArray(result.otherCreditsNew)) {
                                        setOtherCredits(result.otherCreditsNew.map(item => ({ ...item, id: createId() })));
                                    }
                                    if (Array.isArray(result.debitsNew)) {
                                        setDebits(result.debitsNew.map(item => ({ ...item, id: createId() })));
                                    }
                                    if (Array.isArray(result.ccBillsNew)) {
                                        setCcBills(result.ccBillsNew.map(item => ({ ...item, id: createId() })));
                                    }
                                    if (Array.isArray(result.otherDebitsNew)) {
                                        setOtherDebits(result.otherDebitsNew.map(item => ({ ...item, id: createId() })));
                                    }

                                    setIsDirty(true);
                                    showToast("Clipboard screenshot scanned and populated!", "success");
                                } else {
                                    showToast("Failed to parse data from clipboard image", "error");
                                }
                            } catch (err) {
                                console.error(err);
                                showToast("Failed to parse clipboard image: " + err.message, "error");
                            } finally {
                                setIsScanning(false);
                            }
                        };
                        reader.readAsDataURL(blob);
                        return;
                    }
                }
            }
            showToast("No image found in clipboard. Copy a screenshot first!", "warning");
        } catch (err) {
            console.error("Clipboard read failed", err);
            showToast("Clipboard access denied. Try using Cmd+V / Ctrl+V to paste directly.", "warning");
        }
    };

    const addRow = (setter) => {
        setter(prev => [...prev, { id: createId(), label: "", value: 0 }]);
        setIsDirty(true);
    };

    const deleteRow = (setter, id) => {
        setter(prev => prev.filter(item => item.id !== id));
        setIsDirty(true);
    };

    const updateRowField = (setter, id, field, val) => {
        setter(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
        setIsDirty(true);
    };

    const totalCcBills = ccBills.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const totalOtherDebits = otherDebits.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const totalOtherCredits = otherCredits.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

    const totalCredits = 
        (Number(credits.rents) || 0) +
        (Number(credits.waterGarbage) || 0) +
        (Number(credits.freelance) || 0) +
        (Number(credits.sal) || 0) +
        totalOtherCredits;

    const totalDebits = 
        debits.reduce((sum, item) => sum + (Number(item.value) || 0), 0) + 
        totalCcBills + 
        totalOtherDebits;

    const currentMonthBalance = totalCredits - totalDebits;
    const netBalance = totalCredits - totalDebits;
    const netBalanceWithoutCc = totalCredits - (totalDebits - totalCcBills);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const docRef = doc(db, 'budgetStats', monthKey);
            await setDoc(docRef, {
                monthKey,
                credits,
                otherCreditsNew: otherCredits,
                debitsNew: debits,
                ccBillsNew: ccBills,
                otherDebitsNew: otherDebits
            }, { merge: true });
            setIsDirty(false);
            showToast("Budget saved successfully", "success");
        } catch (err) {
            console.error("Error saving budget:", err);
            showToast("Failed to save budget settings", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handlePrevMonth = () => {
        if (monthIndex === 0) {
            setMonthIndex(11);
            setYear(year - 1);
        } else {
            setMonthIndex(monthIndex - 1);
        }
    };

    const handleNextMonth = () => {
        if (monthIndex === 11) {
            setMonthIndex(0);
            setYear(year + 1);
        } else {
            setMonthIndex(monthIndex + 1);
        }
    };

    const updateCreditField = (field, value) => {
        setCredits(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleCopyFromPrevMonth = async () => {
        let prevMonthIndex = monthIndex - 1;
        let prevYear = year;
        if (prevMonthIndex < 0) {
            prevMonthIndex = 11;
            prevYear = year - 1;
        }
        const prevMonthKey = `${prevYear}-${MONTHS_ARRAY[prevMonthIndex]}`;

        try {
            const docRef = doc(db, 'budgetStats', prevMonthKey);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Copy freelance, sal, othersCredits but keep current month's auto rents and water
                setCredits(prev => ({
                    ...prev,
                    freelance: data.credits?.freelance || 0,
                    sal: data.credits?.sal || 0,
                    othersCredits: data.credits?.othersCredits || 0
                }));

                // Copy arrays mapping with new unique IDs to prevent React key collision
                if (Array.isArray(data.otherCreditsNew)) {
                    setOtherCredits(data.otherCreditsNew.map(item => ({ ...item, id: createId() })));
                } else if (data.otherCreditLabel !== undefined) {
                    setOtherCredits([{ id: createId(), label: data.otherCreditLabel, value: data.otherCreditVal || 0 }]);
                }
                
                if (Array.isArray(data.debitsNew)) {
                    setDebits(data.debitsNew.map(item => ({ ...item, id: createId() })));
                } else if (data.debits) {
                    const cleanDebits = [];
                    Object.entries(data.debits)
                        .filter(([k]) => k !== 'creditCardBills' && k !== 'other')
                        .forEach(([k, v]) => {
                            cleanDebits.push({
                                id: createId(),
                                label: k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                                value: Number(v) || 0
                            });
                        });
                    cleanDebits.push({
                        id: createId(),
                        label: data.debitOtherLabel || "Other",
                        value: data.debitOtherVal !== undefined ? data.debitOtherVal : (Number(data.debits.other) || 0)
                    });
                    setDebits(cleanDebits);
                }
                
                if (Array.isArray(data.ccBillsNew)) {
                    setCcBills(data.ccBillsNew.map(item => ({ ...item, id: createId() })));
                } else if (data.ccBills) {
                    const cleanCc = Object.entries(data.ccBills).map(([k, v]) => ({
                        id: createId(),
                        label: k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                        value: Number(v) || 0
                    }));
                    setCcBills(cleanCc);
                }
                
                if (Array.isArray(data.otherDebitsNew)) {
                    setOtherDebits(data.otherDebitsNew.map(item => ({ ...item, id: createId() })));
                } else if (data.otherDebitLabel !== undefined) {
                    setOtherDebits([{ id: createId(), label: data.otherDebitLabel, value: data.otherDebitVal || 0 }]);
                }

                setIsDirty(true);
                showToast(`Carried forward values from ${MONTHS_ARRAY[prevMonthIndex]} - ${prevYear}`, "success");
            } else {
                showToast(`No budget data found for ${MONTHS_ARRAY[prevMonthIndex]} - ${prevYear} to copy`, "warning");
            }
        } catch (err) {
            console.error("Error copying from prev month:", err);
            showToast("Failed to copy previous month's data", "error");
        }
    };

    const handleClearData = () => {
        if (window.confirm("Are you sure you want to clear all data for this month? This will reset all credits, debits, and CC bills to zero/empty list. Rents and Water bills will fall back to their auto-computed values.")) {
            setCredits({
                rents: autoRents,
                waterGarbage: autoWater,
                freelance: 0,
                sal: 0,
                othersCredits: 0
            });
            setOtherCredits(getDefaultOtherCredits());
            setDebits(getDefaultDebits());
            setCcBills(getDefaultCcBills());
            setOtherDebits(getDefaultOtherDebits());
            setIsDirty(true);
            showToast("Sheet data cleared. Remember to Save changes.", "info");
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                try {
                    const base64Data = reader.result.split(',')[1];
                    const result = await analyzeBudgetSpreadsheet(base64Data, file.type);
                    if (result) {
                        if (result.credits) {
                            setCredits(prev => ({
                                ...prev,
                                ...result.credits
                            }));
                        }
                        if (Array.isArray(result.otherCreditsNew)) {
                            setOtherCredits(result.otherCreditsNew.map(item => ({ ...item, id: createId() })));
                        }
                        if (Array.isArray(result.debitsNew)) {
                            setDebits(result.debitsNew.map(item => ({ ...item, id: createId() })));
                        }
                        if (Array.isArray(result.ccBillsNew)) {
                            setCcBills(result.ccBillsNew.map(item => ({ ...item, id: createId() })));
                        }
                        if (Array.isArray(result.otherDebitsNew)) {
                            setOtherDebits(result.otherDebitsNew.map(item => ({ ...item, id: createId() })));
                        }

                        setIsDirty(true);
                        showToast("Spreadsheet scanned and populated!", "success");
                    } else {
                        showToast("Failed to parse data from image", "error");
                    }
                } catch (err) {
                    console.error(err);
                    showToast("Failed to parse image: " + err.message, "error");
                } finally {
                    setIsScanning(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error(err);
            showToast("Failed to read file", "error");
            setIsScanning(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (loadingData || isScanning) {
        return (
            <div className="flex flex-col items-center justify-center p-12 gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <p className="text-slate-400 font-bold text-sm">
                    {isScanning ? "Scanning spreadsheet with AI..." : "Loading budget stats..."}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Navigation Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-150 p-4 rounded-3xl shadow-sm">
                <div className="flex items-center gap-3 select-none">
                    <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="bg-white border border-slate-200 text-slate-800 font-extrabold text-xs sm:text-sm rounded-xl py-2 px-2.5 sm:px-3 focus:outline-none focus:ring-2 focus:ring-blue-550 cursor-pointer shadow-sm"
                    >
                        {Array.from({ length: 7 }, (_, i) => currentYear - 3 + i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <select
                        value={monthIndex}
                        onChange={(e) => setMonthIndex(Number(e.target.value))}
                        className="bg-white border border-slate-200 text-slate-800 font-extrabold text-xs sm:text-sm rounded-xl py-2 px-2.5 sm:px-3 focus:outline-none focus:ring-2 focus:ring-blue-550 cursor-pointer shadow-sm"
                    >
                        {MONTHS_ARRAY.map((m, idx) => (
                            <option key={m} value={idx}>
                                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][idx]}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-3">
                    {isDirty && (
                        <span className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 animate-pulse font-sans">
                            Unsaved Changes
                        </span>
                    )}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                    />
                    <div 
                        className="relative"
                        onMouseEnter={() => setShowImportMenu(true)}
                        onMouseLeave={() => setShowImportMenu(false)}
                    >
                        <button
                            onClick={() => setShowImportMenu(!showImportMenu)}
                            disabled={isScanning}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all active:scale-95 text-xs font-sans shadow-sm"
                        >
                            <Sparkles size={14} className={isScanning ? "animate-spin" : ""} />
                            Import Excel
                        </button>
                        
                        {showImportMenu && (
                            <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2.5 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1 select-none">AI Screenshot Sync</p>
                                
                                <button
                                    onClick={() => {
                                        setShowImportMenu(false);
                                        fileInputRef.current?.click();
                                    }}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-indigo-50 hover:text-indigo-700 text-left text-xs font-bold text-slate-700 rounded-xl transition-all"
                                >
                                    <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
                                        <Sparkles size={14} />
                                    </div>
                                    <div>
                                        <p className="font-extrabold text-slate-800 text-xs">Scan Screenshot</p>
                                        <p className="text-[10px] text-slate-400 font-medium">Upload image from device</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        setShowImportMenu(false);
                                        handlePasteFromClipboard();
                                    }}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-violet-50 hover:text-violet-700 text-left text-xs font-bold text-slate-700 rounded-xl transition-all"
                                >
                                    <div className="p-1.5 bg-violet-100 text-violet-600 rounded-lg shrink-0">
                                        <Clipboard size={14} />
                                    </div>
                                    <div>
                                        <p className="font-extrabold text-slate-800 text-xs">Paste Screenshot</p>
                                        <p className="text-[10px] text-slate-400 font-medium">Read from clipboard</p>
                                    </div>
                                </button>

                                <div className="border-t border-slate-100 my-1"></div>
                                <button
                                    onClick={() => {
                                        setShowImportMenu(false);
                                        handleClearData();
                                    }}
                                    className="w-full flex items-center gap-3 p-2 hover:bg-rose-50 hover:text-rose-700 text-left text-xs font-bold text-rose-600 rounded-xl transition-all"
                                >
                                    <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg shrink-0">
                                        <Trash2 size={14} />
                                    </div>
                                    <div>
                                        <p className="font-extrabold text-xs">Clear Sheet Data</p>
                                        <p className="text-[10px] text-rose-450 font-medium">Reset all values to zero/default</p>
                                    </div>
                                </button>
                                
                                <div className="border-t border-slate-100 pt-2 pb-1 text-center select-none">
                                    <p className="text-[9px] text-slate-400 font-bold">
                                        Tip: Press <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Cmd+V</kbd> anywhere to paste
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleCopyFromPrevMonth}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-150 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all active:scale-95 text-xs font-sans"
                    >
                        Copy From Prev Month
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold rounded-2xl transition-all active:scale-95 shadow-sm font-sans text-sm"
                    >
                        <Save size={18} />
                        {isSaving ? "Saving..." : "Save Sheet"}
                    </button>
                </div>
            </div>

            {/* Grid Layout mimicking Excel Columns */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
                
                {/* Column 1: Credits & Summary */}
                <div className="space-y-6">
                    <div className="bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden">
                        <table className="w-full border-collapse">
                            <TableHeader title="Credits" />
                            <tbody>
                                <SpreadsheetRow
                                    label="Rent's"
                                    value={credits.rents}
                                    onChange={(val) => updateCreditField('rents', val)}
                                />
                                <SpreadsheetRow
                                    label="Water & Garbage Bill"
                                    value={credits.waterGarbage}
                                    onChange={(val) => updateCreditField('waterGarbage', val)}
                                />
                                <SpreadsheetRow
                                    label="Freelance"
                                    value={credits.freelance}
                                    onChange={(val) => updateCreditField('freelance', val)}
                                />
                                <SpreadsheetRow
                                    label="Sal"
                                    value={credits.sal}
                                    onChange={(val) => updateCreditField('sal', val)}
                                />
                                <SpreadsheetRow
                                    label="Others Credits"
                                    value={totalOtherCredits}
                                    isFormula={true}
                                />
                            </tbody>
                        </table>
                    </div>

                    {/* Left Column Summary Cards */}
                    <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
                        <h4 className="font-extrabold text-slate-850 text-xs uppercase tracking-wider mb-2 select-none">Monthly Summary</h4>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm font-bold text-slate-600">
                                <span className="select-none">Tot Credit</span>
                                <span className="font-mono text-slate-800">₹{totalCredits.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold text-slate-600">
                                <span className="select-none">Tot Debit</span>
                                <span className="font-mono text-slate-800">₹{totalDebits.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="h-px bg-slate-200 my-2"></div>
                            <div className="flex justify-between items-center text-sm font-black text-slate-800">
                                <span className="select-none">Net Bal</span>
                                <span className={`font-mono ${netBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    ₹{netBalance.toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: Other Credits */}
                <div>
                    <div className="bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden">
                        <table className="w-full border-collapse">
                            <TableHeader title="Other Credits" />
                            <tbody>
                                {otherCredits.map(item => (
                                    <EditableSpreadsheetRow
                                        key={item.id}
                                        label={item.label}
                                        onLabelChange={(val) => updateRowField(setOtherCredits, item.id, 'label', val)}
                                        value={item.value}
                                        onValueChange={(val) => updateRowField(setOtherCredits, item.id, 'value', val)}
                                        onDelete={() => deleteRow(setOtherCredits, item.id)}
                                    />
                                ))}
                                <AddRowButton onClick={() => addRow(setOtherCredits)} />
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Column 3: Debits */}
                <div>
                    <div className="bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden">
                        <table className="w-full border-collapse">
                            <TableHeader title="Debits" />
                            <tbody>
                                <SpreadsheetRow
                                    label="Credit Card Bills"
                                    value={totalCcBills}
                                    isFormula={true}
                                />
                                {debits.map(item => (
                                    <EditableSpreadsheetRow
                                        key={item.id}
                                        label={item.label}
                                        onLabelChange={(val) => updateRowField(setDebits, item.id, 'label', val)}
                                        value={item.value}
                                        onValueChange={(val) => updateRowField(setDebits, item.id, 'value', val)}
                                        onDelete={() => deleteRow(setDebits, item.id)}
                                    />
                                ))}
                                <AddRowButton onClick={() => addRow(setDebits)} />
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Column 4: CC Bills & Other Debits */}
                <div className="space-y-6">
                    <div className="bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden">
                        <table className="w-full border-collapse">
                            <TableHeader title="CC Bills" />
                            <tbody>
                                {ccBills.map(item => (
                                    <EditableSpreadsheetRow
                                        key={item.id}
                                        label={item.label}
                                        onLabelChange={(val) => updateRowField(setCcBills, item.id, 'label', val)}
                                        value={item.value}
                                        onValueChange={(val) => updateRowField(setCcBills, item.id, 'value', val)}
                                        onDelete={() => deleteRow(setCcBills, item.id)}
                                    />
                                ))}
                                <AddRowButton onClick={() => addRow(setCcBills)} />
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden">
                        <table className="w-full border-collapse">
                            <TableHeader title="Other Debits" />
                            <tbody>
                                {otherDebits.map(item => (
                                    <EditableSpreadsheetRow
                                        key={item.id}
                                        label={item.label}
                                        onLabelChange={(val) => updateRowField(setOtherDebits, item.id, 'label', val)}
                                        value={item.value}
                                        onValueChange={(val) => updateRowField(setOtherDebits, item.id, 'value', val)}
                                        onDelete={() => deleteRow(setOtherDebits, item.id)}
                                    />
                                ))}
                                <AddRowButton onClick={() => addRow(setOtherDebits)} />
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}

function AdminRoomModal({ room, tenant, onClose, showToast, updateTenant }) {
    const isOccupied = isOccupiedRecord(tenant);
    // Local state for edits
    const [tenantType, setTenantType] = useState(tenant?.tenantType || 'Family'); // Default to Family
    const [occupantCount, setOccupantCount] = useState(tenant?.occupantCount || 3);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!tenant || !tenant.id) {
            showToast("No tenant record to update", "error");
            return;
        }

        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'properties', tenant.id), {
                tenantType,
                occupantCount: occupantCount || 1
            });
            showToast("Tenant details updated", "success");
            onClose();
        } catch (e) {
            console.error(e);
            showToast("Failed to update: " + e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-extrabold text-slate-800">Room {room.roomNo}</h3>
                        <p className="text-sm text-slate-500 font-medium">{isOccupied ? tenant.tenant : 'Vacant'}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar max-h-[60vh]">
                    {isOccupied ? (
                        <>
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Tenant Details</p>
                                    <p className="text-lg font-bold text-blue-900">{tenant.tenant}</p>
                                    <p className="text-sm text-blue-600 mt-0.5">ID: {room.roomId}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">Occupancy Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {['Family', 'Bachelors'].map((type) => (
                                        <label
                                            key={type}
                                            className={`
                                                flex items-center justify-center px-4 py-3 rounded-xl border-2 cursor-pointer transition-all
                                                ${tenantType === type
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold'
                                                    : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'}
                                            `}
                                        >
                                            <input
                                                type="radio"
                                                name="tenantType"
                                                className="hidden"
                                                checked={tenantType === type}
                                                onChange={() => setTenantType(type)}
                                            />
                                            {type}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Allow Occupant Count for all types */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">No. of Occupants</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    value={occupantCount}
                                    onChange={(e) => setOccupantCount(Number(e.target.value))}
                                />
                            </div>

                            {/* Document Vault */}
                            <div className="pt-4 border-t border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Document Vault</p>
                                <DocumentVault
                                    tenant={tenant}
                                    updateTenant={updateTenant}
                                    showToast={showToast}
                                    tenantType={tenantType || 'Family'}
                                    occupantCount={occupantCount || 1}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8 text-slate-400">
                            No active tenant details to manage for this room.
                        </div>
                    )}
                </div>

                {isOccupied && (
                    <div className="px-6 py-4 bg-slate-50 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function DocumentVault({ tenant, updateTenant, showToast, tenantType, occupantCount }) {
    const { currentUser } = useAuth();
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeOccupant, setActiveOccupant] = useState(0);
    const [uploading, setUploading] = useState({});
    const documents = tenant?.documents || {};
    const bachelorDetails = tenant?.bachelorDetails || [];
    const hasDocumentUploadData = hasActiveDocumentUploadData(tenant);

    const handleUpload = async (file, type) => {
        if (!file || !tenant) return;
        if (file.size > 10 * 1024 * 1024) {
            showToast("File is too large. Max 10MB.", "error");
            return;
        }

        setUploading(prev => ({ ...prev, [type]: true }));

        try {
            const url = await uploadToCloudinary(file);
            const newDocs = { ...documents, [type]: url };

            await updateTenant(tenant.id, {
                documents: newDocs,
                [`meta_${type}_uploadedBy`]: currentUser?.email || 'Admin',
                [`meta_${type}_uploadedAt`]: new Date().toISOString()
            });

            showToast("Document uploaded successfully", "success");
        } catch (error) {
            console.error("Upload Error Details:", error);
            showToast(`Upload failed: ${error.message}`, "error");
        } finally {
            setUploading(prev => ({ ...prev, [type]: false }));
        }
    };

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
        const body = `Hi ${tenant.tenant},\n\nPlease use the following secure link to upload your documents for Room ${tenant.roomNo}.\n\n${url}\n\nThis link is valid for 24 hours.\n\nRegards,\nMunirathnam Illam`;
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(tenant.email || '')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(gmailUrl, '_blank');
    };

    const deleteDoc = async (key) => {
        const newDocs = { ...documents };
        delete newDocs[key];
        try {
            await updateTenant(tenant.id, { documents: newDocs });
            showToast("Document removed", "success");
        } catch (e) {
            showToast("Failed to remove document", "error");
        }
    };

    const resetDocumentSection = async () => {
        const isConfirmed = window.confirm(
            "Clear this tenant's document section?\n\nThis only removes document links and old occupant/contact fields from the app. It will not delete any uploaded files from Cloudinary."
        );
        if (!isConfirmed) return;

        try {
            await updateTenant(tenant.id, getClearedDocumentUploadFields());
            showToast("Document section reset. Cloudinary files were not deleted.", "success");
        } catch (e) {
            showToast("Failed to reset document section", "error");
        }
    };

    const updateBachelorDetail = async (index, field, value) => {
        const newDetails = [...(tenant.bachelorDetails || [])];
        if (!newDetails[index]) newDetails[index] = {};
        newDetails[index][field] = value;
        try {
            await updateTenant(tenant.id, { bachelorDetails: newDetails });
        } catch (e) {
            console.error("Failed to update bachelor details", e);
        }
    };

    return (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 transition"
            >
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                        <LinkIcon size={18} />
                    </div>
                    <div className="text-left">
                        <h4 className="font-bold text-slate-800 text-sm">Vault Access</h4>
                        <p className="text-[10px] text-slate-500">Manage documents</p>
                    </div>
                </div>
                {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>

            {isExpanded && (
                <div className="p-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                    {/* Link Generator */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Secure Upload Link</label>
                        {tenant?.uploadToken ? (
                            <div className="flex gap-2">
                                <div className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-600 truncate font-mono">
                                    {window.location.origin}/upload/...
                                </div>
                                <button onClick={copyLink} className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition" title="Copy Link">
                                    <Copy size={16} />
                                </button>
                                <button onClick={shareViaEmail} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition" title="Share via Email">
                                    <Send size={16} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={generateLink}
                                className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition"
                            >
                                generate Link
                            </button>
                        )}
                        <p className="text-[9px] text-slate-400 mt-2">
                            Link expires in 24 hours.
                        </p>
                    </div>

                    {hasDocumentUploadData && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h5 className="text-xs font-bold text-amber-900 uppercase">Reset document section</h5>
                                    <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                                        Clears old document links and occupant details from this tenant record only.
                                    </p>
                                </div>
                                <button
                                    onClick={resetDocumentSection}
                                    className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-bold transition"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Documents List */}
                    <div className="space-y-6">
                        {(tenantType === 'Bachelors' || occupantCount > 1) ? (
                            <div className="space-y-3">
                                {Array.from({ length: occupantCount || 1 }).map((_, i) => {
                                    const isActive = activeOccupant === i;
                                    const name = bachelorDetails[i]?.name || `Occupant #${i + 1}`;

                                    return (
                                        <div key={i} className={`rounded-xl border transition-all duration-200 overflow-hidden ${isActive ? 'bg-slate-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                                            <button
                                                onClick={() => setActiveOccupant(isActive ? -1 : i)}
                                                className="w-full flex items-center justify-between p-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                        {i + 1}
                                                    </div>
                                                    <div className="text-left">
                                                        <h5 className={`text-sm font-bold ${isActive ? 'text-blue-900' : 'text-slate-700'}`}>{name}</h5>
                                                        {!isActive && <p className="text-[10px] text-slate-400">Click to view documents</p>}
                                                    </div>
                                                </div>
                                                {isActive ? <ChevronUp size={16} className="text-blue-500" /> : <ChevronDown size={16} className="text-slate-300" />}
                                            </button>

                                            {isActive && (
                                                <div className="p-4 pt-0 border-t border-blue-100/50 mt-3 animate-in slide-in-from-top-1">
                                                    {/* Metadata Fields */}
                                                    <div className="grid grid-cols-1 gap-3 mb-4 mt-3">
                                                        <input
                                                            placeholder="Occupant Name"
                                                            className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 outline-none font-medium"
                                                            value={bachelorDetails[i]?.name || ''}
                                                            onChange={(e) => updateBachelorDetail(i, 'name', e.target.value)}
                                                        />

                                                        <input
                                                            placeholder="Family Contact Number"
                                                            className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 outline-none font-medium"
                                                            value={bachelorDetails[i]?.familyPhone || ''}
                                                            onChange={(e) => updateBachelorDetail(i, 'familyPhone', e.target.value)}
                                                        />
                                                    </div>

                                                    {/* Docs */}
                                                    <div className="space-y-2">
                                                        <DocItem title="Photo" docUrl={documents[`bachelor_${i}_photo`]} onDelete={() => deleteDoc(`bachelor_${i}_photo`)} onUpload={(file) => handleUpload(file, `bachelor_${i}_photo`)} isUploading={uploading[`bachelor_${i}_photo`]} />
                                                        <DocItem title="Aadhar" docUrl={documents[`bachelor_${i}_aadhar`]} onDelete={() => deleteDoc(`bachelor_${i}_aadhar`)} onUpload={(file) => handleUpload(file, `bachelor_${i}_aadhar`)} isUploading={uploading[`bachelor_${i}_aadhar`]} />
                                                        <DocItem title="ID Proof" docUrl={documents[`bachelor_${i}_pan`]} onDelete={() => deleteDoc(`bachelor_${i}_pan`)} onUpload={(file) => handleUpload(file, `bachelor_${i}_pan`)} isUploading={uploading[`bachelor_${i}_pan`]} />
                                                        <DocItem title="Agreement" docUrl={documents[`bachelor_${i}_agreement`]} onDelete={() => deleteDoc(`bachelor_${i}_agreement`)} onUpload={(file) => handleUpload(file, `bachelor_${i}_agreement`)} isUploading={uploading[`bachelor_${i}_agreement`]} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            // Family Mode (Default)
                            <div className="space-y-3">
                                {tenant.familyMembers && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                                        <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Family Contacts</h4>
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{tenant.familyMembers}</p>
                                    </div>
                                )}
                                <DocItem title="Tenant Photo" docUrl={documents.photo} onDelete={() => deleteDoc('photo')} onUpload={(file) => handleUpload(file, 'photo')} isUploading={uploading.photo} />
                                <DocItem title="Aadhar Card" docUrl={documents.aadhar} onDelete={() => deleteDoc('aadhar')} onUpload={(file) => handleUpload(file, 'aadhar')} isUploading={uploading.aadhar} />
                                <DocItem title="ID Proof" docUrl={documents.pan} onDelete={() => deleteDoc('pan')} onUpload={(file) => handleUpload(file, 'pan')} isUploading={uploading.pan} />
                                <DocItem title="Rental Agreement" docUrl={documents.agreement} onDelete={() => deleteDoc('agreement')} onUpload={(file) => handleUpload(file, 'agreement')} isUploading={uploading.agreement} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

  function DocItem({ title, docUrl, onDelete, onUpload, isUploading }) {
    const isPdf = docUrl?.toLowerCase().includes('.pdf');

    return (
        <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition group">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${docUrl ? (isPdf ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600') : 'bg-slate-100 text-slate-400'}`}>
                    {isUploading ? (
                        <Loader2 className="animate-spin" size={16} />
                    ) : docUrl ? (
                        isPdf ? <FileText size={16} /> : <Check size={16} />
                    ) : (
                        <User size={16} />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-slate-700 truncate">{title}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        {isUploading ? (
                            <span>Uploading...</span>
                        ) : docUrl ? (
                            <>
                                <span>Uploaded</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="uppercase">{isPdf ? 'PDF' : 'IMG'}</span>
                            </>
                        ) : (
                            'Pending'
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-1.5">
                {/* Upload Button */}
                {!isUploading && onUpload && (
                    <label className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-55 transition cursor-pointer shrink-0" title={docUrl ? "Replace Document" : "Upload Document"}>
                        <Upload size={16} />
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onUpload(file);
                            }}
                        />
                    </label>
                )}

                {docUrl && !isUploading && (
                    <div className="flex gap-1">
                        <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition shrink-0"
                            title="View Document"
                        >
                            <ExternalLink size={16} />
                        </a>
                        <button
                            onClick={() => {
                                if (window.confirm("Are you sure you want to delete this document?")) {
                                    onDelete();
                                }
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition shrink-0"
                            title="Delete Document"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

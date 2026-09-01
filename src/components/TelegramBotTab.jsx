import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Bot, Send, Key, UserCheck, Trash2, Copy, Check, Clock, RefreshCw, AlertCircle, ShieldCheck, Droplets, CreditCard, ArrowRight, MessageSquare } from 'lucide-react';

function generateRandomCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit easily confused 0, O, 1, I
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export default function TelegramBotTab({ showToast }) {
    const [linkedUsers, setLinkedUsers] = useState([]);
    const [authCodes, setAuthCodes] = useState([]);
    const [waterAuditLogs, setWaterAuditLogs] = useState([]);
    const [rentAuditLogs, setRentAuditLogs] = useState([]);
    const [whatsappAuditLogs, setWhatsappAuditLogs] = useState([]);
    const [auditFilter, setAuditFilter] = useState('all'); // 'all', 'water', 'rent', 'whatsapp'
    const [loading, setLoading] = useState(true);

    // Code generator form state
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('Staff');
    const [generatedCode, setGeneratedCode] = useState(null);
    const [copied, setCopied] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Real-time subscriptions
    useEffect(() => {
        // 1. Linked users
        const unsubUsers = onSnapshot(collection(db, 'telegramUsers'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setLinkedUsers(list);
        }, (err) => console.error("Error fetching telegramUsers:", err));

        // 2. Active linking codes
        const unsubCodes = onSnapshot(collection(db, 'telegramAuthCodes'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAuthCodes(list);
        }, (err) => console.error("Error fetching telegramAuthCodes:", err));

        // 3. Water Audit log
        const waterQuery = query(collection(db, 'waterReadingsAudit'), orderBy('createdAt', 'desc'), limit(20));
        const unsubWater = onSnapshot(waterQuery, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, type: 'water', ...d.data() }));
            setWaterAuditLogs(list);
        }, (err) => console.error("Error fetching waterReadingsAudit:", err));

        // 4. Rent Status Audit log
        const rentQuery = query(collection(db, 'rentStatusAudit'), orderBy('createdAt', 'desc'), limit(20));
        const unsubRent = onSnapshot(rentQuery, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, type: 'rent', ...d.data() }));
            setRentAuditLogs(list);
        }, (err) => console.error("Error fetching rentStatusAudit:", err));

        // 5. WhatsApp Audit log
        const waQuery = query(collection(db, 'whatsappAudit'), orderBy('createdAt', 'desc'), limit(20));
        const unsubWa = onSnapshot(waQuery, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, type: 'whatsapp', ...d.data() }));
            setWhatsappAuditLogs(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching whatsappAudit:", err);
            setLoading(false);
        });

        return () => {
            unsubUsers();
            unsubCodes();
            unsubWater();
            unsubRent();
            unsubWa();
        };
    }, []);

    const handleGenerateCode = async (e) => {
        e.preventDefault();
        if (!email.trim()) {
            showToast?.("Please enter a staff email address", "warning");
            return;
        }

        setIsGenerating(true);
        try {
            const code = generateRandomCode(6);
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

            await setDoc(doc(db, 'telegramAuthCodes', code), {
                code,
                email: email.trim().toLowerCase(),
                role,
                createdAt: serverTimestamp(),
                expiresAt: expiresAt.toISOString()
            });

            setGeneratedCode({ code, email: email.trim().toLowerCase(), role, expiresAt });
            setEmail('');
            showToast?.(`Linking code ${code} generated!`, "success");
        } catch (err) {
            console.error("Error generating linking code:", err);
            showToast?.("Error generating code: " + err.message, "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopyCode = (codeText) => {
        navigator.clipboard.writeText(codeText);
        setCopied(true);
        showToast?.("Copied linking code to clipboard", "info");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDeleteCode = async (codeId) => {
        try {
            await deleteDoc(doc(db, 'telegramAuthCodes', codeId));
            showToast?.("Linking code revoked", "info");
            if (generatedCode?.code === codeId) setGeneratedCode(null);
        } catch (err) {
            showToast?.("Failed to revoke code: " + err.message, "error");
        }
    };

    const handleUnlinkUser = async (chatId, userName) => {
        if (!window.confirm(`Are you sure you want to unlink Telegram user "${userName || chatId}"?`)) return;
        try {
            await deleteDoc(doc(db, 'telegramUsers', String(chatId)));
            showToast?.("Telegram user unlinked successfully", "success");
        } catch (err) {
            showToast?.("Failed to unlink user: " + err.message, "error");
        }
    };

    // Combine and sort logs by timestamp
    const allAuditLogs = [...waterAuditLogs, ...rentAuditLogs, ...whatsappAuditLogs].sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
    });

    const filteredLogs = auditFilter === 'water' 
        ? waterAuditLogs 
        : (auditFilter === 'rent' 
            ? rentAuditLogs 
            : (auditFilter === 'whatsapp' 
                ? whatsappAuditLogs 
                : allAuditLogs));

    return (
        <div className="space-y-8 animate-in fade-in duration-350">
            {/* Header / Overview */}
            <div className="bg-gradient-to-r from-sky-500/10 via-blue-500/5 to-indigo-500/10 border border-sky-200/60 rounded-3xl p-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-sky-500 text-white rounded-2xl shadow-md">
                        <Bot size={28} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Telegram Rental Assistant Bot</h3>
                        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                            Submit water meter readings, update rent payment statuses, send WhatsApp bills to tenants, and run quick financial queries directly via Telegram.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-sky-800">
                            <span className="bg-sky-100/80 px-2.5 py-1 rounded-lg">💧 Water: /reading, /bulk</span>
                            <span className="bg-sky-100/80 px-2.5 py-1 rounded-lg">💰 Rent: "G01 Rent Received", "G01 Paid", /rent</span>
                            <span className="bg-emerald-100/80 text-emerald-800 px-2.5 py-1 rounded-lg">📲 WhatsApp: /notify &lt;room&gt;, /notify all</span>
                            <span className="bg-purple-100/80 text-purple-800 px-2.5 py-1 rounded-lg">📊 Queries: /pending, /summary, /total, /unit</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Generate Linking Code */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Key className="text-indigo-600" size={20} />
                            <h4 className="font-bold text-slate-900 text-lg">Generate Staff Linking Code</h4>
                        </div>
                        <p className="text-sm text-slate-500 mb-6">
                            Create a secure 15-minute one-time code to authorize staff/managers on Telegram.
                        </p>

                        <form onSubmit={handleGenerateCode} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Staff / Manager Email
                                </label>
                                <input
                                    type="email"
                                    required
                                    placeholder="e.g. staff@munirathnamillam.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Role Assignment
                                </label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium bg-white"
                                >
                                    <option value="Staff">Staff (Can submit readings & rent)</option>
                                    <option value="Property Manager">Property Manager</option>
                                    <option value="Admin">Admin</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                disabled={isGenerating}
                                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-2"
                            >
                                <Key size={16} />
                                {isGenerating ? "Generating Code..." : "Generate One-Time Code"}
                            </button>
                        </form>
                    </div>

                    {/* Generated Code Display */}
                    {generatedCode && (
                        <div className="mt-6 p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Active Linking Code</span>
                                <span className="text-xs text-indigo-600 flex items-center gap-1">
                                    <Clock size={12} /> Valid for 15 mins
                                </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between bg-white border border-indigo-200 rounded-xl p-3">
                                <span className="font-mono text-2xl font-black text-indigo-900 tracking-wider">
                                    {generatedCode.code}
                                </span>
                                <button
                                    onClick={() => handleCopyCode(`/link ${generatedCode.code}`)}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? "Copied!" : "Copy /link"}
                                </button>
                            </div>
                            <p className="text-xs text-indigo-800 mt-2">
                                💬 Ask staff to open Telegram and send: <code className="font-bold bg-white px-1.5 py-0.5 rounded border border-indigo-200">/link {generatedCode.code}</code>
                            </p>
                        </div>
                    )}
                </div>

                {/* 2. Active Codes & Pending Invites */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Clock className="text-amber-500" size={20} />
                            <h4 className="font-bold text-slate-900 text-lg">Pending Linking Codes</h4>
                        </div>
                        <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                            {authCodes.length} Active
                        </span>
                    </div>

                    {authCodes.length === 0 ? (
                        <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                            No active linking codes pending.
                        </div>
                    ) : (
                        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                            {authCodes.map(codeItem => (
                                <div key={codeItem.id} className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-base text-slate-900">{codeItem.code}</span>
                                            <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 font-semibold rounded-md">
                                                {codeItem.role}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">{codeItem.email}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleCopyCode(`/link ${codeItem.code}`)}
                                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition"
                                            title="Copy /link command"
                                        >
                                            <Copy size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCode(codeItem.id)}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                                            title="Revoke code"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Authorized / Linked Telegram Users */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <UserCheck className="text-emerald-600" size={22} />
                        <h4 className="font-bold text-slate-900 text-lg">Authorized Telegram Users</h4>
                    </div>
                    <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200/60">
                        {linkedUsers.length} Authorized
                    </span>
                </div>

                {linkedUsers.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                        No Telegram users linked yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {linkedUsers.map(user => (
                            <div key={user.id} className="p-4 bg-slate-50/80 border border-slate-200/70 rounded-2xl flex flex-col justify-between">
                                <div>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h5 className="font-bold text-slate-900 text-sm">
                                                {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User'}
                                            </h5>
                                            {user.username && (
                                                <span className="text-xs text-sky-600 font-medium">@{user.username}</span>
                                            )}
                                        </div>
                                        <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-md">
                                            {user.role || 'Owner'}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-xs text-slate-500">
                                        <div>✉️ {user.email || 'Direct Access'}</div>
                                        <div className="text-[11px] text-slate-400 mt-1">Chat ID: {user.chatId}</div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-200/60 flex justify-end">
                                    <button
                                        onClick={() => handleUnlinkUser(user.id, [user.firstName, user.lastName].filter(Boolean).join(' '))}
                                        className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                                    >
                                        <Trash2 size={13} /> Unlink
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 4. Combined Bot Submissions Audit Trail */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-2">
                        <Droplets className="text-blue-600" size={22} />
                        <h4 className="font-bold text-slate-900 text-lg">Bot Submissions Audit Trail</h4>
                    </div>

                    <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto flex-wrap">
                        <button
                            onClick={() => setAuditFilter('all')}
                            className={`px-3 py-1.5 rounded-lg transition ${auditFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            All ({allAuditLogs.length})
                        </button>
                        <button
                            onClick={() => setAuditFilter('water')}
                            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${auditFilter === 'water' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <Droplets size={12} /> Water ({waterAuditLogs.length})
                        </button>
                        <button
                            onClick={() => setAuditFilter('rent')}
                            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${auditFilter === 'rent' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <CreditCard size={12} /> Rent ({rentAuditLogs.length})
                        </button>
                        <button
                            onClick={() => setAuditFilter('whatsapp')}
                            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${auditFilter === 'whatsapp' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <MessageSquare size={12} /> WhatsApp ({whatsappAuditLogs.length})
                        </button>
                    </div>
                </div>

                {filteredLogs.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                        No submissions recorded for this filter yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/50">
                                    <th className="py-3 px-4">Time</th>
                                    <th className="py-3 px-4">Type</th>
                                    <th className="py-3 px-4">Room</th>
                                    <th className="py-3 px-4">Tenant</th>
                                    <th className="py-3 px-4">Cycle</th>
                                    <th className="py-3 px-4">Details</th>
                                    <th className="py-3 px-4">Total Amount</th>
                                    <th className="py-3 px-4">Triggered By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLogs.map(log => {
                                    const dateStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('en-IN', {
                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                    }) : 'Recent';

                                    const isWater = log.type === 'water';
                                    const isWhatsApp = log.type === 'whatsapp';

                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50/80 transition">
                                            <td className="py-3 px-4 font-mono text-slate-500">{dateStr}</td>
                                            <td className="py-3 px-4">
                                                {isWater ? (
                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-md flex items-center gap-1 w-fit">
                                                        <Droplets size={10} /> Water
                                                    </span>
                                                ) : isWhatsApp ? (
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded-md flex items-center gap-1 w-fit">
                                                        <MessageSquare size={10} /> WhatsApp
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-md flex items-center gap-1 w-fit">
                                                        <CreditCard size={10} /> Rent
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-slate-800">{log.roomId}</td>
                                            <td className="py-3 px-4 text-slate-700">{log.tenantName}</td>
                                            <td className="py-3 px-4 font-mono text-slate-600">{log.monthKey}</td>
                                            
                                            {/* Details column */}
                                            <td className="py-3 px-4 font-mono">
                                                {isWater ? (
                                                    <div>
                                                        <span className="font-bold text-indigo-700">{log.reading}</span>
                                                        {log.isMeterReset && (
                                                            <span className="ml-1 text-[10px] text-amber-700 bg-amber-100/80 px-1 py-0.5 rounded font-semibold">Reset</span>
                                                        )}
                                                        {log.isNearZero && (
                                                            <span className="ml-1 text-[10px] text-purple-700 bg-purple-100/80 px-1 py-0.5 rounded font-semibold">0 Usage</span>
                                                        )}
                                                        <span className="ml-1 text-slate-500">({log.unitsConsumed ?? 0}u)</span>
                                                    </div>
                                                ) : isWhatsApp ? (
                                                    <div>
                                                        <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${log.status === 'SENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                            {log.status}
                                                        </span>
                                                        <span className="ml-1 text-slate-500 text-[11px]">`+{log.phone}`</span>
                                                        {log.error && (
                                                            <div className="text-[10px] text-rose-600 font-normal mt-0.5 truncate max-w-xs">{log.error}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-slate-400 line-through text-[11px]">{log.oldStatus || 'Pending'}</span>
                                                        <ArrowRight size={11} className="text-slate-400" />
                                                        <span className={`font-bold ${log.newStatus === 'Paid' ? 'text-emerald-700' : (log.newStatus === 'Rent Only' ? 'text-purple-700' : 'text-amber-700')}`}>
                                                            {log.newStatus}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Amount column */}
                                            <td className="py-3 px-4 font-bold text-emerald-700">
                                                {isWater
                                                    ? (log.billedAmount !== null ? `₹${log.billedAmount}` : '-')
                                                    : isWhatsApp
                                                    ? '-'
                                                    : (log.newTotal !== null ? `₹${log.newTotal.toLocaleString('en-IN')}` : '₹0')
                                                }
                                            </td>

                                            <td className="py-3 px-4 text-slate-600">
                                                {log.submittedBy?.name || log.submittedBy?.email || log.sentBy?.name || log.sentBy?.email || 'Telegram'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

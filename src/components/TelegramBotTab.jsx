import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Bot, Send, Key, UserCheck, Trash2, Copy, Check, Clock, RefreshCw, AlertCircle, ShieldCheck, Droplets } from 'lucide-react';

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
    const [auditLogs, setAuditLogs] = useState([]);
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

        // 3. Audit log
        const auditQuery = query(collection(db, 'waterReadingsAudit'), orderBy('createdAt', 'desc'), limit(20));
        const unsubAudit = onSnapshot(auditQuery, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAuditLogs(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching waterReadingsAudit:", err);
            setLoading(false);
        });

        return () => {
            unsubUsers();
            unsubCodes();
            unsubAudit();
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

    return (
        <div className="space-y-8 animate-in fade-in duration-350">
            {/* Header / Overview */}
            <div className="bg-gradient-to-r from-sky-500/10 via-blue-500/5 to-indigo-500/10 border border-sky-200/60 rounded-3xl p-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-sky-500 text-white rounded-2xl shadow-md">
                        <Bot size={28} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Telegram Water Meter Bot</h3>
                        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                            Property staff and managers can submit monthly water meter readings directly from Telegram. 
                            Readings are automatically validated, anomaly-checked, and synced with the app in real time.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-sky-800">
                            <span className="bg-sky-100/80 px-2.5 py-1 rounded-lg">Commands: /reading, /status, /link, /help</span>
                            <span className="bg-sky-100/80 px-2.5 py-1 rounded-lg">Instant Sync with Firestore</span>
                            <span className="bg-sky-100/80 px-2.5 py-1 rounded-lg">Reset & Anomaly Protection</span>
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
                            Create a secure 15-minute one-time code to authorize a staff member's Telegram account.
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
                                    <option value="Staff">Staff (Can submit meter readings)</option>
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
                            No active linking codes pending. Generate a code using the form on the left.
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
                        <h4 className="font-bold text-slate-900 text-lg">Authorized Telegram Staff</h4>
                    </div>
                    <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200/60">
                        {linkedUsers.length} Authorized
                    </span>
                </div>

                {linkedUsers.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                        No Telegram users linked yet. Staff can link their account using <code className="text-slate-600 font-bold">/link &lt;code&gt;</code> in Telegram.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {linkedUsers.map(user => (
                            <div key={user.id} className="p-4 bg-slate-50/80 border border-slate-200/70 rounded-2xl flex flex-col justify-between">
                                <div>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h5 className="font-bold text-slate-900 text-sm">
                                                {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Staff User'}
                                            </h5>
                                            {user.username && (
                                                <span className="text-xs text-sky-600 font-medium">@{user.username}</span>
                                            )}
                                        </div>
                                        <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-md">
                                            {user.role || 'Staff'}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-xs text-slate-500">
                                        <div>✉️ {user.email || 'No email attached'}</div>
                                        <div className="text-[11px] text-slate-400 mt-1">Chat ID: {user.chatId}</div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-200/60 flex justify-end">
                                    <button
                                        onClick={() => handleUnlinkUser(user.id, [user.firstName, user.lastName].filter(Boolean).join(' '))}
                                        className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                                    >
                                        <Trash2 size={13} /> Unlink Account
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 4. Recent Water Reading Audit Trail */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Droplets className="text-blue-600" size={22} />
                        <h4 className="font-bold text-slate-900 text-lg">Recent Bot Submissions Audit Trail</h4>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">Last 20 entries</span>
                </div>

                {auditLogs.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                        No submissions recorded from Telegram bot yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/50">
                                    <th className="py-3 px-4">Time</th>
                                    <th className="py-3 px-4">Room</th>
                                    <th className="py-3 px-4">Tenant</th>
                                    <th className="py-3 px-4">Cycle</th>
                                    <th className="py-3 px-4">Reading</th>
                                    <th className="py-3 px-4">Delta / Units</th>
                                    <th className="py-3 px-4">Amount</th>
                                    <th className="py-3 px-4">Submitted By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {auditLogs.map(log => {
                                    const dateStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('en-IN', {
                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                    }) : 'Recent';

                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50/80 transition">
                                            <td className="py-3 px-4 font-mono text-slate-500">{dateStr}</td>
                                            <td className="py-3 px-4 font-bold text-slate-800">{log.roomId}</td>
                                            <td className="py-3 px-4 text-slate-700">{log.tenantName}</td>
                                            <td className="py-3 px-4 font-mono text-slate-600">{log.monthKey}</td>
                                            <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                                                {log.reading}
                                                {log.isMeterReset && <span className="ml-1 text-[10px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded">Reset</span>}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600">
                                                {log.unitsConsumed !== null ? `${log.unitsConsumed} units` : '-'}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-emerald-700">
                                                {log.billedAmount !== null ? `₹${log.billedAmount}` : '-'}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600">
                                                {log.submittedBy?.name || log.submittedBy?.email || 'Telegram'}
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

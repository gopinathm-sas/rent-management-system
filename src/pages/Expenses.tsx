import { useState, FormEvent, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { 
    Trash2, Plus, Calendar, Tag, FileText, IndianRupee, Filter, 
    Edit2, Save, X, FolderPlus, Repeat, CheckCircle2, Clock, 
    AlertCircle, Play, Pause 
} from 'lucide-react';
import { getMonthKey, MONTHS } from '../lib/utils';
import ReceiptScanner from '../components/ReceiptScanner';
import { RecurringExpense } from '../types';

const DEFAULT_CATEGORIES = [
    "House Keeping Salary",
    "Electricity Bill",
    "Internet Bill",
    "Painting",
    "Room Maintenance",
    "Plumbing & Repairs",
    "Other"
];

export default function Expenses() {
    const { 
        expenses, 
        recurringExpenses, 
        addExpense, 
        updateExpense, 
        deleteExpense, 
        addRecurringExpense, 
        updateRecurringExpense, 
        deleteRecurringExpense, 
        confirmPendingExpense, 
        dismissPendingExpense, 
        loading, 
        globalYear 
    } = useData();
    const { showToast, confirm } = useUI();
    const year = globalYear;

    // Custom categories loaded from localStorage
    const [customCategories, setCustomCategories] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('custom_expense_categories');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    // Combine default categories, stored custom categories, and any categories present in expenses data
    const allCategories = useMemo(() => {
        const set = new Set([...DEFAULT_CATEGORIES, ...customCategories]);
        expenses.forEach(e => {
            if (e.category && e.category.trim()) {
                set.add(e.category.trim());
            }
        });
        recurringExpenses.forEach(r => {
            if (r.category && r.category.trim()) {
                set.add(r.category.trim());
            }
        });
        return Array.from(set);
    }, [customCategories, expenses, recurringExpenses]);

    // Form State for New Expense
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurringDay, setRecurringDay] = useState(() => new Date().getDate());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string>(() => MONTHS[new Date().getMonth()]);

    // Pending Confirmation Expenses
    const pendingExpenses = useMemo(() => {
        return expenses.filter(e => Boolean(e.pendingConfirmation));
    }, [expenses]);

    // State for pending item inputs (amount and note editable inline)
    const [pendingAmounts, setPendingAmounts] = useState<Record<string, string>>({});
    const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    // New Category Modal State
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Manage Recurring Expenses Modal State
    const [showRecurringModal, setShowRecurringModal] = useState(false);
    const [editingRecurringRule, setEditingRecurringRule] = useState<RecurringExpense | null>(null);
    const [isAddingNewRule, setIsAddingNewRule] = useState(false);
    const [ruleForm, setRuleForm] = useState({
        category: DEFAULT_CATEGORIES[0],
        dayOfMonth: 1,
        defaultAmount: '',
        noteTemplate: ''
    });

    // Inline Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ date: '', category: '', amount: '', note: '' });

    // Handle adding a new category
    const handleAddCategorySubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = newCategoryName.trim();
        if (!trimmed) {
            showToast("Please enter a valid category name.", 'warning');
            return;
        }

        if (allCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
            showToast(`Category "${trimmed}" already exists.`, 'info');
            setCategory(allCategories.find(c => c.toLowerCase() === trimmed.toLowerCase()) || trimmed);
            setShowCategoryModal(false);
            setNewCategoryName('');
            return;
        }

        const updated = [...customCategories, trimmed];
        setCustomCategories(updated);
        try {
            localStorage.setItem('custom_expense_categories', JSON.stringify(updated));
        } catch (err) {
            console.error('Failed to save category to localStorage:', err);
        }

        setCategory(trimmed);
        setShowCategoryModal(false);
        setNewCategoryName('');
        showToast(`Category "${trimmed}" added successfully!`, 'success');
    };

    // Submit New Expense (+ optional recurring rule)
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!date || !category || !amount || Number(amount) <= 0) {
            showToast("Please fill in all required fields with valid values.", 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const d = new Date(date);
            const monthKey = getMonthKey(d.getFullYear(), d.getMonth());

            let createdRecurringId: string | undefined = undefined;
            // If "Make this recurring" was checked, also create the recurring rule
            if (isRecurring) {
                const dayNum = Math.min(31, Math.max(1, Number(recurringDay) || d.getDate()));
                createdRecurringId = await addRecurringExpense({
                    category,
                    dayOfMonth: dayNum,
                    defaultAmount: Number(amount),
                    noteTemplate: note.trim(),
                    status: 'active',
                    createdAt: new Date().toISOString()
                });
            }

            await addExpense({
                date,
                category,
                amount: Number(amount),
                note: note.trim(),
                monthKey,
                recurringId: createdRecurringId,
                source: isRecurring ? 'recurring_rule' : 'manual',
                createdAt: new Date().toISOString()
            });

            if (isRecurring) {
                const dayNum = Math.min(31, Math.max(1, Number(recurringDay) || d.getDate()));
                showToast(`Expense logged & recurring monthly rule set for day ${dayNum}!`, 'success');
            } else {
                showToast("Expense added successfully", 'success');
            }

            // Reset form
            setAmount('');
            setNote('');
            setIsRecurring(false);
        } catch (error: any) {
            console.error(error);
            showToast("Failed to add expense: " + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Confirm a pending recurring expense
    const handleConfirmPending = async (item: any) => {
        const rawAmount = pendingAmounts[item.id] !== undefined 
            ? pendingAmounts[item.id] 
            : String(item.amount || item.suggestedAmount || '');
        const finalAmount = Number(rawAmount);

        if (!finalAmount || finalAmount <= 0) {
            showToast("Please enter a valid expense amount before confirming.", 'warning');
            return;
        }

        const rawNote = pendingNotes[item.id] !== undefined ? pendingNotes[item.id] : item.note;

        setConfirmingId(item.id);
        try {
            await confirmPendingExpense(item.id, finalAmount, rawNote);
            showToast(`Confirmed ${item.category} expense of ₹${finalAmount.toLocaleString('en-IN')}`, 'success');
        } catch (err: any) {
            console.error(err);
            showToast("Failed to confirm expense: " + err.message, 'error');
        } finally {
            setConfirmingId(null);
        }
    };

    // Dismiss / Delete a pending recurring expense
    const handleDismissPending = async (item: any) => {
        const isConfirmed = await confirm({
            title: 'Dismiss Pending Expense?',
            message: `Dismiss ${item.category} for this month? The recurring rule will remain active for future months.`,
            type: 'warning',
            confirmText: 'Dismiss'
        });

        if (isConfirmed) {
            try {
                await dismissPendingExpense(item.id);
                showToast("Pending expense dismissed", 'info');
            } catch (err: any) {
                showToast("Failed to dismiss: " + err.message, 'error');
            }
        }
    };

    // Delete confirmed expense from table
    const handleDelete = async (id: string) => {
        const isConfirmed = await confirm({
            title: 'Delete Expense?',
            message: "Are you sure you want to delete this expense? This action cannot be undone.",
            type: 'danger',
            confirmText: 'Delete'
        });

        if (isConfirmed) {
            try {
                await deleteExpense(id);
                showToast("Expense deleted successfully", 'success');
            } catch (e: any) {
                showToast("Failed to delete: " + e.message, 'error');
            }
        }
    };

    const handleEditClick = (item: any) => {
        setEditingId(item.id);
        setEditForm({
            date: item.date || '',
            category: item.category || allCategories[0],
            amount: String(item.amount || ''),
            note: item.note || ''
        });
    };

    const handleEditSave = async () => {
        if (!editingId) return;
        if (!editForm.date || !editForm.category || !editForm.amount || Number(editForm.amount) <= 0) {
            showToast('Please fill in all required fields.', 'warning');
            return;
        }
        try {
            const d = new Date(editForm.date);
            const monthKey = getMonthKey(d.getFullYear(), d.getMonth());
            await updateExpense(editingId, {
                date: editForm.date,
                category: editForm.category,
                amount: Number(editForm.amount),
                note: editForm.note.trim(),
                monthKey
            });
            setEditingId(null);
            showToast('Expense updated successfully', 'success');
        } catch (e: any) {
            showToast('Failed to update: ' + e.message, 'error');
        }
    };

    // Recurring Rule Handlers
    const handleToggleRuleStatus = async (rule: RecurringExpense) => {
        const newStatus = rule.status === 'active' ? 'paused' : 'active';
        try {
            await updateRecurringExpense(rule.id, { status: newStatus });
            showToast(`Recurring rule ${newStatus === 'active' ? 'resumed' : 'paused'} successfully`, 'success');
        } catch (err: any) {
            showToast("Failed to update rule: " + err.message, 'error');
        }
    };

    const handleDeleteRule = async (rule: RecurringExpense) => {
        const isConfirmed = await confirm({
            title: 'Delete Recurring Rule?',
            message: `Delete recurring rule for "${rule.category}"? Past confirmed expenses generated from this rule will be preserved.`,
            type: 'danger',
            confirmText: 'Delete Rule'
        });

        if (isConfirmed) {
            try {
                await deleteRecurringExpense(rule.id);
                showToast("Recurring rule deleted", 'success');
            } catch (err: any) {
                showToast("Failed to delete rule: " + err.message, 'error');
            }
        }
    };

    const handleSaveRule = async (e: FormEvent) => {
        e.preventDefault();
        const day = Math.min(31, Math.max(1, Number(ruleForm.dayOfMonth) || 1));
        const amountNum = ruleForm.defaultAmount ? Number(ruleForm.defaultAmount) : undefined;

        try {
            if (editingRecurringRule) {
                await updateRecurringExpense(editingRecurringRule.id, {
                    category: ruleForm.category,
                    dayOfMonth: day,
                    defaultAmount: amountNum,
                    noteTemplate: ruleForm.noteTemplate.trim()
                });
                showToast("Recurring rule updated successfully", 'success');
            } else {
                await addRecurringExpense({
                    category: ruleForm.category,
                    dayOfMonth: day,
                    defaultAmount: amountNum,
                    noteTemplate: ruleForm.noteTemplate.trim(),
                    status: 'active',
                    createdAt: new Date().toISOString()
                });
                showToast("New recurring rule added successfully", 'success');
            }
            setEditingRecurringRule(null);
            setIsAddingNewRule(false);
        } catch (err: any) {
            showToast("Failed to save rule: " + err.message, 'error');
        }
    };

    if (loading) return <div className="p-12 text-center text-slate-400">Loading expenses...</div>;

    // Filter Confirmed Expenses by Year and optionally by Month
    // PENDING expenses are strictly EXCLUDED from totals and main table
    const confirmedExpenses = expenses.filter(e => !e.pendingConfirmation);

    const filteredExpenses = confirmedExpenses.filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date);
        if (d.getFullYear() !== year) return false;
        if (selectedMonth !== 'All') {
            const monthIndex = MONTHS.indexOf(selectedMonth);
            if (monthIndex !== -1 && d.getMonth() !== monthIndex) return false;
        }
        return true;
    });

    // Quick lookup maps for recurring rules
    const recurringRuleMap = useMemo(() => {
        const byId = new Map<string, RecurringExpense>();
        const byCategory = new Map<string, RecurringExpense>();
        recurringExpenses.forEach(r => {
            if (r.id) byId.set(r.id, r);
            if (r.category) byCategory.set(r.category.trim().toLowerCase(), r);
        });
        return { byId, byCategory };
    }, [recurringExpenses]);

    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const activeRulesCount = recurringExpenses.filter(r => r.status === 'active').length;

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* Page Header & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-extrabold text-slate-900">Expenses</h2>
                    {pendingExpenses.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200 shadow-sm animate-pulse">
                            <Clock size={13} /> {pendingExpenses.length} Needs Review
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Manage Recurring Rules Button */}
                    <button
                        type="button"
                        onClick={() => {
                            setEditingRecurringRule(null);
                            setIsAddingNewRule(false);
                            setShowRecurringModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 transition shadow-sm cursor-pointer"
                        title="Manage Recurring Rules"
                    >
                        <Repeat size={14} className="text-blue-600" />
                        <span>Recurring Rules</span>
                        {activeRulesCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white">
                                {activeRulesCount}
                            </span>
                        )}
                    </button>

                    {/* Month Filter Selector */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="pl-8 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer shadow-sm"
                        >
                            <option value="All">Overall</option>
                            {MONTHS.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                        Year: {year}
                    </span>
                </div>
            </div>

            {/* NEEDS REVIEW SECTION (Shown when auto-generated recurring entries await confirmation) */}
            {pendingExpenses.length > 0 && (
                <div className="bg-gradient-to-br from-amber-500/10 via-amber-50 to-orange-50 rounded-3xl p-5 border-2 border-amber-300/80 shadow-md space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/70 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-amber-500 text-white rounded-2xl shadow-sm">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-amber-950 flex items-center gap-2">
                                    Recurring Expenses Needing Confirmation
                                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white">
                                        {pendingExpenses.length}
                                    </span>
                                </h3>
                                <p className="text-xs text-amber-800 font-medium">
                                    Auto-created for this month based on your recurring rules. Verify or adjust the amount to confirm and include in totals.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                        {pendingExpenses.map(item => {
                            const currentVal = pendingAmounts[item.id] !== undefined 
                                ? pendingAmounts[item.id] 
                                : String(item.amount || item.suggestedAmount || '');

                            const currentNoteVal = pendingNotes[item.id] !== undefined
                                ? pendingNotes[item.id]
                                : (item.note || '');

                            return (
                                <div 
                                    key={item.id} 
                                    className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm hover:shadow transition flex flex-col justify-between space-y-3"
                                >
                                    <div>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-blue-50 text-blue-700 border border-blue-100">
                                                    <Tag size={12} /> {item.category}
                                                </span>
                                                <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold mt-1">
                                                    <Calendar size={12} className="text-slate-400" /> Due: {item.date}
                                                </div>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                                                Review
                                            </span>
                                        </div>

                                        <div className="mt-3 space-y-1.5">
                                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                                Confirm Actual Amount (₹)
                                            </label>
                                            <div className="relative">
                                                <IndianRupee size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    placeholder="Enter actual amount"
                                                    value={currentVal}
                                                    onChange={e => setPendingAmounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                    className="w-full pl-8 pr-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50/50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-base font-black text-slate-900 shadow-inner"
                                                />
                                            </div>
                                            {item.suggestedAmount ? (
                                                <p className="text-[10px] text-slate-500 font-medium">
                                                    Suggested from last occurrence: <span className="font-bold text-slate-700">₹{Number(item.suggestedAmount).toLocaleString('en-IN')}</span>
                                                </p>
                                            ) : null}

                                            <div className="pt-1">
                                                <input
                                                    type="text"
                                                    placeholder="Note (optional)..."
                                                    value={currentNoteVal}
                                                    onChange={e => setPendingNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:bg-white outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                        <button
                                            type="button"
                                            disabled={confirmingId === item.id}
                                            onClick={() => handleConfirmPending(item)}
                                            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition shadow-sm disabled:opacity-50 cursor-pointer"
                                        >
                                            <CheckCircle2 size={14} />
                                            {confirmingId === item.id ? 'Confirming...' : 'Confirm & Add'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDismissPending(item)}
                                            className="py-2 px-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                                            title="Dismiss this month's entry"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Total Card */}
            <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl p-6 text-white shadow-lg shadow-rose-200">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-white/80 font-medium mb-1">
                            Total Expenses ({selectedMonth === 'All' ? `Overall ${year}` : `${selectedMonth} ${year}`})
                        </div>
                        <div className="text-4xl font-extrabold tracking-tight">₹{totalExpenses.toLocaleString('en-IN')}</div>
                    </div>
                    {pendingExpenses.length > 0 && (
                        <div className="text-right hidden sm:block">
                            <span className="inline-block px-3 py-1.5 bg-black/20 rounded-2xl text-xs font-bold backdrop-blur-sm border border-white/20">
                                ⚠️ {pendingExpenses.length} unconfirmed pending review
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Expense Form */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Plus className="text-blue-600" size={20} /> New Expense
                    </h3>
                    <ReceiptScanner onScanComplete={(data) => {
                        if (data.date) {
                            setDate(data.date);
                            const d = new Date(data.date);
                            if (!isNaN(d.getTime())) setRecurringDay(d.getDate());
                        }
                        if (data.amount) setAmount(data.amount);
                        if (data.note) setNote(data.note);
                        if (data.category && allCategories.includes(data.category)) {
                            setCategory(data.category);
                        } else {
                            setCategory("Other");
                        }
                    }} />
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="date"
                                    required
                                    value={date}
                                    onChange={e => {
                                        setDate(e.target.value);
                                        const d = new Date(e.target.value);
                                        if (!isNaN(d.getTime())) setRecurringDay(d.getDate());
                                    }}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
                                />
                            </div>
                        </div>

                        {/* Category Input with Add Category Button */}
                        <div className="md:col-span-4">
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-semibold text-slate-500">Category</label>
                                <button
                                    type="button"
                                    onClick={() => setShowCategoryModal(true)}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
                                >
                                    <FolderPlus size={13} /> + New Category
                                </button>
                            </div>
                            <div className="relative">
                                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <select
                                    required
                                    value={category}
                                    onChange={e => {
                                        if (e.target.value === '__add_new__') {
                                            setShowCategoryModal(true);
                                        } else {
                                            setCategory(e.target.value);
                                        }
                                    }}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 appearance-none cursor-pointer"
                                >
                                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    <option value="__add_new__" className="font-bold text-blue-600">+ Add Custom Category...</option>
                                </select>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Note (Optional)</label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Details..."
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Amount</label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    step="any"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50 cursor-pointer shadow-md"
                            >
                                {isSubmitting ? 'Adding...' : 'Add Expense'}
                            </button>
                        </div>
                    </div>

                    {/* Make this recurring toggle & options */}
                    <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={isRecurring}
                                onChange={e => setIsRecurring(e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                            />
                            <Repeat size={14} className="text-blue-600" />
                            <span>Make this a recurring monthly expense</span>
                        </label>

                        {isRecurring && (
                            <div className="flex items-center gap-3 bg-blue-50/70 border border-blue-200/80 px-3 py-1.5 rounded-xl animate-in fade-in duration-200">
                                <span className="text-xs font-bold text-blue-900">
                                    Repeat every month on Day:
                                </span>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    required
                                    value={recurringDay}
                                    onChange={e => setRecurringDay(Number(e.target.value))}
                                    className="w-16 px-2 py-1 text-xs font-black text-blue-900 bg-white border border-blue-300 rounded-lg text-center outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-[11px] text-blue-700 font-medium">
                                    (Flagged for review each cycle)
                                </span>
                            </div>
                        )}
                    </div>
                </form>
            </div>

            {/* Modal for Adding New Custom Category */}
            {showCategoryModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <FolderPlus className="text-blue-600" size={20} />
                                Add Custom Expense Category
                            </h3>
                            <button
                                onClick={() => {
                                    setShowCategoryModal(false);
                                    setNewCategoryName('');
                                }}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleAddCategorySubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category Name</label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="e.g. Sanitation, Water Tanker, CCTV Repair"
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none font-bold text-slate-800"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCategoryModal(false);
                                        setNewCategoryName('');
                                    }}
                                    className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 text-xs transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 text-xs transition shadow-md shadow-blue-200"
                                >
                                    Add Category
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for Managing Recurring Rules */}
            {showRecurringModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Repeat className="text-blue-600" size={22} />
                                    Manage Recurring Expenses
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Rules run monthly on the set day and create pending entries for your review.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowRecurringModal(false);
                                    setEditingRecurringRule(null);
                                    setIsAddingNewRule(false);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Sub-form for Adding / Editing a Rule */}
                        {(isAddingNewRule || editingRecurringRule) ? (
                            <form onSubmit={handleSaveRule} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                                    {editingRecurringRule ? <Edit2 size={16} className="text-blue-600" /> : <Plus size={16} className="text-blue-600" />}
                                    {editingRecurringRule ? 'Edit Recurring Rule' : 'Create New Recurring Rule'}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                            Category
                                        </label>
                                        <select
                                            value={ruleForm.category}
                                            onChange={e => setRuleForm(f => ({ ...f, category: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                            Day of Month (1–31)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            required
                                            value={ruleForm.dayOfMonth}
                                            onChange={e => setRuleForm(f => ({ ...f, dayOfMonth: Number(e.target.value) }))}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                            Default / Starting Amount (₹)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            placeholder="Optional starting estimate..."
                                            value={ruleForm.defaultAmount}
                                            onChange={e => setRuleForm(f => ({ ...f, defaultAmount: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                            Note / Description Template
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Fiber Internet Monthly Bill"
                                            value={ruleForm.noteTemplate}
                                            onChange={e => setRuleForm(f => ({ ...f, noteTemplate: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingRecurringRule(null);
                                            setIsAddingNewRule(false);
                                        }}
                                        className="px-4 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-200 text-xs transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 text-xs transition shadow-md shadow-blue-200"
                                    >
                                        {editingRecurringRule ? 'Update Rule' : 'Save Rule'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Active & Paused Rules ({recurringExpenses.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRuleForm({
                                            category: allCategories[0] || DEFAULT_CATEGORIES[0],
                                            dayOfMonth: 1,
                                            defaultAmount: '',
                                            noteTemplate: ''
                                        });
                                        setIsAddingNewRule(true);
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-extrabold flex items-center gap-1 transition"
                                >
                                    <Plus size={14} /> Add Recurring Rule
                                </button>
                            </div>
                        )}

                        {/* Rules List */}
                        <div className="space-y-2.5">
                            {recurringExpenses.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                                    No recurring expense rules created yet. Click "+ Add Recurring Rule" above or check "Make this recurring" when adding an expense.
                                </div>
                            ) : (
                                recurringExpenses.map(rule => (
                                    <div 
                                        key={rule.id} 
                                        className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                            rule.status === 'active' 
                                                ? 'bg-white border-slate-200 shadow-sm' 
                                                : 'bg-slate-50 border-slate-200 opacity-75'
                                        }`}
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-slate-900 text-sm">
                                                    {rule.category}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                    rule.status === 'active' 
                                                        ? 'bg-emerald-100 text-emerald-800' 
                                                        : 'bg-slate-200 text-slate-700'
                                                }`}>
                                                    {rule.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                                                <span>Repeats on: <strong className="text-slate-800">Day {rule.dayOfMonth}</strong> of month</span>
                                                {rule.defaultAmount ? (
                                                    <span>Starting: <strong className="text-slate-800">₹{Number(rule.defaultAmount).toLocaleString('en-IN')}</strong></span>
                                                ) : null}
                                            </div>
                                            {rule.noteTemplate && (
                                                <p className="text-[11px] text-slate-400 italic">
                                                    "{rule.noteTemplate}"
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleRuleStatus(rule)}
                                                className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
                                                    rule.status === 'active'
                                                        ? 'bg-slate-100 hover:bg-amber-50 hover:text-amber-800 border-slate-200 text-slate-600'
                                                        : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
                                                }`}
                                                title={rule.status === 'active' ? 'Pause Rule' : 'Resume Rule'}
                                            >
                                                {rule.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                                                <span className="text-[11px]">{rule.status === 'active' ? 'Pause' : 'Resume'}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingRecurringRule(rule);
                                                    setRuleForm({
                                                        category: rule.category,
                                                        dayOfMonth: rule.dayOfMonth,
                                                        defaultAmount: rule.defaultAmount ? String(rule.defaultAmount) : '',
                                                        noteTemplate: rule.noteTemplate || ''
                                                    });
                                                    setIsAddingNewRule(false);
                                                }}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                                                title="Edit Rule"
                                            >
                                                <Edit2 size={15} />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleDeleteRule(rule)}
                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                                                title="Delete Rule (Preserves past expenses)"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Expenses List */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 w-32">Date</th>
                                <th className="px-6 py-4 w-48">Category</th>
                                <th className="px-6 py-4">Note</th>
                                <th className="px-6 py-4 w-32 text-right">Amount</th>
                                <th className="px-6 py-4 w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredExpenses.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                        No expenses recorded for {selectedMonth === 'All' ? `Overall ${year}` : `${selectedMonth} ${year}`}.
                                    </td>
                                </tr>
                            ) : (
                                filteredExpenses.map(item => {
                                    const matchingRule = (item.recurringId && recurringRuleMap.byId.get(item.recurringId)) ||
                                        recurringRuleMap.byCategory.get((item.category || '').trim().toLowerCase());
                                    const isRecurringItem = Boolean(item.recurringId || item.source === 'recurring_rule' || matchingRule);

                                    return editingId === item.id ? (
                                        <tr key={item.id} className="bg-blue-50/50">
                                            <td className="px-3 py-3">
                                                <input
                                                    type="date"
                                                    value={editForm.date}
                                                    onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-blue-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <select
                                                    value={editForm.category}
                                                    onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-blue-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                                                >
                                                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-3 py-3">
                                                <input
                                                    type="text"
                                                    value={editForm.note}
                                                    onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                                                    placeholder="Details..."
                                                    className="w-full px-2 py-1.5 rounded-lg border border-blue-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={editForm.amount}
                                                    onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                                                    className="w-full px-2 py-1.5 rounded-lg border border-blue-200 bg-white text-sm font-bold text-slate-900 text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <button
                                                        onClick={handleEditSave}
                                                        className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                                                        title="Save"
                                                    >
                                                        <Save size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                        title="Cancel"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={item.id} className="hover:bg-slate-50 group">
                                            <td className="px-6 py-4 font-medium text-slate-600 whitespace-nowrap">
                                                {item.date}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-900">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="inline-block px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-bold border border-slate-200">
                                                        {item.category}
                                                    </span>
                                                    {isRecurringItem && (
                                                        <span 
                                                            title={matchingRule ? `Recurring Rule active: Day ${matchingRule.dayOfMonth} of every month` : "Recurring monthly expense"}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs cursor-help"
                                                        >
                                                            <Repeat size={11} className="text-blue-600 shrink-0" />
                                                            <span>Recurring</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">
                                                {item.note ? (
                                                    item.note
                                                ) : isRecurringItem ? (
                                                    <span className="text-blue-500/80 text-xs italic font-medium inline-flex items-center gap-1">
                                                        <Repeat size={11} className="text-blue-400" /> Recurring monthly expense
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-900">
                                                ₹{Number(item.amount).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEditClick(item)}
                                                        className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                                        title="Edit Expense"
                                                    >
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                                        title="Delete Expense"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

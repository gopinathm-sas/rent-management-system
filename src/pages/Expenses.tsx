import { useState, FormEvent, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { Trash2, Plus, Calendar, Tag, FileText, IndianRupee, Filter, Edit2, Save, X, FolderPlus } from 'lucide-react';
import { getMonthKey, MONTHS } from '../lib/utils';
import ReceiptScanner from '../components/ReceiptScanner';

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
    const { expenses, addExpense, updateExpense, deleteExpense, loading, globalYear } = useData();
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
        return Array.from(set);
    }, [customCategories, expenses]);

    // Form State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string>('All');

    // New Category Modal State
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

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

            await addExpense({
                date,
                category,
                amount: Number(amount),
                note: note.trim(),
                monthKey,
                createdAt: new Date().toISOString()
            });

            // Reset form (keep date and current category)
            setAmount('');
            setNote('');
            showToast("Expense added successfully", 'success');
        } catch (error: any) {
            console.error(error);
            showToast("Failed to add expense: " + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

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

    if (loading) return <div className="p-12 text-center text-slate-400">Loading expenses...</div>;

    // Filter Expenses by Year and optionally by Month
    const filteredExpenses = expenses.filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date);
        if (d.getFullYear() !== year) return false;
        if (selectedMonth !== 'All') {
            const monthIndex = MONTHS.indexOf(selectedMonth);
            if (monthIndex !== -1 && d.getMonth() !== monthIndex) return false;
        }
        return true;
    });

    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-3xl font-extrabold text-slate-900">Expenses</h2>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="pl-8 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                        >
                            <option value="All">All Months</option>
                            {MONTHS.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">Year: {year}</span>
                </div>
            </div>

            {/* Total Card */}
            <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl p-6 text-white shadow-lg shadow-rose-200">
                <div className="text-white/80 font-medium mb-1">Total Expenses ({selectedMonth === 'All' ? year : `${selectedMonth} ${year}`})</div>
                <div className="text-4xl font-extrabold tracking-tight">₹{totalExpenses.toLocaleString('en-IN')}</div>
            </div>

            {/* Add Expense Form */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Plus className="text-blue-600" size={20} /> New Expense
                    </h3>
                    <ReceiptScanner onScanComplete={(data) => {
                        if (data.date) setDate(data.date);
                        if (data.amount) setAmount(data.amount);
                        if (data.note) setNote(data.note);
                        if (data.category && allCategories.includes(data.category)) {
                            setCategory(data.category);
                        } else {
                            setCategory("Other");
                        }
                    }} />
                </div>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="date"
                                required
                                value={date}
                                onChange={e => setDate(e.target.value)}
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
                            className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? 'Adding...' : 'Add'}
                        </button>
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
                                        No expenses recorded for {selectedMonth === 'All' ? year : `${selectedMonth} ${year}`}.
                                    </td>
                                </tr>
                            ) : (
                                filteredExpenses.map(item => (
                                    editingId === item.id ? (
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
                                                <span className="inline-block px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-bold border border-slate-200">
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">
                                                {item.note || <span className="text-slate-300">-</span>}
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
                                    )
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

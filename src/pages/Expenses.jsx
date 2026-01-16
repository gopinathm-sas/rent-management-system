import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { ChevronLeft, ChevronRight, Trash2, Plus, Calendar, Tag, FileText, IndianRupee } from 'lucide-react';
import { getMonthKey, MONTHS } from '../lib/utils';

const EXPENSE_CATEGORIES = [
    "House Keeping Salary",
    "Electricity Bill",
    "Internet Bill",
    "Painting",
    "Room Maintenance",
    "Other"
];

export default function Expenses() {
    const { expenses, addExpense, deleteExpense, loading, globalYear } = useData();
    const { showToast, confirm } = useUI();
    const year = globalYear;

    // Form State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
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
                monthKey, // Legacy compatibility
                createdAt: new Date().toISOString()
            });

            // Reset form (keep date)
            setAmount('');
            setNote('');
            setCategory(EXPENSE_CATEGORIES[0]);
            showToast("Expense added successfully", 'success');
        } catch (error) {
            console.error(error);
            showToast("Failed to add expense: " + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
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
            } catch (e) {
                showToast("Failed to delete: " + e.message, 'error');
            }
        }
    };

    if (loading) return <div className="p-12 text-center text-slate-400">Loading expenses...</div>;

    // Filter Expenses by Year
    const filteredExpenses = expenses.filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date);
        return d.getFullYear() === year;
    });

    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-3xl font-extrabold text-slate-900">Expenses</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="font-semibold">Year: {year}</span>
                </div>
            </div>

            {/* Total Card */}
            <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl p-6 text-white shadow-lg shadow-rose-200">
                <div className="text-white/80 font-medium mb-1">Total Expenses ({year})</div>
                <div className="text-4xl font-extrabold tracking-tight">₹{totalExpenses.toLocaleString('en-IN')}</div>
            </div>

            {/* Add Expense Form */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Plus className="text-blue-600" size={20} /> New Expense
                </h3>
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
                    <div className="md:col-span-3">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <select
                                required
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 appearance-none"
                            >
                                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="md:col-span-3">
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

            {/* List */}
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
                                    <td colspan="5" className="px-6 py-12 text-center text-slate-400 italic">
                                        No expenses recorded for {year}.
                                    </td>
                                </tr>
                            ) : (
                                filteredExpenses.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 group">
                                        <td className="px-6 py-4 font-medium text-slate-600 whitespace-nowrap">
                                            {item.date}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            <span className="inline-block px-2 py-1 bg-slate-100 rounded-lg text-xs border border-slate-200">
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
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                title="Delete Expense"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

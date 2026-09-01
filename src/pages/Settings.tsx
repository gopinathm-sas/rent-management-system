import React, { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import {
    Settings as SettingsIcon,
    CreditCard,
    QrCode,
    Save,
    Building2,
    CheckCircle2,
    MessageSquare,
    DollarSign,
    Droplets,
    Phone,
    Info,
    RotateCcw,
    Smartphone
} from 'lucide-react';
import { DEFAULT_APP_SETTINGS } from '../lib/constants';
import { AppSettings } from '../types';

export default function Settings() {
    const { settings, updateSettings, loading } = useData();
    const { showToast } = useUI();

    const [formData, setFormData] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'payment' | 'billing' | 'property'>('payment');

    useEffect(() => {
        if (settings) {
            setFormData({ ...DEFAULT_APP_SETTINGS, ...settings });
        }
    }, [settings]);

    const handleChange = (field: keyof AppSettings, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            await updateSettings(formData);
            showToast('Settings saved successfully!', 'success');
        } catch (err: any) {
            console.error('Failed to save settings:', err);
            showToast(`Error saving settings: ${err.message || 'Unknown error'}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (settings) {
            setFormData({ ...DEFAULT_APP_SETTINGS, ...settings });
            showToast('Form reset to saved settings', 'info');
        }
    };

    // Live Message Previews
    const sampleTenant = 'John Doe';
    const sampleMonth = 'Aug 2026';
    const sampleUnits = 1200;
    const sampleRent = 8500;
    const sampleGarbage = formData.defaultServiceCharge || 60;
    const sampleWater = Math.round(sampleUnits * (formData.defaultWaterRate || 0.25));
    const sampleTotal = sampleRent + sampleGarbage + sampleWater;

    const upiFooter = formData.upiId
        ? `\n\nPlease transfer the amount to:\n*UPI ID:* ${formData.upiId}${formData.payeeName ? ` (${formData.payeeName})` : ''}${formData.upiPhone ? `\n*GPay / PhonePe:* ${formData.upiPhone}` : ''}\n\n_${formData.paymentNote || 'Please share the payment screenshot once transferred.'}_`
        : '\n\nPlease pay at the earliest.';

    const sampleWaterBillMessage = `Hi ${sampleTenant},\n\nWater Bill - ${sampleMonth}\nNo of Ltrs - ${sampleUnits.toLocaleString('en-IN')}\n\nBreakdown:\n- Rent: ₹${sampleRent.toLocaleString('en-IN')}\n- Garbage Bill: ₹${sampleGarbage.toLocaleString('en-IN')}\n- Water Bill: ₹${sampleWater.toLocaleString('en-IN')}\n\n*Total Amount: ₹${sampleTotal.toLocaleString('en-IN')}*${upiFooter}`;

    if (loading) {
        return <div className="p-12 text-center text-slate-400">Loading settings...</div>;
    }

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 md:p-8 rounded-3xl text-white shadow-xl border border-slate-800">
                <div>
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-extrabold uppercase tracking-widest mb-1.5">
                        <SettingsIcon size={14} /> Global Configuration
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Application Settings</h1>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        Configure payment UPI details, default billing rates, and notification templates for the entire app
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-2xl transition border border-white/10 flex items-center gap-1.5"
                    >
                        <RotateCcw size={14} /> Reset
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-2xl transition shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-950 border-t-transparent" />
                        ) : (
                            <Save size={16} />
                        )}
                        <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                <button
                    onClick={() => setActiveTab('payment')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition-all ${
                        activeTab === 'payment'
                            ? 'bg-emerald-100 text-emerald-950 shadow-sm ring-1 ring-emerald-300'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <QrCode size={16} />
                    <span>Payment & UPI Details</span>
                </button>
                <button
                    onClick={() => setActiveTab('billing')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition-all ${
                        activeTab === 'billing'
                            ? 'bg-emerald-100 text-emerald-950 shadow-sm ring-1 ring-emerald-300'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <Droplets size={16} />
                    <span>Billing & Utility Defaults</span>
                </button>
                <button
                    onClick={() => setActiveTab('property')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs transition-all ${
                        activeTab === 'property'
                            ? 'bg-emerald-100 text-emerald-950 shadow-sm ring-1 ring-emerald-300'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <Building2 size={16} />
                    <span>Property Profile</span>
                </button>
            </div>

            {/* Content Form & Live Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Form Fields Column (7 cols) */}
                <div className="lg:col-span-7 space-y-6">
                    <form onSubmit={handleSave} className="space-y-6">
                        {/* TAB 1: PAYMENT & UPI DETAILS */}
                        {activeTab === 'payment' && (
                            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                                        <QrCode size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-extrabold text-slate-900">UPI Payment Information</h3>
                                        <p className="text-xs text-slate-400">These details are automatically attached to all WhatsApp bills & payment reminders</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* UPI ID */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            UPI ID / VPA <span className="text-emerald-600">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.upiId || ''}
                                            onChange={(e) => handleChange('upiId', e.target.value)}
                                            placeholder="e.g. 9876543210@paytm or munirathnam@upi"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition"
                                        />
                                        <p className="text-[11px] text-slate-400">Tenants can directly copy or pay to this UPI address</p>
                                    </div>

                                    {/* Payee Name */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            Payee / Account Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.payeeName || ''}
                                            onChange={(e) => handleChange('payeeName', e.target.value)}
                                            placeholder="e.g. Munirathnam Illam / Owner Name"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition"
                                        />
                                    </div>

                                    {/* UPI Phone Number */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            GPay / PhonePe / Paytm Mobile Number
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">+91</span>
                                            <input
                                                type="tel"
                                                value={formData.upiPhone || ''}
                                                onChange={(e) => handleChange('upiPhone', e.target.value.replace(/[^0-9]/g, ''))}
                                                placeholder="9876543210"
                                                maxLength={10}
                                                className="w-full pl-14 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition font-mono"
                                            />
                                        </div>
                                    </div>

                                    {/* Payment Instructions / Note */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            Payment Note / Instruction
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={formData.paymentNote || ''}
                                            onChange={(e) => handleChange('paymentNote', e.target.value)}
                                            placeholder="e.g. Please share the payment screenshot once transferred."
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-sm text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition"
                                        />
                                    </div>
                                </div>

                                {/* Bank Account Section (Optional Fallback) */}
                                <div className="pt-4 border-t border-slate-100 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <CreditCard size={18} className="text-slate-400" />
                                        <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Bank Transfer Details (Optional Fallback)</h4>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="block text-[11px] font-bold text-slate-500">Bank Name</label>
                                            <input
                                                type="text"
                                                value={formData.bankName || ''}
                                                onChange={(e) => handleChange('bankName', e.target.value)}
                                                placeholder="e.g. HDFC Bank"
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="block text-[11px] font-bold text-slate-500">Account Holder</label>
                                            <input
                                                type="text"
                                                value={formData.bankAccountHolder || ''}
                                                onChange={(e) => handleChange('bankAccountHolder', e.target.value)}
                                                placeholder="e.g. Munirathnam M"
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="block text-[11px] font-bold text-slate-500">Account Number</label>
                                            <input
                                                type="text"
                                                value={formData.bankAccountNumber || ''}
                                                onChange={(e) => handleChange('bankAccountNumber', e.target.value)}
                                                placeholder="e.g. 50100012345678"
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition font-mono"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="block text-[11px] font-bold text-slate-500">IFSC Code</label>
                                            <input
                                                type="text"
                                                value={formData.bankIfsc || ''}
                                                onChange={(e) => handleChange('bankIfsc', e.target.value.toUpperCase())}
                                                placeholder="e.g. HDFC0001234"
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition font-mono uppercase"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: BILLING & UTILITY DEFAULTS */}
                        {activeTab === 'billing' && (
                            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                        <Droplets size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-extrabold text-slate-900">Billing & Utility Defaults</h3>
                                        <p className="text-xs text-slate-400">Default rates applied across all room billing calculations</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Default Water Rate */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            Default Water Rate per Liter (₹)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={formData.defaultWaterRate ?? 0.25}
                                            onChange={(e) => handleChange('defaultWaterRate', parseFloat(e.target.value) || 0)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition font-mono"
                                        />
                                        <p className="text-[11px] text-slate-400">Default rate is 0.25 (₹250 per 1,000 Liters)</p>
                                    </div>

                                    {/* Default Garbage / Service Charge */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            Default Monthly Garbage / Service Charge (₹)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.defaultServiceCharge ?? 60}
                                            onChange={(e) => handleChange('defaultServiceCharge', parseInt(e.target.value, 10) || 0)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition font-mono"
                                        />
                                        <p className="text-[11px] text-slate-400">Default service charge added to monthly rent totals</p>
                                    </div>

                                    {/* Annual Rent Revision % */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            Standard Annual Rent Revision Percentage (%)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={formData.rentRevisionPct ?? 10}
                                            onChange={(e) => handleChange('rentRevisionPct', parseInt(e.target.value, 10) || 10)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition font-mono"
                                        />
                                        <p className="text-[11px] text-slate-400">Standard escalation percentage for 1-year tenancy milestone</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: PROPERTY PROFILE */}
                        {activeTab === 'property' && (
                            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
                                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                        <Building2 size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-extrabold text-slate-900">Property Information</h3>
                                        <p className="text-xs text-slate-400">Primary contact and building details</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Property Name */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            Property / Building Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.propertyName || ''}
                                            onChange={(e) => handleChange('propertyName', e.target.value)}
                                            placeholder="e.g. Munirathnam Illam"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition"
                                        />
                                    </div>

                                    {/* Owner Phone */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                            Owner Contact Phone
                                        </label>
                                        <input
                                            type="tel"
                                            value={formData.ownerPhone || ''}
                                            onChange={(e) => handleChange('ownerPhone', e.target.value)}
                                            placeholder="e.g. 9876543210"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Submit Button */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full sm:w-auto px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-950 border-t-transparent" />
                                ) : (
                                    <Save size={18} />
                                )}
                                <span>{saving ? 'Saving Changes...' : 'Save All Settings'}</span>
                            </button>
                        </div>
                    </form>
                </div>

                {/* Live Message Simulator Preview (5 cols) */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-slate-900 p-6 sm:p-7 rounded-3xl text-white shadow-xl border border-slate-800 space-y-5 sticky top-6">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                                <Smartphone size={16} /> Live WhatsApp Preview
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Real-time
                            </span>
                        </div>

                        <div className="space-y-2">
                            <span className="text-xs font-bold text-slate-400">Generated Message Simulator:</span>
                            {/* Phone Chat Bubble Simulation */}
                            <div className="bg-[#0b141a] p-4 rounded-2xl border border-slate-800 font-sans text-xs text-slate-200 shadow-inner leading-relaxed whitespace-pre-line select-text">
                                <div className="bg-[#202c33] p-3.5 rounded-2xl rounded-tl-sm text-slate-100 border border-white/5 space-y-1">
                                    {sampleWaterBillMessage}
                                </div>
                            </div>
                        </div>

                        {/* Summary Status of Configured Payment Channel */}
                        <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60 space-y-2 text-xs">
                            <div className="flex items-center justify-between text-slate-400">
                                <span>Active UPI ID:</span>
                                <span className="font-bold text-white font-mono">{formData.upiId || 'Not configured'}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-400">
                                <span>GPay/PhonePe:</span>
                                <span className="font-bold text-white font-mono">{formData.upiPhone || 'Not configured'}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-400">
                                <span>Payee Name:</span>
                                <span className="font-bold text-white">{formData.payeeName || 'Default'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

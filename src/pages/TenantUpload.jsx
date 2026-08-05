import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth, googleProvider } from '../services/firebase';
import { uploadToCloudinary } from '../services/cloudinary';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { Upload, FileText, Check, AlertTriangle, Loader2, Shield, LogOut, X, XCircle, Edit3 } from 'lucide-react';

export default function TenantUpload() {
    const { token } = useParams();
    const [status, setStatus] = useState('verifying'); // verifying, login_required, valid, invalid, error
    const [user, setUser] = useState(null);
    const [tenant, setTenant] = useState(null);
    const [uploading, setUploading] = useState({});
    const [documents, setDocuments] = useState({});
    const [errorMsg, setErrorMsg] = useState('');
    const [textModalField, setTextModalField] = useState(null); // null | { target, fieldId, title, value }

    const showError = (msg) => {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(''), 5000);
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                validateToken();
            } else {
                setStatus('login_required');
            }
        });
        return () => unsubscribe();
    }, [token]);

    const handleLogin = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed", error);
            alert("Login failed. Please try again.");
        }
    };

    const handleLogout = () => {
        signOut(auth);
        setTenant(null);
        setStatus('login_required');
    };

    const validateToken = async () => {
        setStatus('verifying');
        try {
            const q = query(collection(db, 'properties'), where('uploadToken', '==', token));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                setStatus('invalid');
                return;
            }

            const docData = snapshot.docs[0];
            const tenantData = docData.data();
            setTenant({ id: docData.id, ...tenantData });
            setDocuments(tenantData.documents || {});

            setStatus('valid');
        } catch (error) {
            console.error("Link validation failed:", error);
            setStatus('error');
        }
    };

    const handleUpload = async (file, type) => {
        if (!file || !tenant) return;
        if (file.size > 10 * 1024 * 1024) {
            alert("File is too large. Max 10MB.");
            return;
        }

        setUploading(prev => ({ ...prev, [type]: true }));

        try {
            // Upload to Cloudinary
            const url = await uploadToCloudinary(file);

            const newDocs = { ...documents, [type]: url };

            // Save URL to Firestore
            await updateDoc(doc(db, 'properties', tenant.id), {
                documents: newDocs,
                [`meta_${type}_uploadedBy`]: user.email,
                [`meta_${type}_uploadedAt`]: new Date().toISOString()
            });

            setDocuments(newDocs);
        } catch (error) {
            console.error("Upload Error Details:", error);
            alert(`Upload failed: ${error.message}`);
        } finally {
            setUploading(prev => ({ ...prev, [type]: false }));
        }
    };

    if (status === 'verifying') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
                <Loader2 className="animate-spin mb-2" size={32} />
                <p>Verifying Access...</p>
            </div>
        );
    }

    if (status === 'login_required') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 w-full max-w-md text-center">
                    <Shield className="mx-auto text-blue-600 mb-4" size={48} />
                    <h1 className="text-xl font-bold text-slate-900 mb-2">Secure Upload Portal</h1>
                    <p className="text-slate-500 mb-8">Please sign in with Google to verify your identity and access the document vault.</p>

                    <button
                        onClick={handleLogin}
                        className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Sign in with Google
                    </button>
                    <p className="text-xs text-slate-400 mt-4">Munirathnam Illam Secure Cloud</p>
                </div>
            </div>
        );
    }

    if (status === 'invalid') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 w-full max-w-md">
                    <AlertTriangle className="mx-auto text-rose-500 mb-4" size={48} />
                    <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Link</h1>
                    <p className="text-slate-500">This link does not exist. Please request a new one.</p>
                </div>
            </div>
        );
    }

    if (status === 'expired') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 w-full max-w-md">
                    <div className="bg-amber-100 p-4 rounded-full inline-block mb-4 text-amber-600">
                        <Shield size={32} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 mb-2">Link Expired</h1>
                    <p className="text-slate-500 mb-4">This secure upload link has expired (valid for 24h only).</p>
                    <p className="text-sm font-bold text-slate-400">Please request a new link from the Admin.</p>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 w-full max-w-md">
                    <AlertTriangle className="mx-auto text-rose-500 mb-4" size={48} />
                    <h1 className="text-xl font-bold text-slate-900 mb-2">An Error Occurred</h1>
                    <p className="text-slate-500">Please try again later or contact support.</p>
                </div>
            </div>
        );
    }

    const UploadCard = ({ title, type, description }) => {
        const isUploaded = !!documents[type];
        const isUploading = uploading[type];

        return (
            <div className={`relative overflow-hidden rounded-2xl border transition-all ${isUploaded ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className={`p-3 rounded-xl ${isUploaded ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                            {isUploaded ? <Check size={24} strokeWidth={3} /> : <FileText size={24} />}
                        </div>
                        {isUploaded && <span className="text-xs font-bold text-emerald-600 bg-white px-2 py-1 rounded-full shadow-sm">UPLOADED</span>}
                    </div>

                    <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
                    <p className="text-sm text-slate-500 mb-6">{description}</p>

                    <label className={`block w-full text-center py-3 rounded-xl font-bold cursor-pointer transition-colors ${isUploaded
                        ? 'bg-white text-emerald-600 border-2 border-emerald-100 hover:border-emerald-200'
                        : 'bg-black text-white hover:bg-slate-800'
                        }`}>
                        {isUploading ? 'Uploading...' : (isUploaded ? 'Replace File' : 'Select File')}
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => handleUpload(e.target.files[0], type)}
                        />
                    </label>
                </div>
                {isUploading && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <Loader2 className="animate-spin text-black" size={32} />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12">
            <div className="max-w-xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div className="inline-block px-4 py-1.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold tracking-wide uppercase">
                        Secure Document Portal
                    </div>
                    <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm font-bold">
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-extrabold text-slate-900 mb-2">
                        Hello, {tenant.tenant}!
                    </h1>
                    <p className="text-slate-500">
                        Room {tenant.roomNo} ({tenant.roomId})
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Logged in as {user.email}</p>
                </div>

                <div className="space-y-6">
                    {/* Render Multiple Occupant Layout for Bachelors OR if specifically set to > 1 for Family */}
                    {(tenant.tenantType === 'Bachelors' || (tenant.occupantCount && tenant.occupantCount > 1)) ? (
                        Array.from({ length: tenant.occupantCount || 1 }).map((_, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex justify-between items-center">
                                    <span>Occupant #{i + 1}</span>
                                    {tenant.bachelorDetails?.[i]?.name && (
                                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{tenant.bachelorDetails[i].name}</span>
                                    )}
                                </h2>

                                {/* Occupant Details Input - Auto-saves on blur */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none"
                                            placeholder="Enter full name"
                                            defaultValue={tenant.bachelorDetails?.[i]?.name || ''}
                                            onBlur={(e) => {
                                                const newDetails = [...(tenant.bachelorDetails || [])];
                                                if (!newDetails[i]) newDetails[i] = {};
                                                newDetails[i].name = e.target.value;
                                                updateDoc(doc(db, 'properties', tenant.id), { bachelorDetails: newDetails });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Family Contact Number</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none"
                                            placeholder="Parent/Guardian number"
                                            defaultValue={tenant.bachelorDetails?.[i]?.familyPhone || ''}
                                            onBlur={(e) => {
                                                const val = e.target.value.trim();
                                                if (!val) return;

                                                const normalize = (s) => String(s || '').replace(/\D/g, '');
                                                const tenantPhone = normalize(tenant.phone);
                                                const inputPhone = normalize(val);

                                                if (tenantPhone && tenantPhone.length > 5 && inputPhone === tenantPhone) {
                                                    showError("Only Family contact numbers accepted. You cannot use your own number.");
                                                    e.target.value = '';
                                                    return;
                                                }

                                                const newDetails = [...(tenant.bachelorDetails || [])];
                                                if (!newDetails[i]) newDetails[i] = {};
                                                newDetails[i].familyPhone = val;
                                                updateDoc(doc(db, 'properties', tenant.id), { bachelorDetails: newDetails });
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <UploadCard
                                        title="Photo"
                                        type={`bachelor_${i}_photo`}
                                        description="Passport size photo."
                                    />
                                    <UploadCard
                                        title="Aadhar Card"
                                        type={`bachelor_${i}_aadhar`}
                                        description="Front and back."
                                    />
                                    <UploadCard
                                        title="ID Proof"
                                        type={`bachelor_${i}_pan`}
                                        description="PAN or Voter ID."
                                    />
                                    <UploadCard
                                        title="Rental Agreement"
                                        type={`bachelor_${i}_agreement`}
                                        description="Page with signature."
                                    />

                                    {/* Custom Sections / Fields for Occupant i */}
                                    {(tenant.bachelorDetails?.[i]?.customFields || []).map((cf) => (
                                        <div key={cf.id} className="pt-2">
                                            {cf.type === 'text' ? (
                                                <div
                                                    onClick={() => setTextModalField({ target: i, fieldId: cf.id, title: cf.title, value: cf.value || '' })}
                                                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition cursor-pointer flex items-center justify-between group"
                                                >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                                                            <FileText size={20} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="text-sm font-bold text-slate-900">{cf.title}</h4>
                                                            <p className="text-xs text-slate-500 truncate font-medium mt-0.5">
                                                                {cf.value ? cf.value : <span className="italic text-slate-400">Click to enter / view details</span>}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition">
                                                        {cf.value ? 'Edit' : 'Enter'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <UploadCard
                                                    title={cf.title}
                                                    type={cf.key}
                                                    description={`Upload file for ${cf.title}.`}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        // Family Layout
                        <>
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <label className="block text-sm font-bold text-slate-900 mb-2">Family Member Contact Numbers</label>
                                <p className="text-xs text-slate-500 mb-3">Please provide contact details for your family members (Name & Phone).</p>
                                <textarea
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                                    rows={3}
                                    placeholder="e.g. Spouse: 9876543210, Father: 9123456780"
                                    defaultValue={tenant.familyMembers || ''}
                                    onBlur={(e) => {
                                        updateDoc(doc(db, 'properties', tenant.id), { familyMembers: e.target.value });
                                    }}
                                />
                            </div>

                            <div className="space-y-4">
                                <UploadCard
                                    title="Tenant Photo"
                                    type="photo"
                                    description="Recent passport size photo."
                                />
                                <UploadCard
                                    title="Aadhar Card"
                                    type="aadhar"
                                    description="Front and back photo or PDF."
                                />
                                <UploadCard
                                    title="ID Proof"
                                    type="pan"
                                    description="Any valid government ID (PAN/Voter)."
                                />
                                <UploadCard
                                    title="Rental Agreement"
                                    type="agreement"
                                    description="Signed copy of the agreement."
                                />

                                {/* Family Custom Sections / Fields */}
                                {(tenant.customFields || []).map((cf) => (
                                    <div key={cf.id} className="pt-2">
                                        {cf.type === 'text' ? (
                                            <div
                                                onClick={() => setTextModalField({ target: 'family', fieldId: cf.id, title: cf.title, value: cf.value || '' })}
                                                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition cursor-pointer flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                                                        <FileText size={20} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-sm font-bold text-slate-900">{cf.title}</h4>
                                                        <p className="text-xs text-slate-500 truncate font-medium mt-0.5">
                                                            {cf.value ? cf.value : <span className="italic text-slate-400">Click to enter / view details</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition">
                                                    {cf.value ? 'Edit' : 'Enter'}
                                                </span>
                                            </div>
                                        ) : (
                                            <UploadCard
                                                title={cf.title}
                                                type={cf.key}
                                                description={`Upload file for ${cf.title}.`}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-12 text-center text-xs text-slate-400">
                    <p>Files are securely stored in Munirathnam Illam Cloud.</p>
                </div>
            </div>

            {/* Custom Text Entry Popup Modal for Tenant */}
            {textModalField && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-2xl">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-base">{textModalField.title}</h3>
                                    <p className="text-xs text-slate-500">Room {tenant?.roomNo} Upload</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setTextModalField(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Enter Details
                            </label>
                            <textarea
                                rows={6}
                                autoFocus
                                placeholder={`Enter details for ${textModalField.title}...`}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition resize-none leading-relaxed"
                                value={textModalField.value}
                                onChange={(e) => setTextModalField(prev => ({ ...prev, value: e.target.value }))}
                            />
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setTextModalField(null)}
                                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    const target = textModalField.target;
                                    const val = textModalField.value;
                                    if (target === 'family') {
                                        const updated = (tenant.customFields || []).map(f => f.id === textModalField.fieldId ? { ...f, value: val } : f);
                                        await updateDoc(doc(db, 'properties', tenant.id), { customFields: updated });
                                    } else {
                                        const newDetails = [...(tenant.bachelorDetails || [])];
                                        if (!newDetails[target]) newDetails[target] = {};
                                        if (!newDetails[target].customFields) newDetails[target].customFields = [];
                                        newDetails[target].customFields = newDetails[target].customFields.map(f => f.id === textModalField.fieldId ? { ...f, value: val } : f);
                                        await updateDoc(doc(db, 'properties', tenant.id), { bachelorDetails: newDetails });
                                    }
                                    setTextModalField(null);
                                }}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
                            >
                                <Check size={16} /> Save Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {errorMsg && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
                    <div className="bg-rose-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm mx-4 border-2 border-rose-400/50">
                        <XCircle className="shrink-0 text-white/90" size={24} />
                        <p className="font-bold text-sm leading-tight">{errorMsg}</p>
                        <button onClick={() => setErrorMsg('')} className="ml-auto p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

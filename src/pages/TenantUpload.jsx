import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth, googleProvider } from '../services/firebase';
import { uploadToCloudinary } from '../services/cloudinary';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { Upload, FileText, Check, AlertTriangle, Loader2, Shield, LogOut } from 'lucide-react';

export default function TenantUpload() {
    const { token } = useParams();
    const [status, setStatus] = useState('verifying'); // verifying, login_required, valid, invalid, error
    const [user, setUser] = useState(null);
    const [tenant, setTenant] = useState(null);
    const [uploading, setUploading] = useState({});
    const [documents, setDocuments] = useState({});

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
                        Secure Upload Portal
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
                    {tenant.tenantType === 'Bachelors' ? (
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
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none"
                                            placeholder="Mobile number"
                                            defaultValue={tenant.bachelorDetails?.[i]?.phone || ''}
                                            onBlur={(e) => {
                                                const newDetails = [...(tenant.bachelorDetails || [])];
                                                if (!newDetails[i]) newDetails[i] = {};
                                                newDetails[i].phone = e.target.value;
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
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-12 text-center text-xs text-slate-400">
                    <p>Files are securely stored in Munirathnam Illam Cloud.</p>
                </div>
            </div>
        </div>
    );
}

import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { findTenantForRoom, isOccupiedRecord } from '../lib/utils';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import { Users, Save, X, Link as LinkIcon, ExternalLink, Copy, Check, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUI } from '../contexts/UIContext';
import RoomCard from '../components/RoomCard'; // Reusing RoomCard for consistent layout

export default function Admin() {
    const { rooms, tenants, loading } = useData();
    const { showToast } = useUI();
    const [selectedRoom, setSelectedRoom] = useState(null);

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
            <h2 className="text-3xl font-extrabold text-slate-900">Admin</h2>

            {/* Room Layout Grid */}
            <div className="space-y-8 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
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
                    tenant={selectedRoom.tenant}
                    onClose={() => setSelectedRoom(null)}
                    showToast={showToast}
                    updateTenant={useData().updateTenant}
                />
            )}
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
                occupantCount: tenantType === 'Bachelors' ? occupantCount : 1
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

                <div className="p-6 space-y-6">
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

                            {tenantType === 'Bachelors' && (
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
                            )}

                            {/* Document Vault */}
                            <div className="pt-4 border-t border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Document Vault</p>
                                <DocumentVault
                                    tenant={tenant}
                                    updateTenant={updateTenant}
                                    showToast={showToast}
                                    tenantType={tenantType}
                                    occupantCount={occupantCount}
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
    const [isExpanded, setIsExpanded] = useState(false);
    const documents = tenant?.documents || {};
    const bachelorDetails = tenant?.bachelorDetails || [];

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
        window.open(`mailto:${tenant.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
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
                                    <ExternalLink size={16} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={generateLink}
                                className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition"
                            >
                                Generate Link
                            </button>
                        )}
                        <p className="text-[9px] text-slate-400 mt-2">
                            Link expires in 24 hours.
                        </p>
                    </div>

                    {/* Documents List */}
                    <div className="space-y-6">
                        {tenantType === 'Bachelors' ? (
                            Array.from({ length: occupantCount || 1 }).map((_, i) => (
                                <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <h5 className="font-bold text-xs text-slate-800 mb-3 uppercase tracking-wider border-b border-slate-200 pb-2">Occupant #{i + 1}</h5>

                                    {/* Metadata Fields */}
                                    <div className="grid grid-cols-1 gap-2 mb-4">
                                        <input
                                            placeholder="Occupant Name"
                                            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                            value={bachelorDetails[i]?.name || ''}
                                            onChange={(e) => updateBachelorDetail(i, 'name', e.target.value)}
                                        />
                                        <input
                                            placeholder="Phone Number"
                                            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                            value={bachelorDetails[i]?.phone || ''}
                                            onChange={(e) => updateBachelorDetail(i, 'phone', e.target.value)}
                                        />
                                        <input
                                            placeholder="Family Contact (Relationship: Number)"
                                            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                            value={bachelorDetails[i]?.familyPhone || ''}
                                            onChange={(e) => updateBachelorDetail(i, 'familyPhone', e.target.value)}
                                        />
                                    </div>

                                    {/* Docs */}
                                    <div className="space-y-2">
                                        <DocItem title="Photo" docUrl={documents[`bachelor_${i}_photo`]} onDelete={() => deleteDoc(`bachelor_${i}_photo`)} />
                                        <DocItem title="Aadhar" docUrl={documents[`bachelor_${i}_aadhar`]} onDelete={() => deleteDoc(`bachelor_${i}_aadhar`)} />
                                        <DocItem title="ID Proof" docUrl={documents[`bachelor_${i}_pan`]} onDelete={() => deleteDoc(`bachelor_${i}_pan`)} />
                                        <DocItem title="Agreement" docUrl={documents[`bachelor_${i}_agreement`]} onDelete={() => deleteDoc(`bachelor_${i}_agreement`)} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            // Family Mode (Default)
                            <div className="space-y-2">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Family Details</p>
                                    <p className="text-xs text-slate-600 whitespace-pre-wrap">{tenant.familyMembers || 'No family contact details added.'}</p>
                                </div>
                                <DocItem title="Tenant Photo" docUrl={documents.photo} onDelete={() => deleteDoc('photo')} />
                                <DocItem title="Aadhar Card" docUrl={documents.aadhar} onDelete={() => deleteDoc('aadhar')} />
                                <DocItem title="ID Proof" docUrl={documents.pan} onDelete={() => deleteDoc('pan')} />
                                <DocItem title="Rental Agreement" docUrl={documents.agreement} onDelete={() => deleteDoc('agreement')} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function DocItem({ title, docUrl, onDelete }) {
    return (
        <div className="flex items-center justify-between p-2 border border-slate-100 rounded-xl hover:bg-slate-50 transition">
            <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${docUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {docUrl ? <Check size={14} /> : <User size={14} />}
                </div>
                <div>
                    <div className="font-bold text-xs text-slate-700">{title}</div>
                    <div className="text-[9px] text-slate-400">{docUrl ? 'Uploaded' : 'Pending'}</div>
                </div>
            </div>
            {docUrl && (
                <div className="flex gap-1">
                    <a
                        href={docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="View"
                    >
                        <ExternalLink size={14} />
                    </a>
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                        title="Remove"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}

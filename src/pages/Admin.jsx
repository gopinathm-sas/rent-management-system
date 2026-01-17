import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { findTenantForRoom, isOccupiedRecord } from '../lib/utils';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import { Users, Save, X } from 'lucide-react';
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
                />
            )}
        </div>
    );
}

function AdminRoomModal({ room, tenant, onClose, showToast }) {
    const isOccupied = isOccupiedRecord(tenant);
    // Local state for edits
    const [tenantType, setTenantType] = useState(tenant?.tenantType || 'Family'); // Default to Family
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!tenant || !tenant.id) {
            showToast("No tenant record to update", "error");
            return;
        }

        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'properties', tenant.id), {
                tenantType: tenantType
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

                            {/* Placeholders for future Vault features */}
                            <div className="pt-4 border-t border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Document Vault</p>
                                <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-sm bg-slate-50">
                                    Vault migration coming soon...
                                </div>
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

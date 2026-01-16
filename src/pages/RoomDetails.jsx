import React from 'react';
import { useData } from '../contexts/DataContext';
import { findTenantForRoom, isOccupiedRecord, getMonthKey, computeRentCollectedForMonth, computePendingRentForMonth, getPrevYearMonth, formatMonthLabel } from '../lib/utils';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import RoomCard from '../components/RoomCard';
import { Home, AlertTriangle, CheckCircle2, CircleDollarSign } from 'lucide-react';
import RoomDetailsModal from '../components/RoomDetailsModal';

export default function RoomDetails() {
    const { rooms, tenants, loading } = useData();
    const [selectedRoom, setSelectedRoom] = React.useState(null);

    if (loading) return <div className="p-12 text-center text-slate-400">Loading rooms...</div>;

    const totalRooms = 12;

    // Floor Mapping
    const floors = [
        { name: 'Ground Floor', rooms: ['01', '02'] },
        { name: '1st Floor', rooms: ['04'] },
        { name: '2nd Floor', rooms: ['05', '06', '07'] },
        { name: '3rd Floor', rooms: ['08', '09', '10'] },
        { name: '4th Floor', rooms: ['11', '12', '13'] },
    ];

    // Metrics Calculation
    let occupiedCount = 0;
    floors.forEach(floor => {
        floor.rooms.forEach(roomNo => {
            const room = rooms[roomNo];
            if (room) {
                const t = findTenantForRoom(tenants, room.roomId);
                if (isOccupiedRecord(t)) occupiedCount++;
            }
        });
    });

    const vacantCount = totalRooms - occupiedCount;

    const MetricCard = ({ label, mainValue, subValue, icon: Icon, bgClass, iconClass }) => (
        <div className={`p-6 rounded-3xl ${bgClass} flex flex-col justify-between h-40 relative overflow-hidden`}>
            <div className="flex justify-between items-start z-10">
                <div>
                    <p className="text-sm font-semibold text-slate-600 mb-1">{label}</p>
                    <h3 className="text-4xl font-extrabold text-slate-900">{mainValue}</h3>
                    {subValue && <p className="text-xs text-slate-500 mt-2">{subValue}</p>}
                </div>
                <div className={`p-2 rounded-full ${iconClass}`}>
                    <Icon size={24} />
                </div>
            </div>
        </div>
    );

    const handleRoomClick = (room, tenant) => {
        setSelectedRoom({ room, tenant });
    };

    // Current Date Context for Status
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const currentKey = getMonthKey(currentYear, currentMonth);

    // Calculate Metrics
    // Calculate Metrics (Shifted to Previous Month)
    const prevDate = getPrevYearMonth(currentYear, currentMonth);
    const prevKey = getMonthKey(prevDate.year, prevDate.monthIndex);

    const rentReceived = computeRentCollectedForMonth(tenants, rooms, prevDate.year, prevDate.monthIndex);
    const pendingRent = computePendingRentForMonth(tenants, rooms, prevDate.year, prevDate.monthIndex);

    // Calculate Last Month Pending List (Also uses prevDate, which is now consistent)

    // Find rooms with pending rent for LAST month (Strict Unique Iteration)
    const pendingList = [];
    Object.keys(IMMUTABLE_ROOMS_DATA).forEach(roomNo => {
        const room = rooms[roomNo] || IMMUTABLE_ROOMS_DATA[roomNo];
        const tenant = findTenantForRoom(tenants, room.roomId);
        if (tenant && tenant.status === 'Occupied' && !tenant.isEvictionConfirmed) {
            const status = tenant.paymentHistory?.[prevKey];
            if (status === 'Pending') {
                pendingList.push({
                    roomNo: room.roomNo,
                    amount: tenant.rent, // Assuming full rent pending
                    tenantName: tenant.tenant
                });
            }
        }
    });

    return (
        <div className="space-y-8 pb-12">
            <h2 className="text-3xl font-extrabold text-slate-900">Room Details</h2>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    label="Occupied Rooms"
                    mainValue={occupiedCount}
                    subValue={`Out of ${totalRooms}`}
                    icon={Home}
                    bgClass="bg-stone-50 border border-stone-100"
                    iconClass="bg-emerald-100 text-emerald-700"
                />
                <MetricCard
                    label="Vacant Rooms"
                    mainValue={vacantCount}
                    subValue="Available"
                    icon={Home}
                    bgClass="bg-stone-50 border border-stone-100"
                    iconClass="bg-slate-200 text-slate-600"
                />
                <MetricCard
                    label="Rent Received"
                    mainValue={`₹${rentReceived.toLocaleString('en-IN')}`}
                    subValue={`Month of ${formatMonthLabel(prevDate.year, prevDate.monthIndex)}`}
                    icon={CheckCircle2}
                    bgClass="bg-stone-50 border border-stone-100"
                    iconClass="bg-emerald-100 text-emerald-700"
                />
                <MetricCard
                    label="Pending Rent"
                    mainValue={`₹${pendingRent.toLocaleString('en-IN')}`}
                    subValue={`Month of ${formatMonthLabel(prevDate.year, prevDate.monthIndex)}`}
                    icon={AlertTriangle}
                    bgClass="bg-stone-50 border border-stone-100"
                    iconClass="bg-amber-100 text-amber-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Room Grid by Floor */}
                <div className="lg:col-span-2 space-y-8 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
                    {floors.map((floor) => (
                        <div key={floor.name} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Floor Label */}
                            <div className="md:col-span-1 flex items-center">
                                <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{floor.name}</span>
                            </div>

                            {/* Rooms */}
                            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {floor.rooms.map(roomNo => {
                                    const room = rooms[roomNo];
                                    const tenant = findTenantForRoom(tenants, room?.roomId);

                                    // Determine Rent Status for Dashboard Door (Shifted to Previous Month)
                                    let rentStatus = null;
                                    if (tenant && tenant.status === 'Occupied') {
                                        if (tenant.isEvictionConfirmed) {
                                            rentStatus = 'Adjusted';
                                        } else {
                                            // Show Previous Month Status as rent is collected in following month
                                            rentStatus = tenant.paymentHistory?.[prevKey] || 'Pending';
                                        }
                                    }

                                    return (
                                        <RoomCard
                                            key={roomNo}
                                            roomNo={roomNo}
                                            roomData={room}
                                            tenantData={tenant}
                                            rentStatus={rentStatus}
                                            isPlaceholder={!room}
                                            onClick={() => handleRoomClick(room, tenant)}
                                        />
                                    )
                                })}
                                {floor.name === '1st Floor' ? (
                                    <div className="sm:col-span-2">
                                        <RoomCard
                                            roomNo="Owner"
                                            roomData={{ roomId: 'Flat' }}
                                            tenantData={{
                                                status: 'Occupied',
                                                tenant: 'Munirathnam',
                                                evictionConfirmed: false
                                            }}
                                            rentStatus="Paid" // Owner always Paid/N/A
                                            onClick={() => { }}
                                        />
                                    </div>
                                ) : (
                                    Array.from({ length: 3 - floor.rooms.length }).map((_, i) => (
                                        <RoomCard key={`placeholder-${i}`} isPlaceholder={true} />
                                    ))
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Right Column: Pending List (Sidebar) */}
                <div className="lg:col-span-1">
                    <div className="bg-stone-50 rounded-3xl border border-stone-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800">Last Month Pending</h3>
                            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full">{pendingList.length}</span>
                        </div>

                        <div className="space-y-3">
                            {pendingList.length > 0 ? (
                                pendingList.map((item, idx) => (
                                    <div key={idx} className="bg-white p-4 rounded-xl border border-stone-100 shadow-sm cursor-pointer hover:border-rose-200 transition" onClick={() => {
                                        // Open modal if we can find the room object
                                        const r = rooms[item.roomNo];
                                        const t = findTenantForRoom(tenants, r?.roomId);
                                        if (r && t) handleRoomClick(r, t);
                                    }}>
                                        <div className="flex justify-between mb-1">
                                            <span className="font-bold text-slate-700">Room {item.roomNo}</span>
                                            <span className="font-bold text-rose-600">₹{Number(item.amount).toLocaleString()}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">{item.tenantName}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-400 text-sm">
                                    No pending payments from last month.
                                </div>
                            )}

                            <p className="text-xs text-slate-400 mt-4 text-center">Click a row to open Rent Details.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {selectedRoom && (
                <RoomDetailsModal
                    room={selectedRoom.room}
                    tenant={findTenantForRoom(tenants, selectedRoom.room.roomId)}
                    onClose={() => setSelectedRoom(null)}
                />
            )}
        </div>
    );
}

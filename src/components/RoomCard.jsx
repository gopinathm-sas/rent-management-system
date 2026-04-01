import React from 'react';
import { User, ShieldAlert, Check, Clock, Home } from 'lucide-react';
import { getRentRevisionDetails } from '../lib/utils';

export default function RoomCard({ roomNo, roomData, tenantData, rentStatus, onClick, isPlaceholder = false }) {
    // Render placeholder (Empty wall space)
    if (isPlaceholder || !roomData) {
        return (
            <div className="h-[200px] rounded-t-xl mx-2 border-b-0 border-2 border-dashed border-slate-200 bg-slate-50/30 flex items-center justify-center">
                <span className="text-slate-200 font-bold text-xs uppercase tracking-widest">Empty</span>
            </div>
        );
    }

    const isOccupied = tenantData?.status === 'Occupied';
    const evictionConfirmed = Boolean(tenantData?.evictionConfirmed);
    const tenantName = isOccupied ? (tenantData?.tenant || 'Unknown') : 'Vacant';
    const revision = getRentRevisionDetails(tenantData);
    const isRevisionDue = revision.isDue;

    // Door Styles
    const doorColor = isOccupied
        ? (evictionConfirmed ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200')
        : 'bg-slate-100 border-slate-200';

    const frameColor = isOccupied
        ? (evictionConfirmed ? 'border-rose-900 bg-rose-900' : 'border-slate-800 bg-slate-800')
        : 'border-slate-400 bg-slate-400';

    const handleColor = isOccupied ? 'bg-amber-400 shadow-sm' : 'bg-slate-300';

    // Status Badge Logic
    const getStatusBadge = () => {
        if (!isOccupied || !rentStatus || rentStatus === 'None') return null;

        // Normalize Status
        const status = rentStatus === 'Adjusted' ? 'Adjusted' : rentStatus;

        const styles = {
            'Paid': 'bg-emerald-500 text-white border-emerald-600',
            'Pending': 'bg-rose-500 text-white border-rose-600 animate-pulse',
            'Rent Only': 'bg-purple-500 text-white border-purple-600',
            'Adjusted': 'bg-blue-500 text-white border-blue-600'
        };

        const labels = {
            'Paid': 'PAID',
            'Pending': 'DUE',
            'Rent Only': 'PARTIAL',
            'Adjusted': 'ADJ (SD)'
        };

        const style = styles[status] || 'bg-slate-500 text-white';
        const label = labels[status] || status;

        return (
            <div className={`mt-2 px-1.5 py-0.5 text-[8px] font-bold rounded shadow-sm border ${style} tracking-wider`}>
                {label}
            </div>
        );
    };

    return (
        <div
            onClick={onClick}
            className="group relative flex flex-col items-center justify-end h-[220px] cursor-pointer"
            title={`Room ${roomNo}`}
        >
            {/* Door Frame (The Wall Cutout) */}
            <div className={`relative w-full h-full rounded-t-2xl border-x-8 border-t-8 ${frameColor} shadow-xl overflow-hidden transition-transform transform group-hover:-translate-y-1`}>

                {/* The Door Panel */}
                <div className={`absolute inset-0 top-0.5 mx-0.5 mb-0 rounded-t-xl ${doorColor} border-x border-t shadow-inner flex flex-col items-center pt-6`}>

                    {/* Room Number Plate */}
                    <div className="bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-300 px-3 py-1 rounded shadow text-amber-900 font-bold text-lg font-mono">
                        {roomNo}
                    </div>
                    {isOccupied && <div className="text-[9px] text-slate-400 mt-1 font-mono">{roomData.roomId}</div>}

                    {/* Status Indicator / Peephole */}
                    <div className="mt-2">
                        {evictionConfirmed ? (
                            <div className="w-3 h-3 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50 animate-pulse" />
                        ) : isOccupied ? (
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                        ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                        )}
                    </div>

                    {/* Rent Status Badge */}
                    {getStatusBadge()}

                    {/* Rent Revision Sticker */}
                    {isOccupied && isRevisionDue && (
                        <div className="absolute top-10 right-2 bg-yellow-300 text-yellow-900 text-[8px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm rotate-[-12deg] border border-yellow-400 z-10">
                            REV DUE
                        </div>
                    )}

                    {/* Door Handle */}
                    <div className={`absolute right-3 top-1/2 w-3 h-3 rounded-full ${handleColor} border border-black/10`} />

                    {/* Tenant Name Plate (Bottom) */}
                    <div className="mt-auto mb-8 w-3/4 text-center">
                        <div className={`py-1 px-2 rounded border ${isOccupied ? 'bg-white border-slate-200 shadow-sm' : 'bg-transparent border-transparent'}`}>
                            <div className={`text-xs font-bold truncate ${isOccupied ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                                {tenantName}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floor Shadow */}
            <div className="absolute -bottom-2 w-[90%] h-2 bg-black/10 rounded-full blur-sm" />
        </div>
    );
}

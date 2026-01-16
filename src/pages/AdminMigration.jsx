import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { db } from '../services/firebase';
import { doc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { IMMUTABLE_ROOMS_DATA } from '../lib/constants';
import { useUI } from '../contexts/UIContext';

const SEED_TENANT_DATA = [
    { roomNo: '01', roomId: 'G01', tenant: 'Remish', rent: 5200, advance: 15000, join: '15-Oct-2024', rev: '15-Oct-2024', phone: '8526487895' },
    { roomNo: '02', roomId: 'G02', tenant: 'Anil (L)', rent: 500, advance: 650000, join: '24-Aug-2022', rev: '24-Aug-2022', phone: '8073256471' },
    { roomNo: '04', roomId: '102', tenant: 'Venkatesh(L)', rent: 500, advance: 450000, join: '24-Nov-2021', rev: '24-Nov-2021', phone: '9513072188' },
    { roomNo: '05', roomId: '201', tenant: 'Prem', rent: 8800, advance: 30000, join: '1-Feb-2024', rev: '1-Feb-2024', phone: '8639384523' },
    { roomNo: '06', roomId: '202', tenant: 'Aravind', rent: 8800, advance: 35000, join: '1-Aug-2025', rev: '', phone: '8147161034' },
    { roomNo: '07', roomId: '203', tenant: 'Panduranga', rent: 8800, advance: 28000, join: '23-Nov-2024', rev: '23-Nov-2024', phone: '9742392131' },
    { roomNo: '08', roomId: '301', tenant: 'Nirmal Raj', rent: 8800, advance: 30000, join: '1-Nov-2024', rev: '1-Nov-2024', phone: '6382702408' },
    { roomNo: '09', roomId: '302', tenant: 'Logesh', rent: 8300, advance: 25000, join: '26-Feb-2023', rev: '26-Feb-2024', phone: '7010250108' },
    { roomNo: '10', roomId: '303', tenant: 'Prasanth Patil', rent: 8800, advance: 25000, join: '01-Jan-2023', rev: '1-Jan-2024', phone: '9880662547' },
    { roomNo: '11', roomId: '401', tenant: 'Mastan', rent: 8000, advance: 25000, join: '31-Jul-2023', rev: '31-Jul-2024', phone: '9902217031' },
    { roomNo: '12', roomId: '402', tenant: 'Sudha / Bharath', rent: 8000, advance: 25000, join: '31-Jul-2023', rev: '31-Jul-2024', phone: '9100770982' },
    { roomNo: '13', roomId: '403', tenant: 'Siri/Vamsi', rent: 8000, advance: 25000, join: '31-Jul-2023', rev: '31-Jul-2024', phone: '6303596330' }
];

const SEED_WATER_DATA = {
    // Keys format: YYYY-Mon (e.g., 2024-Apr). Order: Apr-24 to Dec-24 then Jan-25 to Dec-25.
    // Columns in screenshot: 
    // Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec (2024)
    // Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec (2025)
    '01': [67, 125, 191, 316, 534, 584, 723, 967, 1129, 1389, 1503, 1813, 1944, 2180, 2379, 2550, 2649, 2768, 2865, 3174, 3314],
    '02': [270, 1005, 1377, 1892, 2407, 2959, 3498, 3797, 4309, 4803, 5264, 6150, 7065, 7302, 7880, 8594, 9148, 10088, 10957, 11449, 11456],
    '04': [211, 572, 861, 1228, 1528, 1793, 2025, 2263, 2579, 3030, 3361, 4278, 4771, 5476, 6008, 6461, 6902, 7382, 7886, 8313, 8684],
    '05': [79, 158, 502, 956, 1360, 1734, 1900, 2422, 2953, 3112, 3673, 4347, 4885, 5262, 5649, 5914, 6174, 6430, 6569, 6816, 6986],
    '06': [213, 242, 640, 1078, 1306, 1643, 2095, 2572, 2842, 3207, 3710, 4182, 4404, 4637, 4811, 4855, 5113, 5465, 5678, 5991, 6299],
    '07': [609, 1375, 2635, 3621, 3621, 4378, 4624, 4738, 5068, 5441, 5865, 6428, 6781, 7162, 7411, 8186, 8983, 9800, 10339, 10972, 11814],
    '08': [0, 0, 137, 578, 1007, 1007, 1007, 1007, 1007, 494, 1223, 1769, 2216, 2258, 2403, 2439, 3039, 3039, 3039, 3039, 3039],
    '09': [137, 359, 500, 700, 847, 1058, 1240, 1419, 1586, 1683, 1858, 2154, 2464, 2674, 2888, 3092, 3141, 3342, 3446, 3595, 3708],
    '10': [101, 275, 540, 673, 1227, 1412, 1527, 1642, 1807, 1951, 2278, 2472, 3084, 4500, 5511, 6628, 7066, 8161, 9391, 10388, 11723],
    '11': [150, 303, 524, 756, 932, 1087, 1240, 1451, 1625, 1802, 1953, 2181, 2426, 2719, 2945, 3189, 3474, 3734, 3986, 4184, 4400],
    '12': [88, 169, 345, 471, 728, 1037, 1260, 1621, 2047, 2112, 2500, 2821, 3097, 3341, 3503, 3934, 4245, 4577, 4915, 5144, 5331],
    '13': [214, 488, 754, 1152, 1606, 2048, 2409, 2888, 3387, 3791, 4255, 4676, 4887, 5154, 5575, 6516, 6710, 7293, 7509, 7757, 8005]
};

const parseDateSeed = (dateStr) => {
    if (!dateStr) return '';
    const months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
        'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    const parts = dateStr.split('-');
    if (parts.length !== 3) return ''; // Unexpected format
    const day = parts[0].padStart(2, '0');
    const month = months[parts[1]];
    const year = parts[2];
    if (!month) return '';
    return `${year}-${month}-${day}`;
};

export default function AdminMigration() {
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const { confirm, showToast } = useUI();

    const migrateRooms = async () => {
        const isConfirmed = await confirm({
            title: 'Migrate Rooms?',
            message: "This will overwrite/create room data in 'rooms' collection. Continue?"
        });
        if (!isConfirmed) return;

        setLoading(true);
        setStatus('Starting migration...');
        try {
            const batch = writeBatch(db);
            const roomsCollection = collection(db, 'rooms');

            let count = 0;
            Object.entries(IMMUTABLE_ROOMS_DATA).forEach(([key, data]) => {
                const ref = doc(db, 'rooms', key);
                batch.set(ref, {
                    ...data,
                    sortOrder: parseInt(key) // Add sort order for easier querying
                });
                count++;
            });

            await batch.commit();
            const msg = `Successfully migrated ${count} rooms to Firestore.`;
            setStatus(msg);
            showToast(msg, 'success');
        } catch (e) {
            console.error(e);
            const err = 'Error: ' + e.message;
            setStatus(err);
            showToast(err, 'error');
        } finally {
            setLoading(false);
        }
    };

    const seedTenants = async () => {
        const isConfirmed = await confirm({
            title: 'Seed Tenant Data?',
            message: "This will CREATE new tenant records in 'properties'.\nWarning: This clears existing data and overwrites it. Continue?",
            type: 'danger',
            confirmText: 'Yes, Overwrite'
        });
        if (!isConfirmed) return;

        setLoading(true);
        setStatus('Seeding tenants...');
        try {
            const batch = writeBatch(db);
            const tenantsCollection = collection(db, 'properties');

            // 1. Clear existing data to prevent duplicates/stale data
            const snapshot = await getDocs(tenantsCollection);
            snapshot.forEach((doc) => {
                batch.delete(doc.ref);
            });

            // 2. Add new seed data
            SEED_TENANT_DATA.forEach((tData) => {
                // Generate a custom ID or let Firebase auto-id?
                // Let's use roomNo as part of ID to avoid duplicates if we run multiple times: 'tenant_room_01'
                const docRef = doc(db, 'properties', `tenant_room_${tData.roomNo}`);

                const joinDate = parseDateSeed(tData.join);
                const lastRevision = parseDateSeed(tData.rev);

                // Prepare water readings
                const waterReadings = {};
                const waterMeterReset = {};
                const rawWater = SEED_WATER_DATA[tData.roomNo] || [];

                // Map array to keys: 2024_Apr...2024_Dec, 2025_Jan...2025_Dec
                const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; // 2024
                const months25 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; // 2025

                let valIndex = 0;
                let prevVal = 0;

                // 2024
                months.forEach(m => {
                    const key = `2024-${m}`;
                    const val = rawWater[valIndex];
                    if (val !== undefined && val !== null) {
                        waterReadings[key] = val;
                        if (valIndex > 0 && val < prevVal) {
                            waterMeterReset[key] = true;
                            console.log(`Reset detected for Room ${tData.roomNo} at ${key}: ${prevVal} -> ${val}`);
                        }
                        prevVal = val;
                    }
                    valIndex++;
                });

                // 2025
                months25.forEach(m => {
                    const key = `2025-${m}`;
                    const val = rawWater[valIndex];
                    if (val !== undefined && val !== null) {
                        waterReadings[key] = val;
                        if (val < prevVal) {
                            waterMeterReset[key] = true;
                            console.log(`Reset detected for Room ${tData.roomNo} at ${key}: ${prevVal} -> ${val}`);
                        }
                        prevVal = val;
                    }
                    valIndex++;
                });

                batch.set(docRef, {
                    tenant: tData.tenant,
                    roomNo: tData.roomNo,
                    roomId: tData.roomId,
                    rent: String(tData.rent),
                    advance: String(tData.advance),
                    joinDate: joinDate,
                    lastRevision: lastRevision,
                    status: 'Occupied',
                    phone: tData.phone || '', // Use seeded phone
                    email: '',
                    waterRate: '0.25',
                    waterReadings,
                    waterMeterReset,
                    paymentHistory: {},
                    paymentTotals: {}
                });
            });

            await batch.commit();
            setStatus('Successfully seeded tenants.');
        } catch (e) {
            console.error(e);
            setStatus('Error seeding: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 bg-white rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-2xl font-bold mb-4">Data Migration Admin</h2>

            <div className="mb-6">
                <h3 className="font-semibold mb-2">Migrate Rooms</h3>
                <p className="text-sm text-slate-500 mb-4">
                    Uploads the hardcoded IMMUTABLE_ROOMS_DATA to Firestore 'rooms' collection.
                </p>
                <button
                    onClick={migrateRooms}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Migrating...' : 'Start Migration'}
                </button>
            </div>

            <div className="mb-6 border-t pt-6">
                <h3 className="font-semibold mb-2">Seed Tenant Data</h3>
                <p className="text-sm text-slate-500 mb-4">
                    Populates 'properties' collection with data from screenshot (Remish, Anil, etc.).
                    <br />
                    <span className="text-amber-600 font-bold">Warning:</span> Clears/Overwrites if ID 'tenant_room_XX' exists.
                </p>
                <button
                    onClick={seedTenants}
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                    {loading ? 'Seeding...' : 'Seed Tenants'}
                </button>
            </div>

            {status && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono whitespace-pre-wrap">
                    {status}
                </div>
            )}
        </div>
    );
}

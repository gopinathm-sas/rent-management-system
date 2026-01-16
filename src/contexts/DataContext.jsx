import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { IMMUTABLE_ROOMS_DATA, RENT_WATER_SERVICE_CHARGE } from '../lib/constants';
import { computeWaterForMonth, getDefaultWaterRateForRoom } from '../lib/utils';

const DataContext = createContext();

export function useData() {
    return useContext(DataContext);
}

export function DataProvider({ children }) {
    const [tenants, setTenants] = useState([]); // This maps to 'properties' collection
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [rooms, setRooms] = useState(IMMUTABLE_ROOMS_DATA); // Use constant for now, switch to DB later

    // Subscriptions
    useEffect(() => {
        // Tenants Subscription
        const qTenants = query(collection(db, 'properties'));
        const unsubTenants = onSnapshot(qTenants, (snapshot) => {
            const data = {};
            snapshot.forEach(doc => {
                data[doc.id] = { id: doc.id, ...doc.data() };
            });
            setTenants(data);
        }, (error) => {
            console.error("Error fetching tenants:", error);
        });

        // Expenses Subscription
        const qExpenses = query(collection(db, 'expenses'), orderBy('date', 'desc'));
        const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
            const list = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setExpenses(list);
        }, (error) => {
            console.error("Error fetching expenses:", error);
        });

        // Rooms Subscription (Dynamic with Fallback)
        const qRooms = query(collection(db, 'rooms')); // Add orderBy if needed later
        const unsubRooms = onSnapshot(qRooms, (snapshot) => {
            if (snapshot.empty) {
                console.warn("Rooms collection empty. Using hardcoded fallback.");
                setRooms(IMMUTABLE_ROOMS_DATA);
            } else {
                // Initialize with immutable default to ensure all keys exist
                const roomData = { ...IMMUTABLE_ROOMS_DATA };

                snapshot.forEach(doc => {
                    // Only overwrite if doc ID matches strict schema or just merge?
                    // Safe to merge.
                    if (roomData[doc.id]) {
                        roomData[doc.id] = { ...roomData[doc.id], ...doc.data() };
                    } else {
                        // If DB has extra rooms (unlikely), add them
                        roomData[doc.id] = doc.data();
                    }
                });

                const sortedKeys = Object.keys(roomData).sort();
                const sortedRooms = {};
                sortedKeys.forEach(k => sortedRooms[k] = roomData[k]);

                setRooms(sortedRooms);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching rooms:", error);
            // Fallback on error (e.g. permission denied)
            setRooms(IMMUTABLE_ROOMS_DATA);
            setLoading(false);
        });

        return () => {
            unsubTenants();
            unsubExpenses();
            unsubRooms();
        };
    }, []);

    const updateRentStatus = async (roomId, key, currentStatus, tenantData, year, monthIndex) => {
        // Status Transition Logic
        let newStatus = 'Pending';
        if (currentStatus === 'Pending') newStatus = 'Rent Only';
        else if (currentStatus === 'Rent Only') newStatus = 'Paid';
        else if (currentStatus === 'Paid') newStatus = 'None';

        const updatePayload = {};

        // Calculate Totals if Paid
        if (newStatus === 'Paid') {
            const rent = Number(tenantData?.rent) || 0;

            const waterRate = (tenantData?.waterRate !== null && tenantData?.waterRate !== undefined && String(tenantData?.waterRate).trim() !== '') ? Number(tenantData?.waterRate) : getDefaultWaterRateForRoom(tenantData?.roomNo);

            const water = computeWaterForMonth(tenantData, year, monthIndex, waterRate);

            if (!Number.isFinite(water?.amount)) {
                throw new Error('Please enter water readings for this month AND previous month (Water Bill screen) before marking Paid.');
            }
            if (Number(water?.units) < 0) {
                throw new Error('Water units cannot be negative. Please check readings.');
            }

            const total = Math.round((rent + Number(water.amount) + RENT_WATER_SERVICE_CHARGE) * 100) / 100;
            updatePayload[`paymentHistory.${key}`] = 'Paid';
            updatePayload[`paymentTotals.${key}`] = total;
        } else if (newStatus === 'None') {
            updatePayload[`paymentHistory.${key}`] = null;
            updatePayload[`paymentTotals.${key}`] = null;
        } else {
            updatePayload[`paymentHistory.${key}`] = newStatus;
            updatePayload[`paymentTotals.${key}`] = null;
        }

        // Firestore Update
        if (!tenantData?.id) throw new Error("Tenant ID missing");
        await updateDoc(doc(db, 'properties', tenantData.id), updatePayload);
    };

    const addExpense = async (expenseData) => {
        const { addDoc, collection } = await import('firebase/firestore');
        await addDoc(collection(db, 'expenses'), expenseData);
    };

    const deleteExpense = async (id) => {
        const { deleteDoc, doc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'expenses', id));
    };

    const updateTenant = async (id, data) => {
        await updateDoc(doc(db, 'properties', id), data);
    };

    const [globalYear, setGlobalYear] = useState(new Date().getFullYear());

    const value = {
        tenants,
        expenses,
        rooms,
        loading,
        globalYear,
        setGlobalYear,
        updateRentStatus,
        addExpense,
        deleteExpense,
        updateTenant,
        createTenant: async (data) => {
            const { addDoc, collection } = await import('firebase/firestore');
            await addDoc(collection(db, 'properties'), data);
        }
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}

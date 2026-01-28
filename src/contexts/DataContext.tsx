import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';

import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { IMMUTABLE_ROOMS_DATA, RENT_WATER_SERVICE_CHARGE } from '../lib/constants';
import { computeWaterForMonth, getDefaultWaterRateForRoom } from '../lib/utils';
import { Tenant, Expense, RoomData } from '../types';

interface DataContextType {
    tenants: Record<string, Tenant>;
    expenses: Expense[];
    error: Error | null;
    debugUser: { email: string };
    rooms: Record<string, RoomData>;
    loading: boolean;
    globalYear: number;
    setGlobalYear: (year: number) => void;
    updateRentStatus: (roomId: string, key: string, currentStatus: string, tenantData: Tenant, year: number, monthIndex: number) => Promise<void>;
    addExpense: (expenseData: Omit<Expense, 'id'>) => Promise<void>;
    deleteExpense: (id: string) => Promise<void>;
    updateTenant: (id: string, data: Partial<Tenant>) => Promise<void>;
    createTenant: (data: Omit<Tenant, 'id'>) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function useData() {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}

export function DataProvider({ children }: { children: ReactNode }) {
    const [tenants, setTenants] = useState<Record<string, Tenant>>({}); // This maps to 'properties' collection
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loadingState, setLoadingState] = useState({
        tenants: true,
        expenses: true,
        rooms: true
    });
    const loading = Object.values(loadingState).some(v => v);
    const [rooms, setRooms] = useState<Record<string, RoomData>>(IMMUTABLE_ROOMS_DATA);


    // Subscriptions
    const { currentUser } = useAuth();
    useEffect(() => {
        if (!currentUser) return;

        // Tenants Subscription

        const qTenants = query(collection(db, 'properties'));
        const unsubTenants = onSnapshot(qTenants, (snapshot) => {
            const data: Record<string, Tenant> = {};
            snapshot.forEach(doc => {
                data[doc.id] = { id: doc.id, ...doc.data() } as Tenant;
            });
            setTenants(data);
            setLoadingState(prev => ({ ...prev, tenants: false }));
        }, (error) => {
            console.error("Error fetching tenants:", error);
            setLoadingState(prev => ({ ...prev, tenants: false }));
        });

        // Expenses Subscription
        const qExpenses = query(collection(db, 'expenses'), orderBy('date', 'desc'));
        const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
            const list: Expense[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as Expense);
            });
            setExpenses(list);
            setLoadingState(prev => ({ ...prev, expenses: false }));
        }, (error) => {
            console.error("Error fetching expenses:", error);
            setLoadingState(prev => ({ ...prev, expenses: false }));
        });

        // Rooms Subscription (Dynamic with Fallback)
        const qRooms = query(collection(db, 'rooms'));
        const unsubRooms = onSnapshot(qRooms, (snapshot) => {
            if (snapshot.empty) {
                console.warn("Rooms collection empty. Using hardcoded fallback.");
                setRooms(IMMUTABLE_ROOMS_DATA);
            } else {
                const roomData = { ...IMMUTABLE_ROOMS_DATA };
                snapshot.forEach(doc => {
                    const d = doc.data() as RoomData;
                    // @ts-ignore - dynamic properties
                    if (roomData[doc.id]) {
                        // @ts-ignore
                        roomData[doc.id] = { ...roomData[doc.id], ...d };
                    } else {
                        // @ts-ignore
                        roomData[doc.id] = d;
                    }
                });

                const sortedKeys = Object.keys(roomData).sort();
                const sortedRooms: Record<string, RoomData> = {};
                sortedKeys.forEach(k => sortedRooms[k] = roomData[k]);

                setRooms(sortedRooms);

            }
            setLoadingState(prev => ({ ...prev, rooms: false }));
        }, (error) => {
            console.error("Error fetching rooms:", error);
            setRooms(IMMUTABLE_ROOMS_DATA);
            setLoadingState(prev => ({ ...prev, rooms: false }));
        });

        return () => {
            unsubTenants();
            unsubExpenses();
            unsubRooms();
        };
    }, [currentUser]);

    const updateRentStatus = async (_roomId: string, key: string, currentStatus: string, tenantData: Tenant, year: number, monthIndex: number) => {
        let newStatus = 'Pending';
        if (currentStatus === 'Pending') newStatus = 'Rent Only';
        else if (currentStatus === 'Rent Only') newStatus = 'Paid';
        else if (currentStatus === 'Paid') newStatus = 'None';

        const updatePayload: Record<string, any> = {};

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

            // @ts-ignore - amount is clearly number here if finite
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

        if (!tenantData?.id) throw new Error("Tenant ID missing");
        await updateDoc(doc(db, 'properties', tenantData.id), updatePayload);
    };

    const addExpenseHandler = async (expenseData: Omit<Expense, 'id'>) => {
        await addDoc(collection(db, 'expenses'), expenseData);
    };

    const deleteExpenseHandler = async (id: string) => {
        await deleteDoc(doc(db, 'expenses', id));
    };

    const updateTenantHandler = async (id: string, data: Partial<Tenant>) => {
        await updateDoc(doc(db, 'properties', id), data);
    };

    const createTenantHandler = async (data: Omit<Tenant, 'id'>) => {
        await addDoc(collection(db, 'properties'), data);
    };

    const [globalYear, setGlobalYear] = useState(new Date().getFullYear());
    const [error] = useState<Error | null>(null);

    const value: DataContextType = {
        tenants,
        expenses,
        error,
        debugUser: { email: 'Check AuthContext' },
        rooms,
        loading,
        globalYear,
        setGlobalYear,
        updateRentStatus,
        addExpense: addExpenseHandler,
        deleteExpense: deleteExpenseHandler,
        updateTenant: updateTenantHandler,
        createTenant: createTenantHandler
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}

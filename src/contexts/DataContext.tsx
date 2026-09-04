import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';

import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { IMMUTABLE_ROOMS_DATA, RENT_WATER_SERVICE_CHARGE, DEFAULT_APP_SETTINGS } from '../lib/constants';
import { computeWaterForMonth, getDefaultWaterRateForRoom, isFirstOccupancyMonth, getProratedRent, isLastDayOfMonth, getMonthKey, isMonthBeforeJoinDate, isEvictionMonth } from '../lib/utils';
import { Tenant, Expense, RoomData, AppSettings, DiaryNote } from '../types';

interface DataContextType {
    tenants: Record<string, Tenant>;
    expenses: Expense[];
    diaryNotes: DiaryNote[];
    error: Error | null;
    debugUser: { email: string };
    rooms: Record<string, RoomData>;
    settings: AppSettings;
    loading: boolean;
    globalYear: number;
    setGlobalYear: (year: number) => void;
    updateRentStatus: (roomId: string, key: string, currentStatus: string, tenantData: Tenant, year: number, monthIndex: number, deductionDays?: number) => Promise<void>;
    revertRentStatus: (tenantId: string, key: string, prevStatus: string | null, prevTotal: number | null) => Promise<void>;
    addExpense: (expenseData: Omit<Expense, 'id'>) => Promise<void>;
    updateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
    deleteExpense: (id: string) => Promise<void>;
    updateTenant: (id: string, data: Partial<Tenant>) => Promise<void>;
    createTenant: (data: Omit<Tenant, 'id'>) => Promise<void>;
    updateSettings: (data: Partial<AppSettings>) => Promise<void>;
    saveDiaryNote: (dateKey: string, data: Partial<DiaryNote>) => Promise<void>;
    deleteDiaryNote: (dateKey: string) => Promise<void>;
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
    const [diaryNotes, setDiaryNotes] = useState<DiaryNote[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
    const [loadingState, setLoadingState] = useState({
        tenants: true,
        expenses: true,
        rooms: true
    });
    const loading = Object.values(loadingState).some(v => v);
    const [rooms, setRooms] = useState<Record<string, RoomData>>(IMMUTABLE_ROOMS_DATA);

    // Subscriptions
    const { currentUser } = useAuth();
    const { showToast } = useUI();

    useEffect(() => {
        if (!currentUser) return;

        const autoSetPendingRentForTenants = async (tenantMap: Record<string, Tenant>) => {
            try {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();
                const isLastDay = isLastDayOfMonth(now);

                const updates: { tenantId: string; payload: Record<string, any> }[] = [];

                Object.values(tenantMap).forEach(tenant => {
                    if (!tenant?.id || tenant.status !== 'Occupied' || tenant.isEvictionConfirmed) return;

                    const payload: Record<string, any> = {};

                    // Check current month if today is the last day of the month
                    if (isLastDay) {
                        const key = getMonthKey(currentYear, currentMonth);
                        const hasStatus = tenant.paymentHistory && tenant.paymentHistory[key];
                        if (!hasStatus && !isMonthBeforeJoinDate(key, tenant.joinDate) && !isEvictionMonth(tenant, currentYear, currentMonth)) {
                            payload[`paymentHistory.${key}`] = 'Pending';
                        }
                    }

                    // Check previous month
                    const prevDate = new Date(currentYear, currentMonth - 1, 1);
                    const prevKey = getMonthKey(prevDate.getFullYear(), prevDate.getMonth());
                    const hasPrevStatus = tenant.paymentHistory && tenant.paymentHistory[prevKey];
                    if (!hasPrevStatus && !isMonthBeforeJoinDate(prevKey, tenant.joinDate) && !isEvictionMonth(tenant, prevDate.getFullYear(), prevDate.getMonth())) {
                        payload[`paymentHistory.${prevKey}`] = 'Pending';
                    }

                    if (Object.keys(payload).length > 0) {
                        updates.push({ tenantId: tenant.id, payload });
                    }
                });

                if (updates.length > 0) {
                    await Promise.all(
                        updates.map(({ tenantId, payload }) => updateDoc(doc(db, 'properties', tenantId), payload))
                    );
                }
            } catch (err) {
                console.error("Auto set pending rent error:", err);
            }
        };

        // Tenants Subscription
        const unsubTenants = onSnapshot(collection(db, 'properties'), (snapshot) => {
            const tenantMap: Record<string, Tenant> = {};
            snapshot.forEach(doc => {
                const data = doc.data() as Tenant;
                tenantMap[doc.id] = { ...data, id: doc.id };
            });
            setTenants(tenantMap);
            setLoadingState(prev => ({ ...prev, tenants: false }));

            // Trigger automatic pending status assignment check
            autoSetPendingRentForTenants(tenantMap);
        }, (error) => {
            console.error("Error fetching tenants:", error);
            showToast(`Error fetching tenants: ${error.message}`, 'error');
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
            showToast(`Error fetching expenses: ${error.message}`, 'error');
            setLoadingState(prev => ({ ...prev, expenses: false }));
        });

        // Rooms Subscription (Dynamic with Fallback)
        const qRooms = query(collection(db, 'rooms'));
        const unsubRooms = onSnapshot(qRooms, (snapshot) => {
            if (snapshot.empty) {
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
            showToast(`Error fetching rooms: ${error.message}`, 'warning');
            setRooms(IMMUTABLE_ROOMS_DATA);
            setLoadingState(prev => ({ ...prev, rooms: false }));
        });

        // Settings Subscription
        const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
            if (docSnap.exists()) {
                setSettings({ ...DEFAULT_APP_SETTINGS, ...docSnap.data() } as AppSettings);
            } else {
                setSettings(DEFAULT_APP_SETTINGS);
            }
        }, (error) => {
            console.error("Error fetching settings:", error);
        });

        // Diary Notes Subscription
        const qDiary = query(collection(db, 'diaryNotes'), orderBy('date', 'desc'));
        const unsubDiary = onSnapshot(qDiary, (snapshot) => {
            const list: DiaryNote[] = [];
            snapshot.forEach(d => {
                list.push({ id: d.id, ...d.data() } as DiaryNote);
            });
            setDiaryNotes(list);
        }, (error) => {
            console.error("Error fetching diary notes:", error);
            showToast(`Error fetching diary notes: ${error.message}`, 'error');
        });

        return () => {
            unsubTenants();
            unsubExpenses();
            unsubRooms();
            unsubSettings();
            unsubDiary();
        };
    }, [currentUser]);

    const updateRentStatus = async (_roomId: string, key: string, currentStatus: string, tenantData: Tenant, year: number, monthIndex: number, deductionDays?: number) => {
        let newStatus = 'Pending';
        if (currentStatus === 'Pending') newStatus = 'Rent Only';
        else if (currentStatus === 'Rent Only') newStatus = 'Paid';
        else if (currentStatus === 'Paid') newStatus = 'None';

        const updatePayload: Record<string, any> = {};

        if (newStatus === 'Paid') {
            let rent = Number(tenantData?.rent) || 0;

            // Prorate rent for first month of occupancy (joined mid-month)
            if (isFirstOccupancyMonth(tenantData, year, monthIndex) && tenantData?.joinDate) {
                rent = getProratedRent(rent, tenantData.joinDate, deductionDays);
            }

            const effectiveWaterRate = Number(tenantData?.waterRate) || getDefaultWaterRateForRoom(tenantData.roomNo);
            const waterCalculation = computeWaterForMonth(tenantData, year, monthIndex, effectiveWaterRate);
            const waterCharge = waterCalculation?.amount || 0;
            const serviceCharge = settings.defaultServiceCharge ?? RENT_WATER_SERVICE_CHARGE;

            const total = rent + waterCharge + serviceCharge;

            updatePayload[`paymentHistory.${key}`] = 'Paid';
            updatePayload[`paymentTotals.${key}`] = total;
        } else if (newStatus === 'Rent Only') {
            let rent = Number(tenantData?.rent) || 0;
            if (isFirstOccupancyMonth(tenantData, year, monthIndex) && tenantData?.joinDate) {
                rent = getProratedRent(rent, tenantData.joinDate, deductionDays);
            }
            updatePayload[`paymentHistory.${key}`] = 'Rent Only';
            updatePayload[`paymentTotals.${key}`] = rent;
        } else if (newStatus === 'None') {
            updatePayload[`paymentHistory.${key}`] = 'None';
            updatePayload[`paymentTotals.${key}`] = 0;
        } else {
            updatePayload[`paymentHistory.${key}`] = 'Pending';
            updatePayload[`paymentTotals.${key}`] = 0;
        }

        await updateDoc(doc(db, 'properties', tenantData.id), updatePayload);
    };

    const revertRentStatus = async (tenantId: string, key: string, prevStatus: string | null, prevTotal: number | null) => {
        const statusValue = prevStatus === null ? 'None' : prevStatus;
        const totalValue = prevTotal === null ? 0 : prevTotal;

        await updateDoc(doc(db, 'properties', tenantId), {
            [`paymentHistory.${key}`]: statusValue,
            [`paymentTotals.${key}`]: totalValue
        });
    };

    const addExpenseHandler = async (expenseData: Omit<Expense, 'id'>) => {
        await addDoc(collection(db, 'expenses'), expenseData);
    };

    const deleteExpenseHandler = async (id: string) => {
        await deleteDoc(doc(db, 'expenses', id));
    };

    const updateExpenseHandler = async (id: string, data: Partial<Expense>) => {
        await updateDoc(doc(db, 'expenses', id), data);
    };

    const updateTenantHandler = async (id: string, data: Partial<Tenant>) => {
        await updateDoc(doc(db, 'properties', id), data);
    };

    const createTenantHandler = async (data: Omit<Tenant, 'id'>) => {
        await addDoc(collection(db, 'properties'), data);
    };

    const updateSettingsHandler = async (data: Partial<AppSettings>) => {
        await setDoc(doc(db, 'settings', 'global'), data, { merge: true });
        setSettings(prev => ({ ...prev, ...data }));
    };

    const saveDiaryNoteHandler = async (dateKey: string, data: Partial<DiaryNote>) => {
        const noteDocRef = doc(db, 'diaryNotes', dateKey);
        const nowIso = new Date().toISOString();
        const payload: Record<string, any> = {
            ...data,
            id: dateKey,
            date: dateKey,
            updatedAt: nowIso
        };
        if (data.createdAt === undefined) {
            payload.createdAt = nowIso;
        }
        await setDoc(noteDocRef, payload, { merge: true });
    };

    const deleteDiaryNoteHandler = async (dateKey: string) => {
        await deleteDoc(doc(db, 'diaryNotes', dateKey));
    };

    const [globalYear, setGlobalYear] = useState(new Date().getFullYear());
    const [error] = useState<Error | null>(null);

    const value: DataContextType = {
        tenants,
        expenses,
        diaryNotes,
        error,
        debugUser: { email: 'Check AuthContext' },
        rooms,
        settings,
        loading,
        globalYear,
        setGlobalYear,
        updateRentStatus,
        revertRentStatus,
        addExpense: addExpenseHandler,
        updateExpense: updateExpenseHandler,
        deleteExpense: deleteExpenseHandler,
        updateTenant: updateTenantHandler,
        createTenant: createTenantHandler,
        updateSettings: updateSettingsHandler,
        saveDiaryNote: saveDiaryNoteHandler,
        deleteDiaryNote: deleteDiaryNoteHandler
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}

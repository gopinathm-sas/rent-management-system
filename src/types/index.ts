export interface RoomData {
    roomNo: string;
    roomId: string; // e.g., "G01", "101"
    keyNo: string;
    ebServNo: string;
    ebAcNo: string;
}

export interface Expense {
    id: string;
    date: string;
    category: string;
    amount: number;
    note?: string;
    createdAt?: string;
    monthKey?: string;
}

export interface PaymentHistory {
    [monthKey: string]: 'Paid' | 'Pending' | 'None' | string;
}

export interface WaterReadings {
    [monthKey: string]: number | string;
}

export interface CustomField {
    id: string;
    title: string;
    type: 'document' | 'text';
    key?: string;
    value?: string;
}

export interface BachelorDetail {
    name?: string;
    familyPhone?: string;
    customFields?: CustomField[];
}

export interface Tenant {
    id: string;
    tenant: string; // The tenant's name (legacy field name in DB)
    roomId: string;
    roomNo: string; // Derived or direct
    rent: number;
    advance: number;
    joinDate: string; // YYYY-MM-DD
    phone: string;

    // Status
    status: 'Occupied' | 'Vacant' | string;
    isEvictionConfirmed?: boolean;
    evictionNoticeDate?: string;
    noRevision?: boolean;

    // Financials
    paymentHistory?: PaymentHistory;
    paymentTotals?: Record<string, number>; // total paid per month
    waterReadings?: WaterReadings;
    waterMeterReset?: Record<string, boolean>;
    waterRate?: number;

    // Revision
    lastRevision?: string;
    lastRent?: number;

    // Legacy / Archival
    archivedTenant?: Tenant;

    // Document Vault & Custom Fields
    documents?: Record<string, string>;
    customFields?: CustomField[];
    bachelorDetails?: BachelorDetail[];
    tenantType?: 'Family' | 'Bachelors' | string;
    occupantCount?: number;
    uploadToken?: string;
    uploadTokenCreatedAt?: string;

    // Optional
    email?: string;
    idProofUrl?: string;
}

export interface Room {
    id: string;
    name: string; // "Room 101"
    floor: number;
    type: '1BHK' | '2BHK' | 'Single';
    status: 'Occupied' | 'Vacant';
    tenantId?: string;
}

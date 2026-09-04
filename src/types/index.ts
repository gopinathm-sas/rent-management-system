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
    pendingConfirmation?: boolean;
    recurringId?: string;
    suggestedAmount?: number;
    source?: string;
}

export interface RecurringExpense {
    id: string;
    category: string;
    dayOfMonth: number; // 1 to 31
    defaultAmount?: number;
    noteTemplate?: string;
    status: 'active' | 'paused';
    createdAt: string;
    updatedAt?: string;
    lastGeneratedMonth?: string; // "YYYY-Mon" e.g. "2026-Sep"
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

export interface AppSettings {
    // Payment & UPI Details
    upiId: string;
    payeeName: string;
    upiPhone: string;
    paymentNote: string;

    // Bank Account Details (Optional Fallback)
    bankName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    bankAccountHolder?: string;

    // Billing & Utility Defaults
    defaultWaterRate?: number;
    defaultServiceCharge?: number;
    defaultUnitsMultiplier?: number;
    rentRevisionPct?: number;

    // Property Profile
    propertyName?: string;
    ownerPhone?: string;
    ownerEmail?: string;
}

export type DiaryNoteColor = 'yellow' | 'green' | 'pink' | 'blue' | 'purple' | 'orange';

export interface DiaryNote {
    id: string;          // "YYYY-MM-DD"
    date: string;        // "YYYY-MM-DD"
    content: string;     // Note text
    tags: string[];      // Array of free-form tags
    color?: DiaryNoteColor | string; // Pastel sticky note color theme
    createdAt?: string;  // ISO timestamp
    updatedAt?: string;  // ISO timestamp
}

export interface ImportantNote {
    id: string;
    title: string;       // AI-generated or user header (e.g. "Bank Account Details", "WiFi Credentials")
    content: string;     // Note text / details
    category?: string;   // "Finance" | "Property" | "Credentials" | "Contacts" | "General"
    tags: string[];      // Array of tags
    color?: DiaryNoteColor | string;
    createdAt?: string;  // ISO timestamp
    updatedAt?: string;  // ISO timestamp
    pinned?: boolean;
}


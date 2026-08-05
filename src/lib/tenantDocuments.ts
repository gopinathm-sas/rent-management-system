import { Tenant } from '../types';

export function getClearedDocumentUploadFields() {
    return {
        documents: {},
        uploadToken: null,
        uploadTokenCreatedAt: null,
        bachelorDetails: [],
        familyMembers: '',
        tenantType: null,
        occupantCount: null,
        customFields: []
    };
}

function normalizeIdentityValue(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

export function hasTenantIdentityChanged(currentTenant: Tenant | null | undefined, nextData: Record<string, unknown>) {
    if (!currentTenant || currentTenant.status !== 'Occupied') return false;

    const nextName = normalizeIdentityValue(nextData.tenant);
    const currentName = normalizeIdentityValue(currentTenant.tenant);
    const nameChanged = Boolean(nextName) && nextName !== currentName;

    if (!nameChanged) return false;

    const joinDateChanged = 'joinDate' in nextData
        && normalizeIdentityValue(nextData.joinDate) !== normalizeIdentityValue(currentTenant.joinDate);
    const phoneChanged = 'phone' in nextData
        && normalizeIdentityValue(nextData.phone) !== normalizeIdentityValue(currentTenant.phone);
    const emailChanged = 'email' in nextData
        && normalizeIdentityValue(nextData.email) !== normalizeIdentityValue(currentTenant.email);

    return joinDateChanged || phoneChanged || emailChanged;
}

export function hasActiveDocumentUploadData(tenant: any) {
    if (!tenant) return false;

    return Boolean(
        Object.keys(tenant.documents || {}).length
        || tenant.uploadToken
        || tenant.uploadTokenCreatedAt
        || (Array.isArray(tenant.bachelorDetails) && tenant.bachelorDetails.length)
        || tenant.familyMembers
        || (Array.isArray(tenant.customFields) && tenant.customFields.length)
    );
}

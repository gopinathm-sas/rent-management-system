/**
 * Custom Embedded Login UI & Auth Logic Tests
 */

function validateEmail(email) {
    const trimmed = (email || '').trim();
    if (!trimmed) return false;
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(trimmed);
}

function formatAuthError(error) {
    const err = error || {};
    const code = err.code || '';

    switch (code) {
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/user-disabled':
            return 'This account has been disabled. Please contact the administrator.';
        case 'auth/unauthorized-domain': {
            const domain = typeof window !== 'undefined' && window.location ? window.location.hostname : 'this domain';
            return `Domain "${domain}" is not authorized in Firebase Auth. Add it under Firebase Console > Authentication > Settings > Authorized domains.`;
        }
        case 'auth/quota-exceeded':
        case 'auth/too-many-requests':
            return 'Too many requests. Please wait a moment before trying again.';
        case 'auth/invalid-action-code':
            return 'This sign-in link is invalid or has already been used. Please request a new link.';
        case 'auth/expired-action-code':
            return 'This sign-in link has expired. Please request a new link.';
        case 'auth/popup-blocked':
        case 'auth/popup-closed-by-user':
            return 'Sign-in window was closed. Please try again.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection and try again.';
        default:
            return err.message || 'Authentication failed. Please try again.';
    }
}

describe('Login Authentication & Validation Unit Tests', () => {
    describe('validateEmail', () => {
        test('accepts valid email addresses', () => {
            expect(validateEmail('user@example.com')).toBe(true);
            expect(validateEmail('admin.property@munirathnam.in')).toBe(true);
            expect(validateEmail('test+alias@domain.co.uk')).toBe(true);
            expect(validateEmail('  spaced@domain.com  ')).toBe(true);
        });

        test('rejects invalid email addresses', () => {
            expect(validateEmail('')).toBe(false);
            expect(validateEmail('   ')).toBe(false);
            expect(validateEmail('notanemail')).toBe(false);
            expect(validateEmail('missing@domain')).toBe(false);
            expect(validateEmail('missingdomain.com')).toBe(false);
            expect(validateEmail('@domain.com')).toBe(false);
            expect(validateEmail('user@.com')).toBe(false);
        });
    });

    describe('formatAuthError', () => {
        test('formats known Firebase auth error codes into friendly user messages', () => {
            expect(formatAuthError({ code: 'auth/invalid-email' })).toBe('Please enter a valid email address.');
            expect(formatAuthError({ code: 'auth/user-disabled' })).toBe('This account has been disabled. Please contact the administrator.');
            expect(formatAuthError({ code: 'auth/quota-exceeded' })).toBe('Too many requests. Please wait a moment before trying again.');
            expect(formatAuthError({ code: 'auth/too-many-requests' })).toBe('Too many requests. Please wait a moment before trying again.');
            expect(formatAuthError({ code: 'auth/invalid-action-code' })).toBe('This sign-in link is invalid or has already been used. Please request a new link.');
            expect(formatAuthError({ code: 'auth/expired-action-code' })).toBe('This sign-in link has expired. Please request a new link.');
            expect(formatAuthError({ code: 'auth/network-request-failed' })).toBe('Network error. Please check your internet connection and try again.');
        });

        test('formats unauthorized domain with actionable instructions', () => {
            const errorMsg = formatAuthError({ code: 'auth/unauthorized-domain' });
            expect(errorMsg).toContain('is not authorized in Firebase Auth');
            expect(errorMsg).toContain('Authorized domains');
        });

        test('falls back gracefully to custom message or generic default', () => {
            expect(formatAuthError({ message: 'Custom server rejection' })).toBe('Custom server rejection');
            expect(formatAuthError({})).toBe('Authentication failed. Please try again.');
        });
    });

    describe('Magic Link LocalStorage Handling', () => {
        beforeEach(() => {
            localStorage.clear();
        });

        test('stores and clears emailForSignIn correctly', () => {
            const email = 'tenant@example.com';
            localStorage.setItem('emailForSignIn', email);
            expect(localStorage.getItem('emailForSignIn')).toBe(email);

            localStorage.removeItem('emailForSignIn');
            expect(localStorage.getItem('emailForSignIn')).toBeNull();
        });
    });
});

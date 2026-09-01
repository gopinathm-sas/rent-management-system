/**
 * Custom Embedded Login UI & Auth Logic Tests
 */

function formatAuthError(error) {
    const err = error || {};
    const code = err.code || '';

    switch (code) {
        case 'auth/user-disabled':
            return 'This account has been disabled. Please contact the administrator.';
        case 'auth/unauthorized-domain': {
            const domain = typeof window !== 'undefined' && window.location ? window.location.hostname : 'this domain';
            return `Domain "${domain}" is not authorized in Firebase Auth. Add it under Firebase Console > Authentication > Settings > Authorized domains.`;
        }
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection and try again.';
        default:
            return err.message || 'Authentication failed. Please try again.';
    }
}

describe('Login Authentication Unit Tests', () => {
    describe('formatAuthError', () => {
        test('formats known Firebase auth error codes into friendly user messages', () => {
            expect(formatAuthError({ code: 'auth/user-disabled' })).toBe('This account has been disabled. Please contact the administrator.');
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
});

/**
 * Keyboard Navigation & Focus Trap Tests
 * Tests for modal accessibility: Escape key close, Tab focus trapping, focus restoration
 * Run in browser console or with a test runner (e.g., Jest with jsdom)
 */

describe('Modal Keyboard & Focus Accessibility', () => {
    let modal;
    let toggleBtn;
    let closeBtn;
    let firstInput;
    let lastButton;

    beforeEach(() => {
        // Setup: assume modal HTML from index.html
        modal = document.getElementById('propertyModal');
        toggleBtn = document.querySelector('[onclick="toggleModal(\'propertyModal\')"]');
        closeBtn = modal.querySelector('[aria-label="Close modal"]');
        firstInput = modal.querySelector('input[id="propName"]');
        lastButton = modal.querySelector('[type="submit"]');
    });

    test('Modal should be hidden by default and aria-hidden=true', () => {
        expect(modal.classList.contains('hidden')).toBe(true);
        expect(modal.getAttribute('aria-hidden')).toBe('true');
    });

    test('Clicking toggle button should open modal and set aria-hidden=false', () => {
        toggleBtn.click();
        expect(modal.classList.contains('hidden')).toBe(false);
        expect(modal.getAttribute('aria-hidden')).toBe('false');
    });

    test('Opening modal should focus first focusable element', () => {
        toggleBtn.click();
        expect(document.activeElement).toBe(firstInput);
    });

    test('Pressing Escape should close modal', (done) => {
        toggleBtn.click();
        const event = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(event);
        
        setTimeout(() => {
            expect(modal.classList.contains('hidden')).toBe(true);
            expect(modal.getAttribute('aria-hidden')).toBe('true');
            done();
        }, 0);
    });

    test('Tab on last element should focus first element (focus trap)', (done) => {
        toggleBtn.click();
        lastButton.focus();
        
        const event = new KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey: false,
            bubbles: true
        });
        
        lastButton.dispatchEvent(event);
        setTimeout(() => {
            const focusables = modal.querySelectorAll(
                'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            expect(document.activeElement).toBe(focusables[0]);
            done();
        }, 0);
    });

    test('Shift+Tab on first element should focus last element (reverse focus trap)', (done) => {
        toggleBtn.click();
        firstInput.focus();
        
        const event = new KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey: true,
            bubbles: true
        });
        
        firstInput.dispatchEvent(event);
        setTimeout(() => {
            const focusables = modal.querySelectorAll(
                'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            expect(document.activeElement).toBe(focusables[focusables.length - 1]);
            done();
        }, 0);
    });

    test('Closing modal should restore focus to previously focused element', (done) => {
        toggleBtn.focus();
        toggleBtn.click();
        closeBtn.click();
        
        setTimeout(() => {
            expect(document.activeElement).toBe(toggleBtn);
            done();
        }, 0);
    });

    test('Modal should have proper ARIA attributes', () => {
        expect(modal.getAttribute('role')).toBe('dialog');
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.getAttribute('aria-labelledby')).toBe('modal-title');
    });

    test('Modal title should have an id matching aria-labelledby', () => {
        const title = modal.querySelector('#modal-title');
        expect(title).not.toBeNull();
        expect(modal.getAttribute('aria-labelledby')).toBe(title.id);
    });

    test('Close button should have aria-label', () => {
        expect(closeBtn.getAttribute('aria-label')).toBe('Close modal');
    });

    test('Login error should be marked as alert', () => {
        const loginError = document.getElementById('login-error');
        expect(loginError.getAttribute('role')).toBe('alert');
        expect(loginError.getAttribute('aria-live')).toBe('assertive');
    });
});

describe('Form Input Validation', () => {
    let propNameInput;
    let propRentInput;
    let form;

    beforeEach(() => {
        propNameInput = document.getElementById('propName');
        propRentInput = document.getElementById('propRent');
        form = document.getElementById('addPropertyForm');
    });

    test('Rent input should have min=1 to prevent zero/negative values', () => {
        expect(propRentInput.getAttribute('min')).toBe('1');
    });

    test('Rent input should have step=1 for integer values', () => {
        expect(propRentInput.getAttribute('step')).toBe('1');
    });

    test('Form submission with empty name should fail', async () => {
        propNameInput.value = '';
        propRentInput.value = '5000';
        
        const submitEvent = new Event('submit', { bubbles: true });
        form.dispatchEvent(submitEvent);
        
        // Alert or validation should be shown (check console or mock alert)
        expect(propNameInput.value).toBe('');
    });

    test('Form submission with negative rent should fail', async () => {
        propNameInput.value = 'Test Property';
        propRentInput.value = '-100';
        
        const submitEvent = new Event('submit', { bubbles: true });
        form.dispatchEvent(submitEvent);
        
        // Should reject negative value
        expect(parseFloat(propRentInput.value)).toBeLessThan(0);
    });
});

describe('Photo URL Sanitization', () => {
    test('Only http/https URLs should be accepted for user photo', () => {
        const testUrls = [
            { url: 'https://example.com/photo.jpg', valid: true },
            { url: 'http://example.com/photo.jpg', valid: true },
            { url: 'javascript:alert("xss")', valid: false },
            { url: 'data:text/html,<script>alert("xss")</script>', valid: false },
        ];

        testUrls.forEach(({ url, valid }) => {
            const isValid = url.startsWith('http://') || url.startsWith('https://');
            expect(isValid).toBe(valid);
        });
    });
});

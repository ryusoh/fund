import { initBackgroundSweepEffect, stopBackgroundSweepEffect } from '@ui/backgroundSweep.js';

describe('backgroundSweep.js', () => {
    let container;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '<div class="page-wrapper"></div>';
        container = document.querySelector('.page-wrapper');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('initBackgroundSweepEffect returns no-op trigger when effectConfig is missing/disabled', () => {
        const { triggerSweep } = initBackgroundSweepEffect({ effectConfig: { enabled: false } });
        expect(typeof triggerSweep).toBe('function');
        triggerSweep();
        expect(container.classList.contains('sweeping')).toBe(false);
    });

    test('initBackgroundSweepEffect returns no-op trigger when container is missing', () => {
        const { triggerSweep } = initBackgroundSweepEffect({
            selector: '.non-existent',
            effectConfig: { enabled: true },
        });
        triggerSweep();
        expect(container.classList.contains('sweeping')).toBe(false);
    });

    test('initBackgroundSweepEffect sets CSS variables on the wrapper element', () => {
        const setPropertySpy = jest.spyOn(container.style, 'setProperty');
        initBackgroundSweepEffect({
            selector: '.page-wrapper',
            effectConfig: {
                enabled: true,
                sweepDuration: 5,
                colors: { color1: 'red', color2: 'blue' },
            },
        });

        expect(setPropertySpy).toHaveBeenCalledWith('--optic-sweep-duration', '5s');
        expect(setPropertySpy).toHaveBeenCalledWith('--optic-color-1', 'red');
        expect(setPropertySpy).toHaveBeenCalledWith('--optic-color-2', 'blue');
        setPropertySpy.mockRestore();
    });

    test('initBackgroundSweepEffect handles missing colors in effectConfig', () => {
        const setPropertySpy = jest.spyOn(container.style, 'setProperty');
        initBackgroundSweepEffect({
            selector: '.page-wrapper',
            effectConfig: {
                enabled: true,
                sweepDuration: 3,
            },
        });

        expect(setPropertySpy).toHaveBeenCalledWith('--optic-sweep-duration', '3s');
        expect(setPropertySpy).not.toHaveBeenCalledWith('--optic-color-1', expect.any(String));
        expect(setPropertySpy).not.toHaveBeenCalledWith('--optic-color-2', expect.any(String));
        setPropertySpy.mockRestore();
    });

    test('triggerSweep adds and removes the "sweeping" class', () => {
        const { triggerSweep } = initBackgroundSweepEffect({
            selector: '.page-wrapper',
            effectConfig: { enabled: true, sweepDuration: 3 },
        });

        triggerSweep();

        expect(container.classList.contains('sweeping')).toBe(true);

        jest.advanceTimersByTime(3000);

        expect(container.classList.contains('sweeping')).toBe(false);
    });

    test('triggerSweep clears existing timers on consecutive calls', () => {
        const { triggerSweep } = initBackgroundSweepEffect({
            selector: '.page-wrapper',
            effectConfig: { enabled: true, sweepDuration: 3 },
        });

        triggerSweep();
        jest.advanceTimersByTime(1000); // Wait 1 second
        expect(container.classList.contains('sweeping')).toBe(true);

        triggerSweep(); // Should reset the timer
        jest.advanceTimersByTime(2500); // 1.0 + 2.5 = 3.5 total seconds, but timer was reset

        expect(container.classList.contains('sweeping')).toBe(true); // Still true because 2.5s < 3s

        jest.advanceTimersByTime(500); // Now 3s from the second call

        expect(container.classList.contains('sweeping')).toBe(false);
    });

    test('triggerSweep does nothing if document.body does not contain wrapper', () => {
        const { triggerSweep } = initBackgroundSweepEffect({
            selector: '.page-wrapper',
            effectConfig: { enabled: true, sweepDuration: 3 },
        });

        // Remove from DOM
        container.remove();

        triggerSweep();

        expect(container.classList.contains('sweeping')).toBe(false);
    });

    test('stopBackgroundSweepEffect removes class and clears timers', () => {
        const { triggerSweep } = initBackgroundSweepEffect({
            selector: '.page-wrapper',
            effectConfig: { enabled: true, sweepDuration: 3 },
        });

        triggerSweep();
        expect(container.classList.contains('sweeping')).toBe(true);

        stopBackgroundSweepEffect('.page-wrapper');

        expect(container.classList.contains('sweeping')).toBe(false);

        // Advancing timers should not throw or cause unexpected class toggles
        jest.advanceTimersByTime(3000);
        expect(container.classList.contains('sweeping')).toBe(false);
    });

    test('stopBackgroundSweepEffect handles missing wrapper gracefully', () => {
        // Just verify it doesn't throw
        expect(() => stopBackgroundSweepEffect('.non-existent')).not.toThrow();
    });

    test('returns early if document is undefined (stopBackgroundSweepEffect)', () => {
        const originalDocument = global.document;
        delete global.document;

        expect(() => stopBackgroundSweepEffect('.page-wrapper')).not.toThrow();

        global.document = originalDocument;
    });

    test('returns early if document is undefined (initBackgroundSweepEffect)', () => {
        const originalDocument = global.document;
        delete global.document;

        const { triggerSweep } = initBackgroundSweepEffect();
        expect(typeof triggerSweep).toBe('function');
        expect(() => triggerSweep()).not.toThrow();

        global.document = originalDocument;
    });

    test('handles sweepNextTimer appropriately if active', () => {
        // We simulate a state where sweepNextTimer would be populated.
        // It isn't explicitly set in triggerSweep based on current code, but let's mock the timeout structure.
        jest.useFakeTimers();
        const { triggerSweep } = initBackgroundSweepEffect({
            selector: '.page-wrapper',
            effectConfig: { enabled: true, sweepDuration: 3 },
        });

        // We can't directly set sweepNextTimer from the test since it's an internal variable
        // But we can trigger the sweep multiple times to cover branching logic.
        triggerSweep();
        triggerSweep();

        stopBackgroundSweepEffect('.page-wrapper');
        expect(container.classList.contains('sweeping')).toBe(false);
        jest.useRealTimers();
    });
});

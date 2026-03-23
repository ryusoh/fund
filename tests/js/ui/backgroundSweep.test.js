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

        jest.isolateModules(() => {
            const {
                stopBackgroundSweepEffect: stopSweep,
            } = require('../../../js/ui/backgroundSweep.js');
            expect(() => stopSweep('.page-wrapper')).not.toThrow();
        });

        global.document = originalDocument;
    });

    test('returns early if document is undefined (initBackgroundSweepEffect)', () => {
        const originalDocument = global.document;
        delete global.document;

        jest.isolateModules(() => {
            const {
                initBackgroundSweepEffect: initSweep,
            } = require('../../../js/ui/backgroundSweep.js');
            const { triggerSweep } = initSweep();
            expect(typeof triggerSweep).toBe('function');
            expect(() => triggerSweep()).not.toThrow();
        });

        global.document = originalDocument;
    });

    test('handles internal state explicitly via vm for 100% coverage', () => {
        const vm = require('vm');
        const fs = require('fs');
        const path = require('path');
        const scriptPath = path.resolve(process.cwd(), 'js/ui/backgroundSweep.js');
        const scriptContent = fs
            .readFileSync(scriptPath, 'utf8')
            .replace(/export\s+/g, '') // remove ESM exports
            .replace(/import\s+.*from.*/g, ''); // remove imports

        const context = {
            document: {
                querySelector: () => ({
                    classList: { remove: jest.fn(), add: jest.fn() },
                    style: { setProperty: jest.fn() },
                }),
                body: { contains: () => true },
            },
            setTimeout: jest.fn().mockReturnValue(123),
            clearTimeout: jest.fn(),
            CALENDAR_SELECTORS: { pageWrapper: '.test' },
            CALENDAR_BACKGROUND_EFFECT: {
                enabled: true,
                sweepDuration: 3,
                colors: { color1: 'red', color2: 'blue' },
            },
        };

        vm.createContext(context);
        vm.runInContext(scriptContent, context);

        // Test with both timers active
        vm.runInContext(
            `
            sweepNextTimer = 456;
            sweepRemoveTimer = 123;
            stopBackgroundSweepEffect('.test');
        `,
            context
        );

        expect(context.clearTimeout).toHaveBeenCalledWith(123);
        expect(context.clearTimeout).toHaveBeenCalledWith(456);

        // Test triggerSweep with sweepNextTimer active
        vm.runInContext(
            `
            const { triggerSweep } = initBackgroundSweepEffect({ effectConfig: { enabled: true, sweepDuration: 3, colors: {} } });
            sweepNextTimer = 789;
            triggerSweep();
        `,
            context
        );

        expect(context.clearTimeout).toHaveBeenCalledWith(789);

        // Test without document
        vm.runInContext(
            `
            var originalDoc = document;
            delete globalThis.document;
            var document = undefined;
        `,
            context
        );

        // This simulates running it globally without document defined
        const vmContextNoDoc = {
            clearTimeout: jest.fn(),
            CALENDAR_SELECTORS: { pageWrapper: '.test' },
            CALENDAR_BACKGROUND_EFFECT: {
                enabled: true,
                sweepDuration: 3,
                colors: { color1: 'red', color2: 'blue' },
            },
        };
        vm.createContext(vmContextNoDoc);
        vm.runInContext(scriptContent, vmContextNoDoc);

        vm.runInContext(
            `
            stopBackgroundSweepEffect('.test');
            initBackgroundSweepEffect();
        `,
            vmContextNoDoc
        );
    });
});

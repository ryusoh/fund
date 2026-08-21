describe('Ambient Config', () => {
    let originalConsoleWarn;

    beforeEach(() => {
        jest.resetModules();
        originalConsoleWarn = console.warn;
        console.warn = jest.fn();
        delete window.AMBIENT_CONFIG;
    });

    afterEach(() => {
        console.warn = originalConsoleWarn;
    });

    it('should set default AMBIENT_CONFIG if none exists', () => {
        require('../../../js/ambient/config.js');
        expect(window.AMBIENT_CONFIG).toEqual({
            enabled: true,
            minWidth: 1024,
            maxParticles: 300,
            densityDivisor: 20000,
            radius: { min: 1.0, max: 8.0 },
            alpha: { min: 0.1, max: 0.6 },
            speed: 0.6,
            zIndex: 1,
            blend: 'screen',
            respectReducedMotion: false,
        });
    });

    it('should merge with existing AMBIENT_CONFIG', () => {
        window.AMBIENT_CONFIG = { enabled: false, maxParticles: 100 };
        require('../../../js/ambient/config.js');
        expect(window.AMBIENT_CONFIG.enabled).toBe(false);
        expect(window.AMBIENT_CONFIG.maxParticles).toBe(100);
        expect(window.AMBIENT_CONFIG.minWidth).toBe(1024);
    });

    it('should catch errors and log a warning', () => {
        const mockAssign = jest.spyOn(Object, 'assign').mockImplementationOnce(() => {
            throw new Error('mock error');
        });

        require('../../../js/ambient/config.js');

        expect(console.warn).toHaveBeenCalledWith(
            'Caught exception initializing ambient config:',
            expect.any(Error)
        );

        mockAssign.mockRestore();
    });
});

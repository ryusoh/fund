describe('cursor-init', () => {
    let mockConsoleError;
    let mockInitCursor;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = '';

        mockInitCursor = jest.fn().mockReturnValue({ cursor: {} });
        jest.mock('@js/vendor/cursor.js', () => ({
            initCursor: mockInitCursor,
        }));

        mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        window.gsap = {}; // Provide mock gsap
    });

    afterEach(() => {
        mockConsoleError.mockRestore();
        delete window.gsap;
        delete window.cursorInstances;
    });

    it('initializes cursor when gsap is present', () => {
        require('@js/cursor-init');
        expect(mockInitCursor).toHaveBeenCalled();
        expect(window.cursorInstances).toBeDefined();
    });

    it('skips initialization if gsap is missing', () => {
        delete window.gsap;
        require('@js/cursor-init');
        expect(mockInitCursor).not.toHaveBeenCalled();
        expect(window.cursorInstances).toBeUndefined();
    });

    it('waits for DOMContentLoaded if document is loading', () => {
        // Mock document.readyState
        const originalReadyState = document.readyState;
        Object.defineProperty(document, 'readyState', {
            configurable: true,
            get() {
                return 'loading';
            },
        });

        const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

        require('@js/cursor-init');

        expect(addEventListenerSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
        expect(mockInitCursor).not.toHaveBeenCalled();

        // Restore document.readyState
        Object.defineProperty(document, 'readyState', {
            configurable: true,
            get() {
                return originalReadyState;
            },
        });
    });
});

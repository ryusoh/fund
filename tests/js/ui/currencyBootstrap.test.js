describe('currencyBootstrap', () => {
    let originalConsoleWarn;

    beforeEach(() => {
        // Reset the DOM
        document.documentElement.removeAttribute('data-selected-currency');
        document.body.innerHTML = '';

        // Reset localStorage if available
        if (window.localStorage && typeof window.localStorage.clear === 'function') {
            window.localStorage.clear();
        }

        // Reset modules so the IIFE runs again on require
        jest.resetModules();

        // Mock console.warn
        originalConsoleWarn = console.warn;
        console.warn = jest.fn();
    });

    afterEach(() => {
        console.warn = originalConsoleWarn;
    });

    const loadBootstrap = () => {
        require('../../../js/ui/currencyBootstrap.js');
    };

    test('does nothing if localStorage does not have fund.selectedCurrency', () => {
        loadBootstrap();
        expect(document.documentElement.hasAttribute('data-selected-currency')).toBe(false);
    });

    test('sets data-selected-currency on documentElement when value is in localStorage', () => {
        window.localStorage.setItem('fund.selectedCurrency', 'eur');
        loadBootstrap();
        expect(document.documentElement.getAttribute('data-selected-currency')).toBe('EUR');
    });

    test('trims and capitalizes the stored currency', () => {
        window.localStorage.setItem('fund.selectedCurrency', '  gbp  ');
        loadBootstrap();
        expect(document.documentElement.getAttribute('data-selected-currency')).toBe('GBP');
    });

    test('updates currency toggle buttons active state', () => {
        window.localStorage.setItem('fund.selectedCurrency', 'EUR');

        document.body.innerHTML = `
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD">USD</button>
                <button class="currency-toggle" data-currency="EUR">EUR</button>
            </div>
        `;

        loadBootstrap();

        const usdButton = document.querySelector('[data-currency="USD"]');
        const eurButton = document.querySelector('[data-currency="EUR"]');

        expect(usdButton.classList.contains('active')).toBe(false);
        expect(eurButton.classList.contains('active')).toBe(true);
    });

    test('handles multiple toggle containers', () => {
        window.localStorage.setItem('fund.selectedCurrency', 'GBP');

        document.body.innerHTML = `
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD">USD</button>
                <button class="currency-toggle" data-currency="GBP">GBP</button>
            </div>
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD">USD</button>
                <button class="currency-toggle" data-currency="GBP">GBP</button>
            </div>
        `;

        loadBootstrap();

        const gbpButtons = document.querySelectorAll('[data-currency="GBP"]');
        const usdButtons = document.querySelectorAll('[data-currency="USD"]');

        expect(gbpButtons[0].classList.contains('active')).toBe(true);
        expect(gbpButtons[1].classList.contains('active')).toBe(true);

        expect(usdButtons[0].classList.contains('active')).toBe(false);
        expect(usdButtons[1].classList.contains('active')).toBe(false);
    });

    test('does nothing if toggle container has no buttons', () => {
        window.localStorage.setItem('fund.selectedCurrency', 'EUR');

        document.body.innerHTML = `
            <div id="currencyToggleContainer">
            </div>
        `;

        expect(() => {
            loadBootstrap();
        }).not.toThrow();

        expect(document.documentElement.getAttribute('data-selected-currency')).toBe('EUR');
    });

    test('catches exceptions and logs warning', () => {
        const originalLocalStorage = window.localStorage;

        // Force an exception by mocking localStorage.getItem to throw
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: () => {
                    throw new Error('Test Error');
                },
            },
            configurable: true,
        });

        loadBootstrap();

        expect(console.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));

        Object.defineProperty(window, 'localStorage', {
            value: originalLocalStorage,
            writable: true,
            configurable: true,
        });
    });

    test('returns early if window.localStorage is not available', () => {
        const originalLocalStorage = window.localStorage;

        Object.defineProperty(window, 'localStorage', {
            value: undefined,
            writable: true,
            configurable: true,
        });

        loadBootstrap();

        expect(document.documentElement.hasAttribute('data-selected-currency')).toBe(false);

        Object.defineProperty(window, 'localStorage', {
            value: originalLocalStorage,
            writable: true,
            configurable: true,
        });
    });
});

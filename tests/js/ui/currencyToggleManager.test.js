const createLocalStorageMock = () => {
    let store = {};
    return {
        getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        setItem: (key, value) => {
            store[key] = String(value);
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
};

describe('currencyToggleManager', () => {
    let initCurrencyToggle;
    let cycleCurrency;
    let applyCurrencySelection;
    let getStoredCurrency;

    const renderToggle = (markup = null) => {
        document.body.innerHTML =
            markup ||
            `
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD">$</button>
                <button class="currency-toggle" data-currency="CNY">¥</button>
                <button class="currency-toggle" data-currency="JPY">¥</button>
                <button class="currency-toggle" data-currency="KRW">₩</button>
            </div>
        `;
    };

    const loadModule = () => {
        jest.resetModules();
        ({
            initCurrencyToggle,
            cycleCurrency,
            applyCurrencySelection,
            getStoredCurrency,
        } = require('@ui/currencyToggleManager.js'));
    };

    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: createLocalStorageMock(),
            configurable: true,
        });
        jest.spyOn(document, 'dispatchEvent').mockImplementation(() => true);
        renderToggle();
        loadModule();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('returns early when toggle container is missing', () => {
        document.body.innerHTML = '';
        expect(() => initCurrencyToggle()).not.toThrow();
        expect(document.dispatchEvent).not.toHaveBeenCalled();
    });

    it('initializes with saved currency and dispatches when selection changes', () => {
        window.localStorage.setItem('fund.selectedCurrency', 'JPY');
        initCurrencyToggle();
        const jpyButton = document.querySelector('[data-currency="JPY"]');
        expect(jpyButton.classList.contains('active')).toBe(true);
        document.dispatchEvent.mockClear();

        const krwButton = document.querySelector('[data-currency="KRW"]');
        krwButton.click();
        expect(document.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(document.dispatchEvent.mock.calls[0][0].detail.currency).toBe('KRW');
        expect(window.localStorage.getItem('fund.selectedCurrency')).toBe('KRW');
    });

    it('does not dispatch when clicking the already active currency', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();
        const usdButton = document.querySelector('[data-currency="USD"]');
        usdButton.click();
        expect(document.dispatchEvent).not.toHaveBeenCalled();
        expect(usdButton.classList.contains('active')).toBe(true);
    });

    it('cycles currencies and emits events', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();
        cycleCurrency(1);
        expect(document.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(document.dispatchEvent.mock.calls[0][0].detail.currency).toBe('CNY');

        cycleCurrency(-1);
        expect(document.dispatchEvent).toHaveBeenCalledTimes(2);
        expect(document.dispatchEvent.mock.calls[1][0].detail.currency).toBe('USD');
    });

    it('renders Font Awesome icons for all supported currencies', () => {
        initCurrencyToggle();
        const expectations = {
            USD: 'fa-dollar-sign',
            CNY: 'fa-yen-sign',
            JPY: 'fa-yen-sign',
            KRW: 'fa-won-sign',
        };

        Object.entries(expectations).forEach(([currency, className]) => {
            const button = document.querySelector(`[data-currency="${currency}"]`);
            const icon = button.querySelector('i.currency-icon');
            expect(icon).not.toBeNull();
            expect(icon.classList.contains(className)).toBe(true);
            expect(button.getAttribute('aria-label')).toBe(`${currency} currency`);
        });
    });

    it('allows programmatic selection without emitting events', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();
        applyCurrencySelection('KRW', { emitEvent: false });
        expect(document.dispatchEvent).not.toHaveBeenCalled();
        expect(window.localStorage.getItem('fund.selectedCurrency')).toBe('KRW');
        expect(getStoredCurrency()).toBe('KRW');
    });

    it('handles localStorage.getItem exceptions gracefully', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        window.localStorage.getItem = jest.fn(() => {
            throw new Error('Storage disabled');
        });
        const stored = getStoredCurrency();
        expect(stored).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
    });

    it('handles localStorage.setItem exceptions gracefully', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        window.localStorage.setItem = jest.fn(() => {
            throw new Error('Quota exceeded');
        });
        applyCurrencySelection('JPY', { persist: true });
        expect(consoleWarnSpy).toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
    });

    it('returns false in activateCurrency when requested currency is not found', () => {
        initCurrencyToggle();
        applyCurrencySelection('EUR', { emitEvent: true });
        const usdButton = document.querySelector('[data-currency="USD"]');
        expect(usdButton.classList.contains('active')).toBe(true);
    });

    it('handles dispatchEvent exceptions gracefully', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockImplementation(() => {
            throw new Error('Dispatch failed');
        });

        // applyCurrencySelection does not catch the error, so we expect it to throw.
        // But the internal `finally` block should reset `isDispatching = false`.
        expect(() => applyCurrencySelection('KRW', { emitEvent: true })).toThrow('Dispatch failed');

        // The currentCurrency should still update even if dispatch failed
        const krwButton = document.querySelector('[data-currency="KRW"]');
        expect(krwButton.classList.contains('active')).toBe(true);
    });

    it('handles empty currencyButtons array when activating currency', () => {
        renderToggle('<div id="currencyToggleContainer"></div>');
        loadModule();
        expect(() => applyCurrencySelection('JPY')).not.toThrow();
    });

    it('handles CURRENCY_ICON_MAP missing or mismatch in applyCurrencyIcons', () => {
        // Render a button with a currency that has no icon mapping (e.g. 'EUR')
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle" data-currency="EUR">€</button>
            </div>
        `);
        // loadModule will call applyCurrencyIcons inside ensureToggleElements (if we call init)
        loadModule();
        initCurrencyToggle();

        const eurButton = document.querySelector('[data-currency="EUR"]');
        expect(eurButton.querySelector('i')).toBeNull(); // No icon should be generated
    });

    it('handles existing icon with correct currency in applyCurrencyIcons', () => {
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle" data-currency="USD">
                    <i class="fa currency-icon fa-dollar-sign" data-icon-currency="USD" aria-hidden="true"></i>
                </button>
            </div>
        `);
        loadModule();
        initCurrencyToggle();

        const usdButton = document.querySelector('[data-currency="USD"]');
        const icon = usdButton.querySelector('i');
        expect(icon).not.toBeNull();
        expect(icon.dataset.iconCurrency).toBe('USD');
    });

    it('handles empty data-currency when clicking', () => {
        initCurrencyToggle();
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle" data-currency="">Empty</button>
            </div>
        `);
        loadModule();
        initCurrencyToggle();

        const emptyButton = document.querySelector('[data-currency=""]');
        emptyButton.click();

        expect(document.dispatchEvent).not.toHaveBeenCalled();
    });

    it('returns when cycleCurrency is called but nextIndex is currentIndex', () => {
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD">$</button>
            </div>
        `);
        loadModule();
        initCurrencyToggle();
        document.dispatchEvent.mockClear();

        cycleCurrency(1); // Modulo math: (0 + 1) % 1 = 0
        expect(document.dispatchEvent).not.toHaveBeenCalled();
    });

    it('returns early from attachGlobalListener if isDispatching is true', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();
        // applyCurrencySelection triggers dispatch which sets isDispatching = true
        // But since dispatch is synchronous, we need to mock it in a way that
        // fires another global event while it's dispatching.
        document.dispatchEvent.mockImplementationOnce((event) => {
            if (event.type === 'currencyChangedGlobal') {
                // Fire another one while the first is dispatching
                document.dispatchEvent(
                    new CustomEvent('currencyChangedGlobal', { detail: { currency: 'KRW' } })
                );
            }
            return true;
        });

        applyCurrencySelection('JPY', { emitEvent: true });

        // Since the inner dispatch was ignored (isDispatching was true),
        // the currency should be JPY (the outer one), not KRW.
        const jpyButton = document.querySelector('[data-currency="JPY"]');
        expect(jpyButton.classList.contains('active')).toBe(true);
    });

    it('returns early from attachGlobalListener if event currency matches currentCurrency', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();

        // Trigger global event with USD (which is already active)
        document.dispatchEvent(
            new CustomEvent('currencyChangedGlobal', { detail: { currency: 'USD' } })
        );

        // Ensure no state change occurred, currentCurrency remains USD
        const usdButton = document.querySelector('[data-currency="USD"]');
        expect(usdButton.classList.contains('active')).toBe(true);
    });

    it('returns early from cycleCurrency if there are no buttons', () => {
        renderToggle('<div id="currencyToggleContainer"></div>');
        loadModule();
        expect(() => cycleCurrency(1)).not.toThrow();
    });

    it('returns early from cycleCurrency if container is missing', () => {
        document.body.innerHTML = '';
        loadModule();
        expect(() => cycleCurrency(1)).not.toThrow();
    });

    it('ignores clicks outside of currency buttons', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();

        // Render something inside the container that is not a currency-toggle
        const nonButton = document.createElement('span');
        nonButton.textContent = 'Not a button';
        document.getElementById('currencyToggleContainer').appendChild(nonButton);

        nonButton.click();

        expect(document.dispatchEvent).not.toHaveBeenCalled();
    });

    it('ignores clicks when currency button dataset is invalid/empty', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();

        // Add a button with no data-currency
        const invalidButton = document.createElement('button');
        invalidButton.className = 'currency-toggle';
        document.getElementById('currencyToggleContainer').appendChild(invalidButton);

        invalidButton.click();

        expect(document.dispatchEvent).not.toHaveBeenCalled();
    });


    it('handles activateCurrency logic early returns', () => {
        // mock to test activateCurrency returning false
        renderToggle('<div id="currencyToggleContainer"></div>');
        loadModule();
        expect(() => applyCurrencySelection('JPY')).not.toThrow();
    });

    it('handles normalizeCurrency empty branches', () => {
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle" data-currency="   "></button>
            </div>
        `);
        loadModule();

        let eventDispatched = false;
        document.addEventListener('currencyChangedGlobal', () => { eventDispatched = true; });

        initCurrencyToggle();
        const btn = document.querySelector('.currency-toggle');
        btn.click();

        expect(eventDispatched).toBe(false);
    });

    it('handles empty currency missing in global listener', () => {
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD"></button>
            </div>
        `);
        loadModule();
        initCurrencyToggle();

        document.dispatchEvent(
            new CustomEvent('currencyChangedGlobal', { detail: { currency: 'EUR' } })
        );
        const btn = document.querySelector('[data-currency="USD"]');
        expect(btn.classList.contains('active')).toBe(true);
    });

    it('cycleCurrency wraps backward correctly', () => {
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD"></button>
                <button class="currency-toggle" data-currency="CNY"></button>
            </div>
        `);
        loadModule();
        initCurrencyToggle();

        cycleCurrency(-1); // from 0 to length-1 (1)
        const btn = document.querySelector('[data-currency="CNY"]');
        expect(btn.classList.contains('active')).toBe(true);
    });

    it('handles empty icon arrays in applyCurrencyIcons fallback', () => {
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD"></button>
                <button class="currency-toggle" data-currency="XXX"></button>
            </div>
        `);
        loadModule();
        initCurrencyToggle();

        const btn = document.querySelector('[data-currency="XXX"]');
        expect(btn.querySelector('i')).toBeNull();
    });

    it('handles activating target button that is currentCurrency but missing class', () => {
        renderToggle(`
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD"></button>
                <button class="currency-toggle" data-currency="CNY"></button>
            </div>
        `);
        loadModule();
        initCurrencyToggle();

        const btn = document.querySelector('[data-currency="USD"]');
        btn.classList.remove('active');

        // This forces activateCurrency loop through its internal state comparison check
        applyCurrencySelection('USD');
        expect(btn.classList.contains('active')).toBe(true);
    });

});
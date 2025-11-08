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
        expect(document.dispatchEvent.mock.calls[0][0].detail.currency).toBe('JPY');

        cycleCurrency(-1);
        expect(document.dispatchEvent).toHaveBeenCalledTimes(2);
        expect(document.dispatchEvent.mock.calls[1][0].detail.currency).toBe('USD');
    });

    it('allows programmatic selection without emitting events', () => {
        initCurrencyToggle();
        document.dispatchEvent.mockClear();
        applyCurrencySelection('KRW', { emitEvent: false });
        expect(document.dispatchEvent).not.toHaveBeenCalled();
        expect(window.localStorage.getItem('fund.selectedCurrency')).toBe('KRW');
        expect(getStoredCurrency()).toBe('KRW');
    });
});

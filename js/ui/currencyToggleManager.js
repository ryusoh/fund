const STORAGE_KEY = 'fund.selectedCurrency';
const CURRENCY_ICON_MAP = Object.freeze({
    USD: ['fa-dollar-sign', 'fa-usd'],
    CNY: ['fa-yen-sign', 'fa-cny', 'fa-jpy'],
    JPY: ['fa-yen-sign', 'fa-jpy'],
    KRW: ['fa-won-sign', 'fa-krw'],
});

let toggleContainerRef = null;
let currencyButtons = [];
let currentCurrency = null;
let isDispatching = false;
let globalListenerAttached = false;
let iconsDecorated = false;

function normalizeCurrency(value) {
    return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function readStoredCurrency() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            return normalizeCurrency(stored);
        }
    } catch {
        // Ignore storage errors (e.g., private mode)
    }
    return null;
}

function persistCurrency(currency) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY, currency);
        }
    } catch {
        // Ignore storage errors
    }
}

function ensureToggleElements() {
    if (!toggleContainerRef || !document.body.contains(toggleContainerRef)) {
        toggleContainerRef = document.getElementById('currencyToggleContainer');
        currencyButtons = toggleContainerRef
            ? Array.from(toggleContainerRef.querySelectorAll('.currency-toggle'))
            : [];
        iconsDecorated = false;
    }
    if (!iconsDecorated && Array.isArray(currencyButtons) && currencyButtons.length) {
        applyCurrencyIcons();
        iconsDecorated = true;
    }
    return toggleContainerRef;
}

function applyCurrencyIcons() {
    currencyButtons.forEach((button) => {
        const currency = normalizeCurrency(button.dataset.currency);
        const iconClasses = currency && CURRENCY_ICON_MAP[currency];
        if (!iconClasses || !iconClasses.length) {
            return;
        }

        const existingIcon = button.querySelector('i.currency-icon');
        if (existingIcon && existingIcon.dataset.iconCurrency === currency) {
            return;
        }

        const iconElement = document.createElement('i');
        const resolvedClasses = Array.isArray(iconClasses) ? iconClasses : [iconClasses];
        iconElement.className = ['fa', 'currency-icon', ...resolvedClasses].join(' ');
        iconElement.setAttribute('aria-hidden', 'true');
        iconElement.dataset.iconCurrency = currency;

        button.textContent = '';
        button.appendChild(iconElement);
        button.setAttribute('aria-label', `${currency} currency`);
    });
}

function activateCurrency(currency, { emit = true, persist = true } = {}) {
    const normalized = normalizeCurrency(currency) || 'USD';
    ensureToggleElements();
    const hasButtons = Array.isArray(currencyButtons) && currencyButtons.length > 0;

    if (hasButtons) {
        const targetButton = currencyButtons.find(
            (btn) => normalizeCurrency(btn.dataset.currency) === normalized
        );
        if (!targetButton) {
            return false;
        }
        if (currentCurrency !== normalized) {
            currencyButtons.forEach((btn) => btn.classList.remove('active'));
            targetButton.classList.add('active');
            currentCurrency = normalized;
        } else if (!targetButton.classList.contains('active')) {
            targetButton.classList.add('active');
        }
    } else {
        currentCurrency = normalized;
    }

    if (persist) {
        persistCurrency(normalized);
    }

    if (emit && !isDispatching) {
        try {
            isDispatching = true;
            document.dispatchEvent(
                new CustomEvent('currencyChangedGlobal', {
                    detail: { currency: normalized },
                })
            );
        } finally {
            isDispatching = false;
        }
    }

    return true;
}

function attachGlobalListener() {
    if (globalListenerAttached) {
        return;
    }
    document.addEventListener('currencyChangedGlobal', (event) => {
        if (isDispatching) {
            return;
        }
        const eventCurrency = normalizeCurrency(event?.detail?.currency);
        if (!eventCurrency || eventCurrency === currentCurrency) {
            return;
        }
        activateCurrency(eventCurrency, { emit: false, persist: true });
    });
    globalListenerAttached = true;
}

/**
 * Initializes the currency toggle behavior and aligns it with any stored selection.
 */
export function initCurrencyToggle() {
    const container = ensureToggleElements();
    if (!container || !currencyButtons.length) {
        return;
    }

    attachGlobalListener();

    let initialCurrency =
        normalizeCurrency(
            currencyButtons.find((button) => button.classList.contains('active'))?.dataset.currency
        ) || 'USD';

    const storedCurrency = readStoredCurrency();
    if (
        storedCurrency &&
        currencyButtons.some((btn) => normalizeCurrency(btn.dataset.currency) === storedCurrency)
    ) {
        initialCurrency = storedCurrency;
    }

    activateCurrency(initialCurrency, { emit: false, persist: true });

    container.addEventListener('click', (event) => {
        const clickedButton = event.target.closest('.currency-toggle');
        if (!clickedButton) {
            return;
        }
        const newCurrency = clickedButton.dataset.currency;
        if (!newCurrency || normalizeCurrency(newCurrency) === currentCurrency) {
            return;
        }
        activateCurrency(newCurrency, { emit: true, persist: true });
    });
}

/**
 * Cycles the active currency button and dispatches the global change event.
 * @param {number} step - +1 to move right/forward, -1 to move left/backward.
 */
export function cycleCurrency(step) {
    const container = ensureToggleElements();
    if (!container || !currencyButtons.length) {
        return;
    }

    let currentIndex = currencyButtons.findIndex((btn) => btn.classList.contains('active'));
    if (currentIndex < 0) {
        currentIndex = 0;
    }

    const len = currencyButtons.length;
    const nextIndex = (((currentIndex + (step || 0)) % len) + len) % len;
    if (nextIndex === currentIndex) {
        return;
    }

    const nextBtn = currencyButtons[nextIndex];
    const newCurrency = nextBtn?.dataset?.currency || 'USD';
    activateCurrency(newCurrency, { emit: true, persist: true });
}

/**
 * Applies a currency selection programmatically (used during page initialization).
 * @param {string} currency
 * @param {{ emitEvent?: boolean, persist?: boolean }} options
 */
export function applyCurrencySelection(currency, { emitEvent = true, persist = true } = {}) {
    activateCurrency(currency, { emit: emitEvent, persist });
}

/**
 * Returns the persisted currency selection, if available.
 * @returns {string|null}
 */
export function getStoredCurrency() {
    return readStoredCurrency();
}

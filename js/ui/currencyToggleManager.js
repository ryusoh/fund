/**
 * Initializes the currency toggle behavior.
 */
export function initCurrencyToggle() {
    const toggleContainer = document.getElementById('currencyToggleContainer');
    if (!toggleContainer) {
        return;
    }
    const currencyButtons = Array.from(toggleContainer.querySelectorAll('.currency-toggle'));
    if (currencyButtons.length === 0) {
        return;
    }

    let selectedCurrency;

    const activeButton = currencyButtons.find((button) => button.classList.contains('active'));
    if (activeButton) {
        selectedCurrency = activeButton.dataset.currency;
    } else {
        selectedCurrency = 'USD'; // Default
    }

    toggleContainer.addEventListener('click', (event) => {
        const clickedButton = event.target.closest('.currency-toggle');
        if (clickedButton) {
            const newCurrency = clickedButton.dataset.currency;
            if (selectedCurrency !== newCurrency) {
                currencyButtons.forEach((btn) => btn.classList.remove('active'));
                clickedButton.classList.add('active');
                selectedCurrency = newCurrency;
                document.dispatchEvent(
                    new CustomEvent('currencyChangedGlobal', {
                        detail: { currency: selectedCurrency },
                    })
                );
            }
        }
    });
}

/**
 * Cycles the active currency button and dispatches the global change event.
 * @param {number} step - +1 to move right/forward, -1 to move left/backward.
 */
export function cycleCurrency(step) {
    const toggleContainer = document.getElementById('currencyToggleContainer');
    if (!toggleContainer) {
        return;
    }
    const buttons = Array.from(toggleContainer.querySelectorAll('.currency-toggle'));
    if (!buttons.length) {
        return;
    }

    let currentIndex = buttons.findIndex((btn) => btn.classList.contains('active'));
    if (currentIndex < 0) {
        currentIndex = 0;
    }

    const len = buttons.length;
    const nextIndex = (((currentIndex + (step || 0)) % len) + len) % len; // safe modulo
    if (nextIndex === currentIndex) {
        return; // no change
    }

    const nextBtn = buttons[nextIndex];
    buttons.forEach((btn) => btn.classList.remove('active'));
    nextBtn.classList.add('active');

    const newCurrency = nextBtn?.dataset?.currency || 'USD';
    document.dispatchEvent(
        new CustomEvent('currencyChangedGlobal', {
            detail: { currency: newCurrency },
        })
    );
}

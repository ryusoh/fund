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

    const activeButton = currencyButtons.find(button => button.classList.contains('active'));
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
                currencyButtons.forEach(btn => btn.classList.remove('active'));
                clickedButton.classList.add('active');
                selectedCurrency = newCurrency;
                document.dispatchEvent(new CustomEvent('currencyChangedGlobal', { detail: { currency: selectedCurrency } }));
            }
        }
    });
}
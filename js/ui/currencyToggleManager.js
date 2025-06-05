let selectedCurrency = 'USD'; // Default, will be updated from active button
const toggleContainer = document.getElementById('currencyToggleContainer');
const currencyButtons = toggleContainer ? Array.from(toggleContainer.querySelectorAll('.currency-toggle')) : [];

/**
 * Initializes the currency toggle behavior.
 */
export function initCurrencyToggle() {
    if (!toggleContainer || currencyButtons.length === 0) {
        // console.warn('Currency toggle elements not found.');
        return;
    }

    // Determine initial selected currency from the 'active' class in HTML
    const activeButton = currencyButtons.find(button => button.classList.contains('active'));
    if (activeButton) {
        selectedCurrency = activeButton.dataset.currency;
    }

    toggleContainer.addEventListener('click', (event) => {
        const clickedButton = event.target.closest('.currency-toggle');
        if (clickedButton) { // A currency button was clicked
            const newCurrency = clickedButton.dataset.currency;
            if (selectedCurrency !== newCurrency) {
                currencyButtons.forEach(btn => btn.classList.remove('active'));
                clickedButton.classList.add('active');
                selectedCurrency = newCurrency;
                console.log('Currency changed to:', selectedCurrency); // DEBUG
                document.dispatchEvent(new CustomEvent('currencyChangedGlobal', { detail: { currency: selectedCurrency } }));
            }
        }
    });
}
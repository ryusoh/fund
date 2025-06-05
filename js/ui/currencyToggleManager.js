let selectedCurrency = 'USD'; // Default, will be updated from active button
let isExpanded = false;
const toggleContainer = document.getElementById('currencyToggleContainer');
const currencyButtons = toggleContainer ? Array.from(toggleContainer.querySelectorAll('.currency-toggle')) : [];

/**
 * Updates the visual state of the toggle (expanded or contracted)
 * based on the isExpanded flag. CSS handles showing/hiding buttons.
 */
function renderToggleState() {
    if (!toggleContainer) return;

    if (isExpanded) {
        toggleContainer.classList.add('expanded');
    } else {
        toggleContainer.classList.remove('expanded');
    }
}

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

    renderToggleState(); // Set initial visual state (contracted by default via CSS)

    toggleContainer.addEventListener('click', (event) => {
        console.log('Toggle clicked. isExpanded BEFORE:', isExpanded, 'Target:', event.target); // DEBUG
        const clickedButton = event.target.closest('.currency-toggle');

        if (!isExpanded) { // If contracted, clicking it should expand
            isExpanded = true;
            console.log('Expanding. isExpanded AFTER:', isExpanded); // DEBUG
        } else { // If expanded
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
            // Always contract after a click when expanded (on a button or the container itself)
            isExpanded = false;
            console.log('Contracting. isExpanded AFTER:', isExpanded); // DEBUG
        }
        renderToggleState();
    });
}
(function bootstrapStoredCurrency() {
    try {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }
        if (!window.localStorage) {
            return;
        }
        const stored = window.localStorage.getItem('fund.selectedCurrency');
        const normalized = stored && stored.trim().toUpperCase();
        if (!normalized) {
            return;
        }
        document.documentElement.setAttribute('data-selected-currency', normalized);
        const containers = document.querySelectorAll('#currencyToggleContainer');
        containers.forEach((container) => {
            const buttons = Array.from(
                container.querySelectorAll('.currency-toggle[data-currency]')
            );
            if (!buttons.length) {
                return;
            }
            let target = null;
            buttons.forEach((button) => {
                if (button.dataset.currency === normalized) {
                    target = button;
                }
                button.classList.remove('active');
            });
            if (target) {
                target.classList.add('active');
            }
        });
    } catch {
        // Ignore storage/DOM errors to avoid blocking page load
    }
})();

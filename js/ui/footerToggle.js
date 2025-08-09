export function initFooterToggle() {
    const totalValueElement = document.getElementById('total-portfolio-value-in-table');
    const pnlElement = document.querySelector('.total-pnl');

    if (totalValueElement && pnlElement) {
        totalValueElement.addEventListener('click', () => {
            totalValueElement.style.display = 'none';
            pnlElement.style.display = 'inline';
        });

        pnlElement.addEventListener('click', () => {
            pnlElement.style.display = 'none';
            totalValueElement.style.display = 'inline';
        });
    }
}

export function adjustMobilePanels() {
    const tableContainer = document.querySelector('.table-responsive-container');
    const plotSection = document.getElementById('runningAmountSection');
    const chartContainer = plotSection ? plotSection.querySelector('.chart-container') : null;
    const legend = plotSection ? plotSection.querySelector('.chart-legend') : null;

    const clearStyle = (el) => {
        if (el) {
            el.style.height = '';
        }
    };

    if (window.innerWidth > 768) {
        clearStyle(tableContainer);
        clearStyle(plotSection);
        clearStyle(chartContainer);
        return;
    }

    const viewportHeight = window.innerHeight;
    const bottomSpacing = 16;

    const setPanelHeight = (panel) => {
        const isHidden = !panel || panel.classList.contains('is-hidden');
        if (isHidden) {
            clearStyle(panel);
            return null;
        }
        const rect = panel.getBoundingClientRect();
        const available = Math.max(200, viewportHeight - rect.top - bottomSpacing);
        panel.style.height = `${available}px`;
        return available;
    };

    setPanelHeight(tableContainer);

    const handlePlotSection = (cardHeight) => {
        if (!chartContainer || cardHeight === null) {
            return;
        }
        const cardStyles = window.getComputedStyle(plotSection);
        const paddingTop = parseFloat(cardStyles.paddingTop) || 0;
        const paddingBottom = parseFloat(cardStyles.paddingBottom) || 0;
        const legendHeight = legend ? legend.offsetHeight : 0;
        const legendMargin = legend
            ? parseFloat(window.getComputedStyle(legend).marginTop) || 0
            : 0;
        const innerAvailable = Math.max(
            160,
            cardHeight - paddingTop - paddingBottom - legendHeight - legendMargin - 8
        );
        chartContainer.style.height = `${innerAvailable}px`;
    };

    const isPlotHidden = !plotSection || plotSection.classList.contains('is-hidden');

    if (!isPlotHidden) {
        const cardHeight = setPanelHeight(plotSection);
        handlePlotSection(cardHeight);
    } else {
        clearStyle(chartContainer);
        clearStyle(plotSection);
    }
}

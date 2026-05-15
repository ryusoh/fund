function resetDesktopStyles(tableContainer, plotSection, chartContainer) {
    if (tableContainer) {
        tableContainer.style.height = '';
    }
    if (plotSection) {
        plotSection.style.height = '';
    }
    if (chartContainer) {
        chartContainer.style.height = '';
    }
}

function calculatePanelHeight(panel, viewportHeight, bottomSpacing) {
    if (!panel || panel.classList.contains('is-hidden')) {
        if (panel) {
            panel.style.height = '';
        }
        return null;
    }
    const rect = panel.getBoundingClientRect();
    const available = Math.max(200, viewportHeight - rect.top - bottomSpacing);
    panel.style.height = `${available}px`;
    return available;
}

function adjustChartContainerHeight(plotSection, chartContainer, legend, cardHeight) {
    if (chartContainer && cardHeight !== null) {
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
    }
}

export function adjustMobilePanels() {
    const tableContainer = document.querySelector('.table-responsive-container');
    const plotSection = document.getElementById('runningAmountSection');
    const chartContainer = plotSection ? plotSection.querySelector('.chart-container') : null;
    const legend = plotSection ? plotSection.querySelector('.chart-legend') : null;

    if (window.innerWidth > 768) {
        resetDesktopStyles(tableContainer, plotSection, chartContainer);
        return;
    }

    const viewportHeight = window.innerHeight;
    const bottomSpacing = 16;

    calculatePanelHeight(tableContainer, viewportHeight, bottomSpacing);

    if (plotSection && !plotSection.classList.contains('is-hidden')) {
        const cardHeight = calculatePanelHeight(plotSection, viewportHeight, bottomSpacing);
        adjustChartContainerHeight(plotSection, chartContainer, legend, cardHeight);
    } else if (chartContainer) {
        chartContainer.style.height = '';
        if (plotSection) {
            plotSection.style.height = '';
        }
    }
}

const DATA_PATH = '../data/output/figures/twrr.json';

document.addEventListener('DOMContentLoaded', () => {
    renderTwrrChart().catch(() => {
        // Fail silently: perf page is optional and should not halt load.
    });
});

async function renderTwrrChart() {
    const figure = await loadFigure();
    const chartElement = document.getElementById('twrr-chart');
    if (!chartElement) {
        throw new Error('Missing chart container element');
    }

    const { data, layout, config } = enhanceFigure(figure);
    await window.Plotly.react(chartElement, data, layout, config);
}

async function loadFigure() {
    const response = await fetch(DATA_PATH, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Unexpected response ${response.status}`);
    }
    return response.json();
}

function enhanceFigure(figure) {
    const cloned = JSON.parse(JSON.stringify(figure));
    const data = Array.isArray(cloned.data) ? cloned.data : [];
    const layout = cloned.layout || {};
    const config = cloned.config || {};

    layout.margin = layout.margin || { t: 48, r: 24, b: 48, l: 56 };
    layout.legend = layout.legend || { orientation: 'h', x: 0, y: 1.05 };
    config.responsive = true;

    return { data, layout, config };
}

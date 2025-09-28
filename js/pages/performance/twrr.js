const DATA_PATH = '../data/output/figures/twrr.json';

const LAYOUT = {
    title: { text: 'Portfolio Time-Weighted Performance (TWRR)' },
    xaxis: { title: 'Date' },
    yaxis: { title: 'Performance (Indexed to 100)' },
    hovermode: 'x unified',
    template: 'plotly_white',
    margin: { t: 48, r: 24, b: 48, l: 56 },
    legend: { orientation: 'h', x: 0, y: 1.05 },
};

const CONFIG = {
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
    responsive: true,
};

document.addEventListener('DOMContentLoaded', () => {
    renderTwrrChart().catch(() => {
        // Fail silently: perf page is optional and should not halt load.
    });
});

async function renderTwrrChart() {
    const payload = await loadPayload();
    const chartElement = document.getElementById('twrr-chart');
    if (!chartElement) {
        throw new Error('Missing chart container element');
    }

    const data = Array.isArray(payload.data) ? payload.data : [];
    await window.Plotly.react(chartElement, data, LAYOUT, CONFIG);
}

async function loadPayload() {
    const response = await fetch(DATA_PATH, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Unexpected response ${response.status}`);
    }
    return response.json();
}

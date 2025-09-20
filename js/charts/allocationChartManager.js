import { getBlueColorForSlice, hexToRgba } from '@utils/colors.js';
import { checkAndToggleVerticalScroll } from '@ui/responsive.js';
import { CHART_DEFAULTS, UI_BREAKPOINTS } from '@js/config.js';
import { imagePlugin } from '@plugins/imagePlugin.js';
import { customArcBordersPlugin } from '@plugins/customArcBordersPlugin.js';
import { waveAnimationPlugin } from '@plugins/waveAnimationPlugin.js';
import { glass3dPlugin } from '@plugins/glass3dPlugin.js';

let fundChartInstance = null;
let isTablePersisting = false; // State variable for table persistence

// Toggle the same behavior as clicking the donut center: persist/unpersist table & logos
function toggleCenterPersistence(chart) {
    const tableElement = document.querySelector('table');
    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
    const footerWrapperElement = document.querySelector('.footer-wrapper');

    isTablePersisting = !isTablePersisting;
    chart.showLogos = isTablePersisting;
    chart.update();

    if (isTablePersisting) {
        tableElement.classList.remove('hidden');
        allDataRows.forEach((row) => row.classList.remove('hidden'));
        if (footerWrapperElement) {
            footerWrapperElement.classList.remove('hidden');
        }
    } else {
        tableElement.classList.add('hidden');
        allDataRows.forEach((row) => row.classList.add('hidden'));
        if (footerWrapperElement) {
            footerWrapperElement.classList.add('hidden');
        }
    }
    checkAndToggleVerticalScroll();
}

// Expose a safe trigger for keyboard or other UI to emulate center click
export function triggerCenterToggle() {
    if (fundChartInstance) {
        toggleCenterPersistence(fundChartInstance);
    }
}

export function updatePieChart(data) {
    const ctx = document.getElementById('fundPieChart').getContext('2d');
    const seamOffset = window.pieChartGlassEffect?.threeD?.seamOffsetRad ?? 0;
    const baseRotation = -Math.PI / 2 + seamOffset;

    if (fundChartInstance) {
        fundChartInstance.data.labels = data.labels;
        fundChartInstance.data.datasets[0].data = data.datasets[0].data;
        fundChartInstance.data.datasets[0].backgroundColor = data.datasets[0].backgroundColor;
        fundChartInstance.data.datasets[0].images = data.datasets[0].images; // Make sure to update images
        if (fundChartInstance.options) {
            fundChartInstance.options.rotation = baseRotation;
        }
        fundChartInstance.update();
    } else {
        fundChartInstance = new Chart(ctx, {
            // Assuming Chart is global
            type: 'doughnut',
            data: data,
            options: {
                rotation: baseRotation,
                responsive: true,
                layout: {
                    padding: CHART_DEFAULTS.LAYOUT_PADDING,
                },
                cutout: CHART_DEFAULTS.CUTOUT,
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        enabled: false,
                    },
                    datalabels: {
                        // Assuming ChartDataLabels is globally registered
                        display: false,
                        formatter: (value, context) => {
                            const label = context.chart.data.labels[context.dataIndex];
                            const percentageText = value.toFixed(2) + '%';
                            return [{ text: label }, { text: percentageText }];
                        },
                        color: CHART_DEFAULTS.DATALABELS_COLOR,
                        font: {
                            family: CHART_DEFAULTS.DEFAULT_FONT_FAMILY,
                            size: CHART_DEFAULTS.DATALABELS_FONT_SIZE,
                        },
                        anchor: 'end',
                        align: 'end',
                        offset: CHART_DEFAULTS.DATALABELS_OFFSET,
                        textAlign: 'center',
                        connector: {
                            display: true,
                            color: (context) => {
                                const baseHexColor = getBlueColorForSlice(
                                    context.dataIndex,
                                    context.chart.data.labels.length
                                );
                                return hexToRgba(baseHexColor, 0.5);
                            },
                            width: CHART_DEFAULTS.DATALABELS_CONNECTOR_WIDTH,
                        },
                    },
                    title: {
                        display: false,
                        text: 'Fund Allocation',
                        color: '#FFFFFF',
                        font: {},
                    },
                    customArcBorders: {
                        width: 0,
                        color: 'transparent',
                    },
                    glass3d: {
                        enabled: !!(window.pieChartGlassEffect?.threeD?.enabled ?? true),
                    },
                },
                onClick: (event, activeElements, chart) => {
                    let isClickOverCenter = false;
                    const mouseX = event.x;
                    const mouseY = event.y;
                    if (!chart.glassPointerTarget) {
                        chart.glassPointerTarget = { x: 0, y: 0 };
                    }

                    if (chart.getDatasetMeta(0)?.data[0]) {
                        const firstArc = chart.getDatasetMeta(0).data[0];
                        if (
                            firstArc &&
                            typeof firstArc.x === 'number' &&
                            typeof firstArc.y === 'number' &&
                            typeof firstArc.innerRadius === 'number'
                        ) {
                            const centerX = firstArc.x;
                            const centerY = firstArc.y;
                            const innerRadius = firstArc.innerRadius;
                            const distance = Math.sqrt(
                                Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
                            );
                            if (distance < innerRadius) {
                                isClickOverCenter = true;
                            }
                            const radius = Math.max(firstArc.outerRadius, 1);
                            chart.glassPointerTarget = {
                                x: (mouseX - centerX) / radius,
                                y: (mouseY - centerY) / radius,
                            };
                        }
                    }
                    if (isClickOverCenter) {
                        toggleCenterPersistence(chart);
                    }
                },
                onHover: (event, activeElements, chart) => {
                    const tableElement = document.querySelector('table');
                    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
                    const footerWrapperElement = document.querySelector('.footer-wrapper');

                    const mouseX = event.x;
                    const mouseY = event.y;
                    if (!chart.glassPointerTarget) {
                        chart.glassPointerTarget = { x: 0, y: 0 };
                    }

                    // If table is persisting due to a click (on desktop), hover logic should not alter table visibility
                    if (isTablePersisting && window.innerWidth > UI_BREAKPOINTS.MOBILE) {
                        return;
                    }

                    let isOverCenter = false;
                    chart.hoveredSliceIndex = undefined;

                    if (chart.getDatasetMeta(0)?.data[0]) {
                        const firstArc = chart.getDatasetMeta(0).data[0];
                        if (
                            firstArc &&
                            typeof firstArc.x === 'number' &&
                            typeof firstArc.y === 'number' &&
                            typeof firstArc.innerRadius === 'number'
                        ) {
                            const centerX = firstArc.x;
                            const centerY = firstArc.y;
                            const innerRadius = firstArc.innerRadius;
                            const distance = Math.sqrt(
                                Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
                            );
                            if (distance < innerRadius) {
                                isOverCenter = true;
                            }
                            const radius = Math.max(firstArc.outerRadius, 1);
                            chart.glassPointerTarget = {
                                x: (mouseX - centerX) / radius,
                                y: (mouseY - centerY) / radius,
                            };
                        }
                    } else {
                        chart.glassPointerTarget = { x: 0, y: 0 };
                    }

                    let tableShouldBeVisible = false;
                    let specificRowToShow = null;

                    if (isOverCenter) {
                        if (window.innerWidth > UI_BREAKPOINTS.MOBILE) {
                            // Only show all rows on hover on desktop
                            tableShouldBeVisible = true;
                            allDataRows.forEach((row) => row.classList.remove('hidden'));
                        }
                    } else if (activeElements.length > 0 && chart.data.labels?.length > 0) {
                        const activeSegment = activeElements[0];
                        const dataIndex = activeSegment.index;

                        chart.hoveredSliceIndex = dataIndex;

                        if (dataIndex >= 0 && dataIndex < chart.data.labels.length) {
                            const ticker = chart.data.labels[dataIndex];
                            specificRowToShow = document.querySelector(
                                `tbody tr[data-ticker="${ticker}"]`
                            );
                            if (specificRowToShow) {
                                tableShouldBeVisible = true;
                                allDataRows.forEach((row) =>
                                    row.classList.toggle('hidden', row !== specificRowToShow)
                                );
                            }
                        }
                    }

                    chart.update();

                    if (tableShouldBeVisible) {
                        tableElement.classList.remove('hidden');
                        if (footerWrapperElement) {
                            footerWrapperElement.classList.remove('hidden');
                        }
                    } else {
                        tableElement.classList.add('hidden');
                        allDataRows.forEach((row) => row.classList.add('hidden'));
                        if (footerWrapperElement) {
                            footerWrapperElement.classList.add('hidden');
                        }
                        chart.glassPointerTarget = { x: 0, y: 0 };
                    }
                    checkAndToggleVerticalScroll();
                },
            },
            plugins: [imagePlugin, customArcBordersPlugin, waveAnimationPlugin, glass3dPlugin],
        });
        fundChartInstance.glassPointerTarget = { x: 0, y: 0 };
        if (fundChartInstance.canvas && !fundChartInstance._glassMouseLeaveBound) {
            fundChartInstance.canvas.addEventListener('mouseleave', () => {
                fundChartInstance.glassPointerTarget = { x: 0, y: 0 };
            });
            fundChartInstance._glassMouseLeaveBound = true;
        }
    }
}

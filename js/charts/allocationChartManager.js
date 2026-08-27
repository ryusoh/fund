import { getBlueColorForSlice, hexToRgba } from '@utils/colors.js';
import { checkAndToggleVerticalScroll } from '@ui/responsive.js';
import { CHART_DEFAULTS, UI_BREAKPOINTS } from '@js/config.js';
import { imagePlugin } from '@plugins/imagePlugin.js';
import { customArcBordersPlugin } from '@plugins/customArcBordersPlugin.js';
import { waveAnimationPlugin } from '@plugins/waveAnimationPlugin.js';
import { glass3dPlugin } from '@plugins/glass3dPlugin.js';
import { thinFilmPlugin } from '@plugins/thinFilmPlugin.js';

let fundChartInstance = null;
let isTablePersisting = false; // State variable for table persistence

// Toggle the same behavior as clicking the donut center: persist/unpersist table & logos
function toggleCenterPersistence(chart) {
    isTablePersisting = !isTablePersisting;
    chart.showLogos = isTablePersisting;
    chart.update();
    setTableVisibilityState(isTablePersisting, null, true);
}

// Expose a safe trigger for keyboard or other UI to emulate center click
export function triggerCenterToggle() {
    if (fundChartInstance) {
        toggleCenterPersistence(fundChartInstance);
    }
}

function getCenterInfo(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data[0]) {
        return null;
    }
    const firstArc = meta.data[0];
    if (
        typeof firstArc.x === 'number' &&
        typeof firstArc.y === 'number' &&
        typeof firstArc.innerRadius === 'number'
    ) {
        return firstArc;
    }
    return null;
}

function updateGlassPointer(chart, mouseX, mouseY, firstArc) {
    if (firstArc) {
        const radius = Math.max(firstArc.outerRadius, 1);
        chart.glassPointerTarget = {
            x: (mouseX - firstArc.x) / radius,
            y: (mouseY - firstArc.y) / radius,
        };
        const distance = Math.sqrt(
            Math.pow(mouseX - firstArc.x, 2) + Math.pow(mouseY - firstArc.y, 2)
        );
        return distance < firstArc.innerRadius;
    }
    chart.glassPointerTarget = { x: 0, y: 0 };
    return false;
}

function _showTableElements(
    contentBlock,
    tableElement,
    footerWrapperElement,
    allDataRows,
    unhideAllRows
) {
    if (contentBlock) {
        contentBlock.classList.remove('hidden');
    }
    if (tableElement) {
        tableElement.classList.remove('hidden');
    }
    if (unhideAllRows) {
        for (let i = 0; i < allDataRows.length; i++) {
            allDataRows[i].classList.remove('hidden');
        }
    }
    if (footerWrapperElement) {
        footerWrapperElement.classList.remove('hidden');
    }
}

function _hideTableElements(contentBlock, tableElement, footerWrapperElement, allDataRows, chart) {
    if (contentBlock) {
        contentBlock.classList.add('hidden');
    }
    if (tableElement) {
        tableElement.classList.add('hidden');
    }
    for (let i = 0; i < allDataRows.length; i++) {
        allDataRows[i].classList.add('hidden');
    }
    if (footerWrapperElement) {
        footerWrapperElement.classList.add('hidden');
    }
    if (chart) {
        chart.glassPointerTarget = { x: 0, y: 0 };
    }
}

function setTableVisibilityState(isVisible, chart, unhideAllRows = false) {
    const tableElement = document.querySelector('table');
    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
    const footerWrapperElement = document.querySelector('.footer-wrapper');
    const contentBlock = document.querySelector('.content-block');

    if (isVisible) {
        _showTableElements(
            contentBlock,
            tableElement,
            footerWrapperElement,
            allDataRows,
            unhideAllRows
        );
    } else {
        _hideTableElements(contentBlock, tableElement, footerWrapperElement, allDataRows, chart);
    }
    checkAndToggleVerticalScroll();
}

function updateActiveSegmentRow(chart, activeElements, allDataRows) {
    const activeSegment = activeElements[0];
    const dataIndex = activeSegment.index;

    if (dataIndex >= 0 && dataIndex < chart.data.labels.length) {
        const ticker = chart.data.labels[dataIndex];
        const specificRowToShow = document.querySelector(`tbody tr[data-ticker="${ticker}"]`);
        if (specificRowToShow) {
            for (let i = 0; i < allDataRows.length; i++) {
                allDataRows[i].classList.toggle('hidden', allDataRows[i] !== specificRowToShow);
            }
            return true;
        }
    }
    return false;
}

function processHoverState(chart, activeElements, isOverCenter, allDataRows) {
    if (isOverCenter) {
        if (window.innerWidth > UI_BREAKPOINTS.MOBILE) {
            for (let i = 0; i < allDataRows.length; i++) {
                allDataRows[i].classList.remove('hidden');
            }
            return true;
        }
    } else if (activeElements.length > 0 && chart.data.labels?.length > 0) {
        return updateActiveSegmentRow(chart, activeElements, allDataRows);
    }
    return false;
}

function handleChartHover(event, activeElements, chart) {
    if (window.innerWidth <= UI_BREAKPOINTS.MOBILE && activeElements.length === 0) {
        return;
    }

    if (!chart.glassPointerTarget) {
        chart.glassPointerTarget = { x: 0, y: 0 };
    }

    chart._cursorPos = { x: event.x, y: event.y };

    const firstArc = getCenterInfo(chart);
    const isOverCenter = updateGlassPointer(chart, event.x, event.y, firstArc);

    chart.hoveredSliceIndex = undefined;

    if (!isOverCenter && activeElements.length > 0) {
        chart.hoveredSliceIndex = activeElements[0].index;
    }

    if (isTablePersisting && window.innerWidth > UI_BREAKPOINTS.MOBILE) {
        chart.update();
        return;
    }

    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
    const tableShouldBeVisible = processHoverState(
        chart,
        activeElements,
        isOverCenter,
        allDataRows
    );

    chart.update();
    setTableVisibilityState(tableShouldBeVisible, chart);
}

function handleChartClick(event, activeElements, chart) {
    if (!chart.glassPointerTarget) {
        chart.glassPointerTarget = { x: 0, y: 0 };
    }
    const firstArc = getCenterInfo(chart);
    const isClickOverCenter = updateGlassPointer(chart, event.x, event.y, firstArc);
    if (isClickOverCenter) {
        toggleCenterPersistence(chart);
    }
}

function setupTouchEvents(fundChartInstance) {
    if (fundChartInstance.canvas && !fundChartInstance._glassMouseLeaveBound) {
        fundChartInstance.canvas.addEventListener('mouseleave', () => {
            fundChartInstance.glassPointerTarget = { x: 0, y: 0 };
            fundChartInstance._cursorPos = null;
        });

        const handleTouchEnd = () => {
            if (window.innerWidth <= UI_BREAKPOINTS.MOBILE) {
                fundChartInstance.update();
                return;
            }
            fundChartInstance.hoveredSliceIndex = undefined;
            if (!isTablePersisting) {
                setTableVisibilityState(false, fundChartInstance);
                fundChartInstance._cursorPos = null;
            }
            fundChartInstance.update();
            checkAndToggleVerticalScroll();
        };
        fundChartInstance.canvas.addEventListener('touchend', handleTouchEnd, {
            passive: true,
        });
        fundChartInstance.canvas.addEventListener('touchcancel', handleTouchEnd, {
            passive: true,
        });

        fundChartInstance._glassMouseLeaveBound = true;
    }
}

function setupGlobalTouch(fundChartInstance) {
    if (!fundChartInstance._hasGlobalTouchBound) {
        fundChartInstance._hasGlobalTouchBound = true;

        const handleGlobalTouch = (e) => {
            if (window.innerWidth > UI_BREAKPOINTS.MOBILE) {
                return;
            }
            const chartContainer = document.getElementById('fundPieChartContainer');
            const contentBlock = document.querySelector('.content-block');

            if (!chartContainer || !contentBlock) {
                return;
            }

            if (chartContainer.contains(e.target) || contentBlock.contains(e.target)) {
                return;
            }

            isTablePersisting = false;
            if (fundChartInstance) {
                fundChartInstance.hoveredSliceIndex = undefined;
                fundChartInstance.showLogos = false;
                fundChartInstance.update();
            }
            setTableVisibilityState(false, null);
        };

        document.addEventListener('touchstart', handleGlobalTouch, { passive: true });

        const originalDestroy = fundChartInstance.destroy;
        const newDestroy = function () {
            document.removeEventListener('touchstart', handleGlobalTouch);
            if (originalDestroy) {
                originalDestroy.apply(this, arguments);
            }
        };
        if (originalDestroy && originalDestroy._isMockFunction) {
            Object.setPrototypeOf(newDestroy, originalDestroy);
            Object.assign(newDestroy, originalDestroy);
        }
        fundChartInstance.destroy = newDestroy;
    }
}

function buildChartConfig(data, baseRotation) {
    return {
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
            onClick: handleChartClick,
            onHover: handleChartHover,
        },
        plugins: [
            imagePlugin,
            customArcBordersPlugin,
            waveAnimationPlugin,
            glass3dPlugin,
            thinFilmPlugin,
        ],
    };
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
        fundChartInstance = new Chart(ctx, buildChartConfig(data, baseRotation));
        fundChartInstance.glassPointerTarget = { x: 0, y: 0 };
        setupTouchEvents(fundChartInstance);
        setupGlobalTouch(fundChartInstance);
    }
}

export function hoverSliceByTicker(ticker) {
    if (!fundChartInstance) {
        return;
    }
    if (!ticker) {
        fundChartInstance.hoveredSliceIndex = undefined;
        fundChartInstance.update();
        return;
    }
    const labels = fundChartInstance.data?.labels || [];
    const index = labels.indexOf(ticker);
    if (index !== -1) {
        fundChartInstance.hoveredSliceIndex = index;
    } else {
        fundChartInstance.hoveredSliceIndex = undefined;
    }
    fundChartInstance.update();
}

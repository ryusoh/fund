import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { checkAndToggleVerticalScroll } from '../ui/responsive.js';
import { CHART_DEFAULTS, UI_BREAKPOINTS } from '../config.js';

let fundChartInstance = null;
let isTablePersisting = false; // State variable for table persistence

const imagePlugin = {
    id: 'imagePlugin',
    afterDatasetsDraw(chart, args, options) {
        const ctx = chart.ctx;
        const dataset = chart.data.datasets[0];
        const images = dataset.images;

        if (!images || images.length === 0) {
            return;
        }

        const showLogos = chart.showLogos || false;
        const hoveredSliceIndex = chart.hoveredSliceIndex;

        if (!showLogos && hoveredSliceIndex === undefined) {
            return; // Don't draw any logos
        }

        // Initialize a cache for loaded images on the chart instance if it doesn't exist
        if (!chart.imagePlugin_loadedImages) {
            chart.imagePlugin_loadedImages = {};
        }
        const loadedImages = chart.imagePlugin_loadedImages;

        const meta = chart.getDatasetMeta(0);
        if (meta.data.length === 0) {
            return;
        }

        meta.data.forEach((arc, index) => {
            if (showLogos || index === hoveredSliceIndex) {
                const logoInfo = images[index];
                if (logoInfo && logoInfo.src) {
                    const imageUrl = logoInfo.src;
                    if (loadedImages[imageUrl]) {
                        // Image is already loaded and in cache, just draw it
                        drawImage(ctx, arc, loadedImages[imageUrl], logoInfo);
                    } else {
                        // Image is not loaded yet, start loading
                        const img = new Image();
                        img.src = imageUrl;
                        img.onload = () => {
                            loadedImages[imageUrl] = img; // Cache the loaded image
                            chart.draw(); // Redraw the chart to show the loaded image
                        };
                    }
                }
            }
        });
    }
};

function drawImage(ctx, arc, img, logoInfo) {
    const { x, y, outerRadius, innerRadius, startAngle, endAngle } = arc;
    const sliceAngle = endAngle - startAngle;

    // Only draw if the slice is large enough
    const minAngle = Math.PI / 18; // 10 degrees
    if (sliceAngle < minAngle) {
        return;
    }

    const angle = startAngle + sliceAngle / 2;
    const radius = innerRadius + (outerRadius - innerRadius) / 2;

    // Determine the bounding box for the logo
    const sliceThickness = outerRadius - innerRadius;
    const arcLengthAtCenterRadius = radius * sliceAngle;

    const scale = logoInfo.scale || 1.0;
    const maxLogoWidth = arcLengthAtCenterRadius * 0.7 * scale;
    const maxLogoHeight = sliceThickness * 0.7 * scale;

    // Preserve aspect ratio
    let logoWidth = img.width;
    let logoHeight = img.height;
    const aspectRatio = logoWidth / logoHeight;

    if (logoWidth > maxLogoWidth) {
        logoWidth = maxLogoWidth;
        logoHeight = logoWidth / aspectRatio;
    }

    if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * aspectRatio;
    }

    ctx.save();

    // Set opacity
    ctx.globalAlpha = logoInfo.opacity || 1.0;

    // --- Corrected Clipping and Subtle Rotation ---

    // 1. Define the clipping path for the donut slice
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, startAngle, endAngle);
    ctx.arc(x, y, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.clip();

    // 2. Translate to the drawing position
    const imgX = x + Math.cos(angle) * radius;
    const imgY = y + Math.sin(angle) * radius;
    ctx.translate(imgX, imgY);

    // 3. Apply rotation
    let rotation = 0;
    if (logoInfo.rotation !== undefined && logoInfo.rotation !== false) {
        // Use the user-defined rotation (in degrees)
        rotation = logoInfo.rotation * Math.PI / 180;
    } else if (logoInfo.rotation !== false) {
        // Apply the default subtle rotation
        let defaultRotation = angle + Math.PI / 2;
        if (defaultRotation > Math.PI / 2) {
            defaultRotation -= Math.PI;
        }
        if (defaultRotation < -Math.PI / 2) {
            defaultRotation += Math.PI;
        }
        const maxRotation = Math.PI / 6; // 30 degrees
        if (Math.abs(defaultRotation) > maxRotation) {
            defaultRotation = defaultRotation > 0 ? maxRotation : -maxRotation;
        }
        rotation = defaultRotation;
    }

    ctx.rotate(rotation);

    // 4. Draw the image
    if (logoInfo.renderAsWhite) {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        // Scale the canvas for high-DPI displays
        offscreenCanvas.width = logoWidth * devicePixelRatio;
        offscreenCanvas.height = logoHeight * devicePixelRatio;
        offscreenCtx.scale(devicePixelRatio, devicePixelRatio);

        // Draw the original image
        offscreenCtx.drawImage(img, 0, 0, logoWidth, logoHeight);

        // Use source-in to colorize the logo
        offscreenCtx.globalCompositeOperation = 'source-in';
        offscreenCtx.fillStyle = 'white';
        offscreenCtx.fillRect(0, 0, logoWidth, logoHeight);

        // Draw the modified image onto the main canvas
        ctx.drawImage(offscreenCanvas, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);

    } else {
        // Draw the original image
        ctx.drawImage(img, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
    }

    ctx.restore();
}


export function updatePieChart(data) {
    const ctx = document.getElementById('fundPieChart').getContext('2d');
    
    if (fundChartInstance) {
        fundChartInstance.data.labels = data.labels;
        fundChartInstance.data.datasets[0].data = data.datasets[0].data;
        fundChartInstance.data.datasets[0].backgroundColor = data.datasets[0].backgroundColor;
        fundChartInstance.data.datasets[0].images = data.datasets[0].images; // Make sure to update images
        fundChartInstance.update();
    } else {
        fundChartInstance = new Chart(ctx, { // Assuming Chart is global
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                layout: {
                    padding: CHART_DEFAULTS.LAYOUT_PADDING
                },
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        enabled: false
                    },
                    datalabels: { // Assuming ChartDataLabels is globally registered
                        display: false, 
                        formatter: (value, context) => {
                            const label = context.chart.data.labels[context.dataIndex];
                            const percentageText = value.toFixed(2) + '%';
                            return [
                                { text: label },
                                { text: percentageText }
                            ];
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
                                const baseHexColor = getBlueColorForSlice(context.dataIndex, context.chart.data.labels.length);
                                return hexToRgba(baseHexColor, 0.5); 
                            },
                            width: CHART_DEFAULTS.DATALABELS_CONNECTOR_WIDTH
                        }
                    },
                    title: {
                        display: false,
                        text: 'Fund Allocation',
                        color: '#FFFFFF',
                        font: {}
                    },
                },
                onClick: (event, activeElements, chart) => {
                    const tableElement = document.querySelector('table');
                    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
                    const footerWrapperElement = document.querySelector('.footer-wrapper');

                    let isClickOverCenter = false;
                    const mouseX = event.x;
                    const mouseY = event.y;

                    if (chart.getDatasetMeta(0)?.data[0]) {
                        const firstArc = chart.getDatasetMeta(0).data[0];
                        if (firstArc && typeof firstArc.x === 'number' && typeof firstArc.y === 'number' && typeof firstArc.innerRadius === 'number') {
                            const centerX = firstArc.x;
                            const centerY = firstArc.y;
                            const innerRadius = firstArc.innerRadius;
                            const distance = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));
                            if (distance < innerRadius) {
                                isClickOverCenter = true;
                            }
                        }
                    }

                    if (isClickOverCenter) {
                        isTablePersisting = !isTablePersisting; // Toggle persistence state
                        chart.showLogos = isTablePersisting;
                        chart.update();

                        if (isTablePersisting) {
                            // Show full table and make it persist
                            tableElement.classList.remove('hidden');
                            allDataRows.forEach(row => row.classList.remove('hidden'));
                            if (footerWrapperElement) footerWrapperElement.classList.remove('hidden');
                        } else {
                            // Hide the table, reverting to hover-controlled visibility
                            tableElement.classList.add('hidden');
                            allDataRows.forEach(row => row.classList.add('hidden')); // Ensure all rows are hidden
                            if (footerWrapperElement) footerWrapperElement.classList.add('hidden');
                        }
                        checkAndToggleVerticalScroll();
                    }
                },
                onHover: (event, activeElements, chart) => {
                    const tableElement = document.querySelector('table');
                    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
                    const footerWrapperElement = document.querySelector('.footer-wrapper');

                    const mouseX = event.x;
                    const mouseY = event.y;

                    // If table is persisting due to a click (on desktop), hover logic should not alter table visibility
                    if (isTablePersisting && window.innerWidth > UI_BREAKPOINTS.MOBILE) {
                        return;
                    }

                    let isOverCenter = false;
                    chart.hoveredSliceIndex = undefined;

                    if (chart.getDatasetMeta(0)?.data[0]) { 
                        const firstArc = chart.getDatasetMeta(0).data[0];
                        if (firstArc && typeof firstArc.x === 'number' && typeof firstArc.y === 'number' && typeof firstArc.innerRadius === 'number') {
                            const centerX = firstArc.x;
                            const centerY = firstArc.y;
                            const innerRadius = firstArc.innerRadius;
                            const distance = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));
                            if (distance < innerRadius) {
                                isOverCenter = true;
                            }
                        }
                    }

                    let tableShouldBeVisible = false;
                    let specificRowToShow = null;

                    if (isOverCenter) {
                        if (window.innerWidth > UI_BREAKPOINTS.MOBILE) { // Only show all rows on hover on desktop
                            tableShouldBeVisible = true;
                            allDataRows.forEach(row => row.classList.remove('hidden'));
                        }
                    } else if (activeElements.length > 0 && chart.data.labels?.length > 0) {
                        const activeSegment = activeElements[0];
                        const dataIndex = activeSegment.index;

                        chart.hoveredSliceIndex = dataIndex;

                        if (dataIndex >= 0 && dataIndex < chart.data.labels.length) {
                            const ticker = chart.data.labels[dataIndex];
                            specificRowToShow = document.querySelector(`tbody tr[data-ticker="${ticker}"]`);
                            if (specificRowToShow) {
                                tableShouldBeVisible = true;
                                allDataRows.forEach(row => row.classList.toggle('hidden', row !== specificRowToShow));
                            }
                        }
                    } 
                    
                    chart.update();

                    if (tableShouldBeVisible) {
                        tableElement.classList.remove('hidden');
                        if (footerWrapperElement) footerWrapperElement.classList.remove('hidden');
                    } else {
                        tableElement.classList.add('hidden');
                        allDataRows.forEach(row => row.classList.add('hidden')); 
                        if (footerWrapperElement) footerWrapperElement.classList.add('hidden');
                    }
                    checkAndToggleVerticalScroll();
                }
            },
            plugins: [imagePlugin]
        });
    }
}

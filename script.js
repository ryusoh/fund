// Register ChartDataLabels plugin once globally

const customArcBordersPlugin = {
    id: 'customArcBorders',
    afterDatasetDraw(chart, args, pluginOptions) {
    // Only run for doughnut charts and if the dataset is visible
    if (chart.config.type !== 'doughnut' || !chart.isDatasetVisible(args.index)) {
        return;
    }

    const { ctx } = chart;
    const meta = args.meta; // Contains information about the dataset, including its elements

    // Get options from plugin configuration in chart options, with defaults
    const arcBorderWidth = pluginOptions.width !== undefined ? pluginOptions.width : 2.5; // Default to 2px
    const arcBorderColor = pluginOptions.color || 'rgba(20, 20, 20, 0.6)'; // Default color

    meta.data.forEach(arcElement => {
        // Get the resolved properties of the arc segment
        const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arcElement.getProps(
        ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
        true // Use final values
        );

        ctx.save();
        ctx.strokeStyle = arcBorderColor;
        ctx.lineWidth = arcBorderWidth;

        // Draw outer arc border
        ctx.beginPath();
        ctx.arc(x, y, outerRadius, startAngle, endAngle);
        ctx.stroke();

        // Draw inner arc border
        ctx.beginPath();
        ctx.arc(x, y, innerRadius, startAngle, endAngle);
        ctx.stroke();

        ctx.restore();
    });
    }
};

// Easing function for smoother animations
function easeInOutSine(x) {
    return -(Math.cos(Math.PI * x) - 1) / 2;
}

// --- New Wave Animation Plugin ---
function _startWaveAnimation(chart) {
    const animState = chart.waveAnimation;
    if (animState.animationFrameId) return; // Already running

    const animate = () => {
        if (!chart.canvas || !document.body.contains(chart.canvas)) { // Stop if chart is gone
            _stopWaveAnimation(chart);
            return;
        }

        const meta = chart.getDatasetMeta(0);
        let currentInnerRadiusValue = 0;
        let currentOuterRadiusValue = 0;
        if (meta && meta.data && meta.data.length) {
            currentInnerRadiusValue = meta.data[0].innerRadius;
            currentOuterRadiusValue = meta.data[0].outerRadius;
        }

        // Stop if no hole and no waves left to animate
        // For outward expansion, we care about outerRadius
        if (currentOuterRadiusValue <= 0 && animState.waves.length === 0) {
            _stopWaveAnimation(chart);
            return;
        }
        
        // Update wave states (even if innerRadius becomes 0, let existing waves fade out)
        // Pass outerRadius for spawning waves from the outside
        updateWaveState(chart, currentOuterRadiusValue > 0 ? currentOuterRadiusValue : 0);
        chart.draw(); // Redraw the chart to show updated waves
        
        // Only continue animation if there are active waves or potential to spawn new ones
        // Condition for outward expansion: if outerRadius is present
        if (animState.waves.length > 0 || (currentOuterRadiusValue > 0 && animState.waves.length < animState.config.maxWaves)) {
            animState.animationFrameId = requestAnimationFrame(animate);
        } else {
            _stopWaveAnimation(chart); // No waves and no way to make new ones
        }
    };
    animState.animationFrameId = requestAnimationFrame(animate);
}

function _stopWaveAnimation(chart) {
    const animState = chart.waveAnimation;
    if (animState && animState.animationFrameId) {
        cancelAnimationFrame(animState.animationFrameId);
        animState.animationFrameId = null;
    }
}

const waveAnimationPlugin = {
    id: 'waveCenterAnimation',
    beforeInit: function(chart) {
        chart.waveAnimation = {
            waves: [],
            lastSpawnTime: 0,
            animationFrameId: null,
            config: { // Configuration for the wave effect
                maxWaves: 10,           // Max number of waves visible at once
                spawnInterval: 80,    // Milliseconds between new wave spawns
                speed: 1,            // Pixels per frame the radius expands
                expansionDistance: 40, // How far (in pixels) waves expand beyond the outer radius
                spawnOpacity: 0.25,    // Initial opacity when wave spawns at the outer edge
                // maxReachedOpacity is not used for this direction, waves only fade out
                targetOpacityFade: 0.005// Opacity threshold to remove the wave
            }
        };
    },
    afterDestroy: function(chart) {
        _stopWaveAnimation(chart); // Cleanup animation frame on chart destroy
    },
    beforeDatasetsDraw: function(chart, args, options) {
        if (chart.config.type !== 'doughnut' || !chart.waveAnimation) {
            return; // Only for doughnut charts with the plugin state
        }

        const animState = chart.waveAnimation;
        const meta = chart.getDatasetMeta(0);
        
        let outerRadius = 0; // We need outerRadius for this effect
        let centerX = 0;
        let centerY = 0;

        if (meta && meta.data && meta.data.length) {
            const firstArc = meta.data[0]; // Get properties from the first arc segment
            outerRadius = firstArc.outerRadius;
            centerX = firstArc.x;
            centerY = firstArc.y;
        }

        // Start animation loop if not running and there's a hole for waves
        // Condition for outward expansion: if outerRadius is present
        if (!animState.animationFrameId && outerRadius > 0) {
            _startWaveAnimation(chart);
        } else if (animState.animationFrameId && outerRadius <= 0 && animState.waves.length === 0) {
            // If hole disappears and no waves are left, stop animation
            _stopWaveAnimation(chart);
        }

        // Draw current waves
        const { ctx } = chart;
        ctx.save();

        // Define a clipping region that EXCLUDES the doughnut area
        if (outerRadius > 0 && centerX && centerY) {
            ctx.beginPath();
            // Path for the entire canvas
            ctx.rect(0, 0, chart.width, chart.height);
            // Path for the doughnut circle, drawn counter-clockwise to subtract from the rect
            ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2, true); // true for counter-clockwise
            ctx.clip('evenodd'); // Clip to the area outside the doughnut circle
        }

        animState.waves.forEach(wave => {
            // Only draw the wave if its radius is strictly greater than the doughnut's outerRadius,
            // by at least 3 pixels, ensuring it only appears clearly outside the doughnut.
            if (wave.radius > (outerRadius + 3) && wave.opacity > 0 && centerX && centerY) {
                ctx.beginPath(); // Start a new path for each wave
                ctx.arc(centerX, centerY, wave.radius, 0, Math.PI * 2, false);
                ctx.fillStyle = `rgba(0, 0, 0, ${wave.opacity})`; // Lighter gray waves
                ctx.fill();
            }
        });

        // Restore the canvas state to remove the clipping region
        ctx.restore();
    }
};

function updateWaveState(chart, currentOuterRadiusValue) { // Parameter changed to currentOuterRadiusValue
    const animState = chart.waveAnimation;
    if (!animState) return; 
    
    const config = animState.config;
    const now = Date.now();

    // Spawn new waves if conditions are met
    if (currentOuterRadiusValue > 0 && // Ensure there's an outer edge to spawn from
        now - animState.lastSpawnTime > config.spawnInterval && 
        animState.waves.length < config.maxWaves) {
        
        animState.waves.push({
            radius: currentOuterRadiusValue,    // Start at the current outer edge of the doughnut
            opacity: config.spawnOpacity,
            spawnRadius: currentOuterRadiusValue, // Store initial radius for opacity calculation
            targetRadius: currentOuterRadiusValue + config.expansionDistance // Expand outwards
        });
        animState.lastSpawnTime = now;
    }

    // Update and filter existing waves
    animState.waves = animState.waves.filter(wave => {
        wave.radius += config.speed; // Expand the wave outwards

        // Adjust opacity: fade out as it expands from spawnRadius to targetRadius
        const { spawnOpacity, expansionDistance } = config;
        if (expansionDistance > 0) {
            // Progress: 0 (at spawnRadius) to 1 (at targetRadius)
            let progress = 0;
            // Ensure wave.spawnRadius is defined (it should be from the push above)
            if (typeof wave.spawnRadius === 'number') {
                 progress = Math.min(1, Math.max(0, (wave.radius - wave.spawnRadius) / expansionDistance));
            } else { 
                progress = 1; // Fallback: if spawnRadius is missing, assume fully progressed (will fade out quickly)
            }
            const easedProgress = easeInOutSine(progress);
            wave.opacity = spawnOpacity * (1 - easedProgress); // Fade from spawnOpacity to 0
        } else {
            wave.opacity = 0; // If no expansion distance, fade out immediately
        }
        
        // Keep wave if it's still visible and large enough
        return wave.radius < wave.targetRadius && wave.opacity > config.targetOpacityFade;
    });
}

// Register all plugins
Chart.register(ChartDataLabels);
Chart.register(customArcBordersPlugin);
Chart.register(waveAnimationPlugin); // Add the new wave animation plugin

function formatCurrency(value) {
    // Use toLocaleString for currency formatting with commas
    // Ensure the value is a number
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
        return typeof value === 'string' ? value : '$0.00'; // Fallback for non-numeric or keep original string
    }
    return numValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function fetchAndUpdatePrices() {
    try {
        const response = await fetch('./fund_data.json?t=' + new Date().getTime()); // Add cache buster
        if (!response.ok) {
            console.error('Failed to fetch fund data:', response.status, response.statusText);
            return;
        }
        const prices = await response.json();

        let totalPortfolioValue = 0;
        let rowsArray = Array.from(document.querySelectorAll('tbody tr[data-ticker]'));
        const chartData = { 
            labels: [], 
            datasets: [{ 
                data: [], 
                backgroundColor: [],
                borderColor: 'rgba(84, 84, 88, 0.5)', // Color for the 0.5px radial lines
                borderWidth: 0.5  // Width for radial lines; arcs overdrawn by plugin
            }] 
        };
        const tbody = document.querySelector('table tbody');

        // First pass: calculate individual values and total portfolio value
        rowsArray.forEach(row => {
            const ticker = row.dataset.ticker;
            const sharesCell = row.querySelector('td.shares'); 
            const costCell = row.querySelector('td.cost');
            const pnlCell = row.querySelector('td.pnl');
            const shares = parseFloat(sharesCell.textContent);

            // Round the displayed shares value to 0.01
            if (sharesCell && !isNaN(shares)) {
                sharesCell.textContent = shares.toFixed(2);
            }

            if (prices[ticker] !== undefined && !isNaN(shares)) {
                const priceCell = row.querySelector('td.price');
                const valueCell = row.querySelector('td.value');
                const currentPrice = parseFloat(prices[ticker]);
                const cost = parseFloat(costCell.textContent.replace('$', ''));

                if (priceCell) priceCell.textContent = formatCurrency(currentPrice);

                const currentValue = shares * currentPrice;
                if (valueCell) valueCell.textContent = formatCurrency(currentValue);
                
                // Calculate PnL
                if (!isNaN(cost) && pnlCell) {
                    const pnlValue = (currentPrice - cost) * shares;
                    const initialCostValue = cost * shares;
                    const pnlPercentage = initialCostValue !== 0 ? (pnlValue / initialCostValue) * 100 : 0;

                    const formattedPnlCurrency = formatCurrency(pnlValue);
                    let pnlPrefix = pnlValue >= 0 ? '+' : ''; // For the percentage part
                    const displayPnlAmount = pnlValue >= 0 ? `+${formattedPnlCurrency}` : formattedPnlCurrency;

                    pnlCell.textContent = `${displayPnlAmount} (${pnlPrefix}${pnlPercentage.toFixed(2)}%)`;
                    if (pnlValue > 0) {
                        pnlCell.style.color = '#30D158'; // Apple System Green (Dark Mode)
                    } else if (pnlValue < 0) {
                        pnlCell.style.color = '#FF453A'; // Apple System Red (Dark Mode)
                    } else {
                        pnlCell.style.color = ''; // Default color
                    }
                }
                totalPortfolioValue += currentValue;
                row.dataset.currentValue = currentValue; // Store for allocation pass
            }
        });

        // Update total portfolio value display
        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(totalPortfolioValue);

        // Sort rows by currentValue in descending order
        rowsArray.sort((a, b) => {
            const valueA = parseFloat(a.dataset.currentValue || "0");
            const valueB = parseFloat(b.dataset.currentValue || "0");
            return valueB - valueA; // Sort descending
        });

        // Re-append rows to the table body in sorted order
        tbody.innerHTML = ''; // Clear existing rows
        rowsArray.forEach(row => tbody.appendChild(row));

        // Second pass: calculate and update allocations
        rowsArray.forEach(row => { // Iterate over the sorted array
            const allocationCell = row.querySelector('td.allocation');
            if (allocationCell && totalPortfolioValue > 0) {
                const rowValue = parseFloat(row.dataset.currentValue || "0");
                const allocationPercentage = (rowValue / totalPortfolioValue) * 100;
                allocationCell.textContent = allocationPercentage.toFixed(2) + '%';

                // Prepare data for the chart
                const ticker = row.dataset.ticker;
                chartData.labels.push(ticker);
                chartData.datasets[0].data.push(allocationPercentage);
                // Add a color for this slice (you can customize these)
                const baseColor = getBlueColorForSlice(rowsArray.indexOf(row), rowsArray.length);
                chartData.datasets[0].backgroundColor.push(hexToRgba(baseColor, 0.9));
                }
        });

        // Update or create the pie chart
        updatePieChart(chartData);

        // After initial load and potential DOM changes, check scroll
        checkAndToggleVerticalScroll();

    } catch (error) {
        console.error('Error fetching or processing fund data:', error);
    }
}

let fundChartInstance = null;
function updatePieChart(data) {
    const ctx = document.getElementById('fundPieChart').getContext('2d');
    
    if (fundChartInstance) {
        fundChartInstance.data.labels = data.labels;
        fundChartInstance.data.datasets[0].data = data.datasets[0].data;
        fundChartInstance.data.datasets[0].backgroundColor = data.datasets[0].backgroundColor;
        fundChartInstance.update();
    } else {
        fundChartInstance = new Chart(ctx, {
            type: 'doughnut', // Use 'pie' for a solid pie chart
            data: data,
            options: {
                responsive: true,
                layout: {
                    padding: {
                        right: 35,
                        left: 35
                    }
                },
                plugins: {
                    // Hide the default legend, as datalabels will replace it
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        enabled: false // Disable the default tooltip
                    },
                    datalabels: {
                        display: false, // Display datalabels
                        formatter: (value, context) => {
                            const label = context.chart.data.labels[context.dataIndex];
                            const percentageText = value.toFixed(2) + '%';
                            // Use the font settings defined below

                            return [
                                {
                                    text: label,
                                    font: {
                                        // Inherits family from global datalabels font options
                                        // size can be set here if different from percentage
                                    },
                                    // Inherits color from global datalabels color option
                                },
                                {
                                    text: percentageText,
                                    font: {
                                        // Inherits family from global datalabels font options
                                        // size can be set here if different from label
                                    },
                                    // Inherits color from global datalabels color option
                                }
                            ];
                        },
                        color: 'rgba(235, 235, 245, 0.6)', // Apple's secondary label color for dark mode
                        font: {
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
                            size: 10, // Adjust size as needed for visual balance
                            // weight: 'normal' // or '500' for slightly bolder
                        },
                        anchor: 'end', // Anchor the label connection at the end of the slice
                        align: 'end', // Align the label text to the end of the connector
                        offset: 8, // Distance from the slice
                        textAlign: 'center', // Centers the multi-line text block
                        connector: {
                            display: true,
                            color: (context) => {
                                // Get the base hex color for the current slice
                                const baseHexColor = getBlueColorForSlice(context.dataIndex, context.chart.data.labels.length);
                                // Apply 50% opacity for "half transparent"
                                return hexToRgba(baseHexColor, 0.5); 
                            },
                            width: 1
                        }
                    },
                    title: {
                        display: false, // Hide the chart title
                        text: 'Fund Allocation',
                        color: '#FFFFFF', // White title
                        font: {
                            // family: 'P22UndergroundProThin' // Removed custom font
                        }
                    },
                },
                onHover: (event, activeElements, chart) => {
                    const tableElement = document.querySelector('table');
                    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
                    const footerWrapperElement = document.querySelector('.footer-wrapper');
                    // const portfolioSummaryElement = document.getElementById('total-portfolio-value').parentElement; // No longer needed

                    const mouseX = event.x;
                    const mouseY = event.y;
                    let isOverCenter = false;

                    if (chart.getDatasetMeta(0)?.data[0]) { // Optional chaining for safety
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
                    // let summaryShouldBeVisible = false; // Summary is part of the table now
                    let specificRowToShow = null;

                    if (isOverCenter) {
                        tableShouldBeVisible = true;
                        // summaryShouldBeVisible = true;
                        allDataRows.forEach(row => row.classList.remove('hidden'));
                    } else if (activeElements.length > 0 && chart.data.labels?.length > 0) {
                        const activeSegment = activeElements[0];
                        const dataIndex = activeSegment.index;
                        if (dataIndex >= 0 && dataIndex < chart.data.labels.length) {
                            const ticker = chart.data.labels[dataIndex];
                            specificRowToShow = document.querySelector(`tbody tr[data-ticker="${ticker}"]`);
                            if (specificRowToShow) {
                                tableShouldBeVisible = true;
                                // summaryShouldBeVisible = true;
                                allDataRows.forEach(row => row.classList.toggle('hidden', row !== specificRowToShow));
                            }
                        }
                    } 
                    
                    // Apply visibility based on determined states
                    if (tableShouldBeVisible) {
                        tableElement.classList.remove('hidden');
                        if (footerWrapperElement) footerWrapperElement.classList.remove('hidden');
                    } else {
                        tableElement.classList.add('hidden');
                        allDataRows.forEach(row => row.classList.add('hidden')); // Ensure all rows are hidden if table is hidden
                        if (footerWrapperElement) footerWrapperElement.classList.add('hidden');
                    }

                    // Visibility of the summary (now tfoot) is handled by tableElement's visibility
                    checkAndToggleVerticalScroll();
                }
            }
        });
    }
}

function getBlueColorForSlice(index) {
    // A palette of dark grays and near-blacks for a metallic, dark theme.
    // Larger slices (lower index) will get darker blues.
    const metallicDarkPalette = [
        '#2B2B2B', // Very Dark Gray / Near Black
        '#333333', // Dark Gray
        '#4F4F4F', // Medium Dark Gray
        '#606060', // Gray
        '#757575', // Medium Light Gray (Metallic Sheen)
        '#888888', // Light Gray (Metallic Sheen)
        '#A0A0A0', // Lighter Gray
        '#BDBDBD'  // Very Light Gray / Silver
    ];
    
    // Cycle through the palette if there are more items than colors
    return metallicDarkPalette[index % metallicDarkPalette.length];
}

function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    // 3 digits
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) { // 6 digits
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function checkAndToggleVerticalScroll() {
    const isMobile = window.innerWidth <= 768;
    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    
    if (isMobile) { // Only on mobile layout
        htmlElement.style.setProperty('overflow-y', 'hidden', 'important');
        bodyElement.style.setProperty('overflow-y', 'hidden', 'important');
    } else {
        // Ensure scrolling is enabled on desktop
        htmlElement.style.overflowY = '';
        bodyElement.style.overflowY = '';
    }
}

// Fetch prices when the page loads
document.addEventListener('DOMContentLoaded', fetchAndUpdatePrices);
// Check scroll on window resize
window.addEventListener('resize', checkAndToggleVerticalScroll);
// Optional: Refresh prices every 5 minutes (300000 milliseconds)
// setInterval(fetchAndUpdatePrices, 300000);

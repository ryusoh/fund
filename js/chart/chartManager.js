import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { checkAndToggleVerticalScroll } from '../ui/responsive.js';

let fundChartInstance = null;

export function updatePieChart(data) {
    const ctx = document.getElementById('fundPieChart').getContext('2d');
    
    if (fundChartInstance) {
        fundChartInstance.data.labels = data.labels;
        fundChartInstance.data.datasets[0].data = data.datasets[0].data;
        fundChartInstance.data.datasets[0].backgroundColor = data.datasets[0].backgroundColor;
        fundChartInstance.update();
    } else {
        fundChartInstance = new Chart(ctx, { // Assuming Chart is global
            type: 'doughnut',
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
                        color: 'rgba(235, 235, 245, 0.6)', 
                        font: {
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
                            size: 10, 
                        },
                        anchor: 'end', 
                        align: 'end', 
                        offset: 8, 
                        textAlign: 'center', 
                        connector: {
                            display: true,
                            color: (context) => {
                                const baseHexColor = getBlueColorForSlice(context.dataIndex, context.chart.data.labels.length);
                                return hexToRgba(baseHexColor, 0.5); 
                            },
                            width: 1
                        }
                    },
                    title: {
                        display: false,
                        text: 'Fund Allocation',
                        color: '#FFFFFF',
                        font: {}
                    },
                },
                onHover: (event, activeElements, chart) => {
                    const tableElement = document.querySelector('table');
                    const allDataRows = document.querySelectorAll('tbody tr[data-ticker]');
                    const footerWrapperElement = document.querySelector('.footer-wrapper');

                    const mouseX = event.x;
                    const mouseY = event.y;
                    let isOverCenter = false;

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
                        tableShouldBeVisible = true;
                        allDataRows.forEach(row => row.classList.remove('hidden'));
                    } else if (activeElements.length > 0 && chart.data.labels?.length > 0) {
                        const activeSegment = activeElements[0];
                        const dataIndex = activeSegment.index;
                        if (dataIndex >= 0 && dataIndex < chart.data.labels.length) {
                            const ticker = chart.data.labels[dataIndex];
                            specificRowToShow = document.querySelector(`tbody tr[data-ticker="${ticker}"]`);
                            if (specificRowToShow) {
                                tableShouldBeVisible = true;
                                allDataRows.forEach(row => row.classList.toggle('hidden', row !== specificRowToShow));
                            }
                        }
                    } 
                    
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
            }
        });
    }
}

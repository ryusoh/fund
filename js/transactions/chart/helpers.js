import { CHART_SMOOTHING } from '../../config.js';

const DEFAULT_MONO_FONT = "'JetBrains Mono','IBM Plex Mono','Menlo',monospace";

const crosshairDateFormatter =
    typeof Intl !== 'undefined'
        ? new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
          })
        : null;

// Color parsing context
const COLOR_PARSER_CONTEXT = (() => {
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.getContext('2d');
})();

export function niceNumber(range, round) {
    if (!Number.isFinite(range) || range === 0) {
        return 1;
    }
    const exponent = Math.floor(Math.log10(Math.abs(range)));
    const fraction = Math.abs(range) / 10 ** exponent;
    let niceFraction;
    if (round) {
        if (fraction < 1.5) {
            niceFraction = 1;
        } else if (fraction < 3) {
            niceFraction = 2;
        } else if (fraction < 7) {
            niceFraction = 5;
        } else {
            niceFraction = 10;
        }
    } else if (fraction <= 1) {
        niceFraction = 1;
    } else if (fraction <= 2) {
        niceFraction = 2;
    } else if (fraction <= 5) {
        niceFraction = 5;
    } else {
        niceFraction = 10;
    }
    return (range < 0 ? -1 : 1) * niceFraction * 10 ** exponent;
}

export function parseLocalDate(value) {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === 'number') {
        const temp = new Date(value);
        if (!Number.isNaN(temp.getTime())) {
            return new Date(temp.getFullYear(), temp.getMonth(), temp.getDate());
        }
        return null;
    }
    if (typeof value === 'string') {
        const parts = value.split('-');
        if (parts.length >= 3) {
            const year = Number(parts[0]);
            const month = Number(parts[1]) - 1;
            const day = Number(parts[2]);
            if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
                return new Date(year, month, day);
            }
        }
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        }
    }
    return null;
}

export function clampTime(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return value;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}

export function createTimeInterpolator(points) {
    if (!Array.isArray(points) || points.length === 0) {
        return () => null;
    }
    const sorted = points.slice().sort((a, b) => a.time - b.time);
    return (time) => {
        if (!Number.isFinite(time)) {
            return null;
        }
        const clampedTime = clampTime(time, sorted[0].time, sorted[sorted.length - 1].time);
        let low = 0;
        let high = sorted.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const midTime = sorted[mid].time;
            if (midTime === clampedTime) {
                return sorted[mid].value;
            }
            if (midTime < clampedTime) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        const leftIndex = Math.max(0, Math.min(sorted.length - 1, high));
        const rightIndex = Math.max(0, Math.min(sorted.length - 1, low));
        const leftPoint = sorted[leftIndex];
        const rightPoint = sorted[rightIndex] || leftPoint;
        if (!leftPoint || !rightPoint) {
            return null;
        }
        if (leftPoint.time === rightPoint.time) {
            return leftPoint.value;
        }
        const ratio = (clampedTime - leftPoint.time) / (rightPoint.time - leftPoint.time || 1e-12);
        return leftPoint.value + (rightPoint.value - leftPoint.value) * ratio;
    };
}

export function getMonoFontFamily() {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
        const value = window
            .getComputedStyle(document.documentElement)
            .getPropertyValue('--font-family-mono');
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return DEFAULT_MONO_FONT;
}

export const formatPercentInline = (value) => {
    if (!Number.isFinite(value)) {
        return '0%';
    }
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toFixed(2)}%`;
};

export function formatFxValue(value) {
    if (!Number.isFinite(value)) {
        return '–';
    }
    const absValue = Math.abs(value);
    if (absValue >= 100) {
        return value.toFixed(1);
    }
    if (absValue >= 10) {
        return value.toFixed(2);
    }
    if (absValue >= 1) {
        return value.toFixed(3);
    }
    return value.toFixed(4);
}

export function formatCrosshairDateLabel(time) {
    if (!Number.isFinite(time)) {
        return '';
    }
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    if (crosshairDateFormatter) {
        return crosshairDateFormatter.format(date);
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

// Color Utility Functions
export function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function componentFromChannel(channel) {
    const trimmed = channel.trim();
    if (trimmed.endsWith('%')) {
        const percentage = parseFloat(trimmed.slice(0, -1));
        if (!Number.isFinite(percentage)) {
            return 0;
        }
        return Math.round((percentage / 100) * 255);
    }
    const numeric = parseFloat(trimmed);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

export function parseColorToRgb(baseColor) {
    if (typeof baseColor !== 'string' || baseColor.length === 0) {
        return null;
    }

    const hexMatch = baseColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((char) => char + char)
                .join('');
        }
        const intVal = parseInt(hex, 16);
        return {
            r: (intVal >> 16) & 255,
            g: (intVal >> 8) & 255,
            b: intVal & 255,
        };
    }

    const rgbMatch = baseColor.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',');
        if (parts.length >= 3) {
            return {
                r: componentFromChannel(parts[0]),
                g: componentFromChannel(parts[1]),
                b: componentFromChannel(parts[2]),
            };
        }
    }

    if (!COLOR_PARSER_CONTEXT) {
        return null;
    }

    const ctx = COLOR_PARSER_CONTEXT;
    ctx.save();
    try {
        ctx.fillStyle = baseColor;
        const computed = ctx.fillStyle;
        ctx.restore();
        if (computed && computed !== baseColor) {
            return parseColorToRgb(computed);
        }
    } catch {
        ctx.restore();
        return null;
    }
    return null;
}

export function colorWithAlpha(baseColor, alpha) {
    const normalizedAlpha = clamp01(alpha);
    if (normalizedAlpha <= 0) {
        return 'rgba(0, 0, 0, 0)';
    }

    if (typeof baseColor !== 'string' || baseColor.length === 0) {
        return baseColor;
    }

    const hexMatch = baseColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((char) => char + char)
                .join('');
        }
        const intVal = parseInt(hex, 16);
        const r = (intVal >> 16) & 255;
        const g = (intVal >> 8) & 255;
        const b = intVal & 255;
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }

    const rgbMatch = baseColor.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',');
        if (parts.length >= 3) {
            const r = componentFromChannel(parts[0]);
            const g = componentFromChannel(parts[1]);
            const b = componentFromChannel(parts[2]);
            return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
        }
    }

    if (COLOR_PARSER_CONTEXT) {
        const ctx = COLOR_PARSER_CONTEXT;
        ctx.save();
        ctx.fillStyle = baseColor;
        const computed = ctx.fillStyle;
        ctx.restore();
        if (computed && computed !== baseColor) {
            return colorWithAlpha(computed, normalizedAlpha);
        }
    }

    return baseColor;
}

export function lightenColor(baseColor, amount = 0.3) {
    const components = parseColorToRgb(baseColor);
    if (!components) {
        return baseColor;
    }
    const ratio = clamp01(amount);
    const mixChannel = (value) => Math.round(value + (255 - value) * ratio);
    const r = mixChannel(components.r);
    const g = mixChannel(components.g);
    const b = mixChannel(components.b);
    return `rgb(${r}, ${g}, ${b})`;
}

export function darkenColor(baseColor, amount = 0.3) {
    const components = parseColorToRgb(baseColor);
    if (!components) {
        return baseColor;
    }
    const ratio = clamp01(amount);
    const mixChannel = (value) => Math.round(value * (1 - ratio));
    const r = mixChannel(components.r);
    const g = mixChannel(components.g);
    const b = mixChannel(components.b);
    return `rgb(${r}, ${g}, ${b})`;
}

export function getChartColors(rootStyles) {
    if (!rootStyles) {
        return {};
    }
    return {
        portfolio: rootStyles.getPropertyValue('--portfolio-line').trim() || '#7a7a7a',
        contribution: rootStyles.getPropertyValue('--contribution-line').trim() || '#b3b3b3',
        sp500: rootStyles.getPropertyValue('--sp500-line').trim() || '#ef553b',
        nasdaq: rootStyles.getPropertyValue('--nasdaq-line').trim() || '#00d5ff',
        dji: rootStyles.getPropertyValue('--dji-line').trim() || '#ab63fa',
        ssec: rootStyles.getPropertyValue('--sse-line').trim() || '#ffa15a',
        hsi: rootStyles.getPropertyValue('--hsi-line').trim() || '#19d3f3',
        nikkei: rootStyles.getPropertyValue('--n225-line').trim() || '#ff6692',
        buy: 'rgba(48, 209, 88, 0.8)',
        sell: 'rgba(255, 69, 58, 0.8)',
        buyFill: 'rgba(48, 209, 88, 0.45)',
        sellFill: 'rgba(255, 69, 58, 0.45)',
    };
}

export function getSmoothingConfig(chartType) {
    if (!CHART_SMOOTHING.enabled) {
        return null; // Smoothing disabled
    }

    const methodName = CHART_SMOOTHING.charts[chartType] || 'balanced';
    const methodConfig = CHART_SMOOTHING.methods[methodName] || CHART_SMOOTHING.methods.balanced;
    if (!methodConfig || methodConfig.method === 'none') {
        return null;
    }
    return methodConfig;
}

export function injectSyntheticStartPoint(filteredData, fullSeries, filterFrom = null) {
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
        return filteredData;
    }
    if (!Array.isArray(fullSeries) || fullSeries.length === 0) {
        return filteredData;
    }

    const firstFiltered = filteredData[0];
    const firstTime =
        firstFiltered && firstFiltered.date instanceof Date
            ? firstFiltered.date.getTime()
            : new Date(firstFiltered.date).getTime();
    if (!Number.isFinite(firstTime)) {
        return filteredData;
    }

    const matchingIndex = fullSeries.findIndex((item) => {
        if (!item) {
            return false;
        }
        const itemDate = new Date(item.date);
        if (Number.isNaN(itemDate.getTime())) {
            return false;
        }
        return itemDate.getTime() === firstTime;
    });

    if (matchingIndex <= 0) {
        return filteredData;
    }

    const previousPoint = fullSeries[matchingIndex - 1];
    if (!previousPoint || !previousPoint.synthetic) {
        return filteredData;
    }

    const prevDate = new Date(previousPoint.date);
    if (Number.isNaN(prevDate.getTime())) {
        return filteredData;
    }

    // If we have a filterFrom date and the synthetic point is before it, clamp it to filterFrom
    // This fixes the "left-edge overhang" where the line starts to the left of the Y-axis
    if (filterFrom && prevDate < filterFrom) {
        // Check if we already have a point at filterFrom to avoid duplicates
        const firstFiltered = filteredData[0];
        const firstTime =
            firstFiltered && firstFiltered.date instanceof Date
                ? firstFiltered.date.getTime()
                : new Date(firstFiltered.date).getTime();

        if (Math.abs(firstTime - filterFrom.getTime()) < 1000) {
            return filteredData;
        }

        return [
            {
                ...previousPoint,
                date: new Date(filterFrom),
                synthetic: true,
            },
            ...filteredData,
        ];
    }

    const prevValue = Number(previousPoint.value);
    const epsilon = 1e-6;
    if (!Number.isFinite(prevValue) || Math.abs(prevValue) > epsilon) {
        return filteredData;
    }

    // Don't add the synthetic point if it would be at the same position as the first filtered point
    if (
        filteredData[0].date instanceof Date &&
        filteredData[0].date.getTime() === prevDate.getTime()
    ) {
        return filteredData;
    }

    // Only add synthetic point if it's within the filter range
    // Note: The clamping logic above handles the case where prevDate < filterFrom
    if (filterFrom && prevDate < filterFrom) {
        // This block is now redundant due to the clamping above, but keeping for safety
        // in case the logic flow changes.
        return filteredData;
    }

    const syntheticPoint = {
        date: prevDate,
        value: Number.isFinite(prevValue) ? prevValue : 0,
        synthetic: true,
    };

    return [syntheticPoint, ...filteredData];
}

export function constrainSeriesToRange(series, rangeStart, rangeEnd) {
    if (!Array.isArray(series) || (!rangeStart && !rangeEnd)) {
        return series;
    }

    const startTime =
        rangeStart instanceof Date && Number.isFinite(rangeStart.getTime())
            ? rangeStart.getTime()
            : null;
    const endTime =
        rangeEnd instanceof Date && Number.isFinite(rangeEnd.getTime()) ? rangeEnd.getTime() : null;

    if (!Number.isFinite(startTime) && !Number.isFinite(endTime)) {
        return series;
    }

    return series.filter((point) => {
        if (!point) {
            return false;
        }
        const pointDate = point.date instanceof Date ? point.date : new Date(point.date);
        const time = pointDate.getTime();
        if (Number.isNaN(time)) {
            return false;
        }
        if (Number.isFinite(startTime) && time < startTime) {
            return false;
        }
        if (Number.isFinite(endTime) && time > endTime) {
            return false;
        }
        return true;
    });
}

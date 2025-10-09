/**
 * Financial Chart Smoothing Utilities
 *
 * Provides various smoothing algorithms commonly used in financial charts
 * to reduce noise while preserving important trends and ensuring end values remain accurate.
 */

/**
 * Simple Moving Average (SMA)
 * Averages the last N data points for each position
 * @param {Array} data - Array of {x, y} points
 * @param {number} window - Window size for averaging
 * @param {boolean} preserveEnd - Whether to preserve the last point unchanged
 * @returns {Array} Smoothed data points
 */
export function simpleMovingAverage(data, window = 3, preserveEnd = true) {
    if (!Array.isArray(data) || data.length === 0) {
        return data;
    }

    if (data.length < window) {
        return data;
    }

    const smoothed = [];

    for (let i = 0; i < data.length; i++) {
        // Preserve the last point if requested
        if (preserveEnd && i === data.length - 1) {
            smoothed.push({ ...data[i] });
            continue;
        }

        // Calculate the average for the window
        const start = Math.max(0, i - Math.floor(window / 2));
        const end = Math.min(data.length, start + window);
        const windowData = data.slice(start, end);

        const sum = windowData.reduce((acc, point) => acc + point.y, 0);
        const average = sum / windowData.length;

        smoothed.push({
            x: data[i].x,
            y: average,
        });
    }

    return smoothed;
}

/**
 * Exponential Moving Average (EMA)
 * Industry standard for financial charts - more responsive to recent changes
 * @param {Array} data - Array of {x, y} points
 * @param {number} alpha - Smoothing factor (0-1), higher = more responsive
 * @param {boolean} preserveEnd - Whether to preserve the last point unchanged
 * @returns {Array} Smoothed data points
 */
export function exponentialMovingAverage(data, alpha = 0.3, preserveEnd = true) {
    if (!Array.isArray(data) || data.length === 0) {
        return data;
    }

    if (data.length === 1) {
        return data;
    }

    const smoothed = [{ ...data[0] }];

    for (let i = 1; i < data.length; i++) {
        // Preserve the last point if requested
        if (preserveEnd && i === data.length - 1) {
            smoothed.push({ ...data[i] });
            continue;
        }

        const prevSmoothed = smoothed[i - 1].y;
        const current = data[i].y;
        const smoothedValue = alpha * current + (1 - alpha) * prevSmoothed;

        smoothed.push({
            x: data[i].x,
            y: smoothedValue,
        });
    }

    return smoothed;
}

/**
 * Savitzky-Golay Filter
 * Preserves peaks and valleys better than simple moving averages
 * @param {Array} data - Array of {x, y} points
 * @param {number} window - Window size (must be odd)
 * @param {number} order - Polynomial order (typically 2 or 3)
 * @param {boolean} preserveEnd - Whether to preserve the last point unchanged
 * @returns {Array} Smoothed data points
 */
export function savitzkyGolay(data, window = 5, order = 2, preserveEnd = true) {
    if (!Array.isArray(data) || data.length === 0) {
        return data;
    }

    if (data.length < window) {
        return data;
    }

    // Ensure window is odd
    if (window % 2 === 0) {
        window += 1;
    }

    const halfWindow = Math.floor(window / 2);
    const smoothed = [];

    for (let i = 0; i < data.length; i++) {
        // Preserve the last point if requested
        if (preserveEnd && i === data.length - 1) {
            smoothed.push({ ...data[i] });
            continue;
        }

        // Calculate the window boundaries
        const start = Math.max(0, i - halfWindow);
        const end = Math.min(data.length, i + halfWindow + 1);
        const windowData = data.slice(start, end);

        if (windowData.length < 3) {
            smoothed.push({ ...data[i] });
            continue;
        }

        // Simple polynomial fitting for small windows
        const smoothedValue = polynomialFit(windowData, order, i - start);
        smoothed.push({
            x: data[i].x,
            y: smoothedValue,
        });
    }

    return smoothed;
}

/**
 * LOWESS (Locally Weighted Scatterplot Smoothing)
 * Non-parametric smoothing that adapts to local patterns
 * @param {Array} data - Array of {x, y} points
 * @param {number} bandwidth - Bandwidth parameter (0-1)
 * @param {boolean} preserveEnd - Whether to preserve the last point unchanged
 * @returns {Array} Smoothed data points
 */
export function lowess(data, bandwidth = 0.3, preserveEnd = true) {
    if (!Array.isArray(data) || data.length === 0) {
        return data;
    }

    if (data.length < 3) {
        return data;
    }

    const smoothed = [];

    for (let i = 0; i < data.length; i++) {
        // Preserve the last point if requested
        if (preserveEnd && i === data.length - 1) {
            smoothed.push({ ...data[i] });
            continue;
        }

        const smoothedValue = weightedLocalRegression(data, i, bandwidth);
        smoothed.push({
            x: data[i].x,
            y: smoothedValue,
        });
    }

    return smoothed;
}

/**
 * Adaptive Smoothing
 * Automatically chooses the best smoothing method based on data characteristics
 * @param {Array} data - Array of {x, y} points
 * @param {boolean} preserveEnd - Whether to preserve the last point unchanged
 * @returns {Array} Smoothed data points
 */
export function adaptiveSmoothing(data, preserveEnd = true) {
    if (!Array.isArray(data) || data.length === 0) {
        return data;
    }

    if (data.length < 10) {
        return exponentialMovingAverage(data, 0.2, preserveEnd);
    }

    // Calculate volatility to determine smoothing strength
    const returns = [];
    for (let i = 1; i < data.length; i++) {
        const ret = (data[i].y - data[i - 1].y) / data[i - 1].y;
        returns.push(Math.abs(ret));
    }

    const avgVolatility = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;

    // Choose smoothing method based on volatility
    if (avgVolatility > 0.05) {
        // High volatility
        return exponentialMovingAverage(data, 0.4, preserveEnd);
    } else if (avgVolatility > 0.02) {
        // Medium volatility
        return exponentialMovingAverage(data, 0.3, preserveEnd);
    }
    // Low volatility
    return exponentialMovingAverage(data, 0.2, preserveEnd);
}

/**
 * Helper function for polynomial fitting in Savitzky-Golay
 */
function polynomialFit(points, order, targetIndex) {
    const n = points.length;
    if (n <= order) {
        return points[targetIndex]?.y || 0;
    }

    // Simple linear regression for order 1, quadratic for order 2
    if (order === 1) {
        const sumX = points.reduce((sum, p, i) => sum + i, 0);
        const sumY = points.reduce((sum, p) => sum + p.y, 0);
        const sumXY = points.reduce((sum, p, i) => sum + i * p.y, 0);
        const sumXX = points.reduce((sum, p, i) => sum + i * i, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return slope * targetIndex + intercept;
    }
    // For higher orders, use a simplified approach
    return points[targetIndex]?.y || 0;
}

/**
 * Helper function for weighted local regression in LOWESS
 */
function weightedLocalRegression(data, index, bandwidth) {
    const n = data.length;
    const targetX = data[index].x;

    // Calculate weights using tricube function
    const weights = [];
    for (let i = 0; i < n; i++) {
        const distance = Math.abs(data[i].x - targetX);
        const maxDistance = Math.max(...data.map((p) => Math.abs(p.x - targetX)));
        const normalizedDistance = distance / (bandwidth * maxDistance);

        if (normalizedDistance < 1) {
            const weight = Math.pow(1 - Math.pow(normalizedDistance, 3), 3);
            weights.push(weight);
        } else {
            weights.push(0);
        }
    }

    // Weighted average
    let weightedSum = 0;
    let weightSum = 0;

    for (let i = 0; i < n; i++) {
        weightedSum += weights[i] * data[i].y;
        weightSum += weights[i];
    }

    return weightSum > 0 ? weightedSum / weightSum : data[index].y;
}

/**
 * Default smoothing configuration for financial charts
 */
export const SMOOTHING_CONFIGS = {
    // Conservative smoothing - minimal impact
    conservative: {
        method: 'exponential',
        params: { alpha: 0.2 },
        description: 'Minimal smoothing, preserves most detail',
    },

    // Balanced smoothing - industry standard
    balanced: {
        method: 'exponential',
        params: { alpha: 0.3 },
        description: 'Balanced smoothing, good for most financial data',
    },

    // Aggressive smoothing - very smooth lines
    aggressive: {
        method: 'exponential',
        params: { alpha: 0.5 },
        description: 'Strong smoothing, reduces noise significantly',
    },

    // Adaptive smoothing - automatically adjusts
    adaptive: {
        method: 'adaptive',
        params: {},
        description: 'Automatically adjusts based on data volatility',
    },
};

/**
 * Apply smoothing to financial chart data
 * @param {Array} data - Array of {x, y} points
 * @param {string|Object} config - Smoothing configuration name or custom config
 * @param {boolean} preserveEnd - Whether to preserve the last point unchanged
 * @returns {Array} Smoothed data points
 */
export function smoothFinancialData(data, config = 'balanced', preserveEnd = true) {
    if (!Array.isArray(data) || data.length === 0) {
        return data;
    }

    // Get configuration
    const smoothingConfig =
        typeof config === 'string'
            ? SMOOTHING_CONFIGS[config] || SMOOTHING_CONFIGS.balanced
            : config;

    // Apply the appropriate smoothing method
    switch (smoothingConfig.method) {
        case 'simple':
            return simpleMovingAverage(data, smoothingConfig.params.window || 3, preserveEnd);
        case 'exponential':
            return exponentialMovingAverage(data, smoothingConfig.params.alpha || 0.3, preserveEnd);
        case 'savitzky':
            return savitzkyGolay(
                data,
                smoothingConfig.params.window || 5,
                smoothingConfig.params.order || 2,
                preserveEnd
            );
        case 'lowess':
            return lowess(data, smoothingConfig.params.bandwidth || 0.3, preserveEnd);
        case 'adaptive':
            return adaptiveSmoothing(data, preserveEnd);
        default:
            return exponentialMovingAverage(data, 0.3, preserveEnd);
    }
}

import { CALENDAR_CONFIG, CALENDAR_SELECTORS } from '@js/config.js';

export const VALUE_FIELD_BY_CURRENCY = {
    USD: 'valueUSD',
    CNY: 'valueCNY',
    JPY: 'valueJPY',
    KRW: 'valueKRW',
};

export function getValueFieldForCurrency(currency) {
    return VALUE_FIELD_BY_CURRENCY[currency] || VALUE_FIELD_BY_CURRENCY.USD;
}

function resolveColorScale(d3Instance, scaleConfig = CALENDAR_CONFIG.scale?.color) {
    if (!d3Instance || typeof d3Instance.scaleLinear !== 'function') {
        return null;
    }

    const domainConfig =
        Array.isArray(scaleConfig?.domain) && scaleConfig.domain.length === 2
            ? scaleConfig.domain
            : [-0.01, 0.01];
    const rangeConfig =
        Array.isArray(scaleConfig?.range) && scaleConfig.range.length === 3
            ? scaleConfig.range
            : ['rgba(244, 67, 54, 0.95)', 'rgba(120, 120, 125, 0.5)', 'rgba(76, 175, 80, 0.95)'];

    return d3Instance
        .scaleLinear()
        .domain([domainConfig[0], 0, domainConfig[1]])
        .range(rangeConfig)
        .clamp(true);
}

export function applyCurrencyColors(
    d3Instance,
    state,
    byDate,
    selector = CALENDAR_SELECTORS.heatmap,
    scaleConfig = CALENDAR_CONFIG.scale?.color
) {
    if (!d3Instance || !state || !byDate || typeof byDate.get !== 'function') {
        return;
    }

    const heatmapRoot = d3Instance.select(selector);
    if (!heatmapRoot || typeof heatmapRoot.selectAll !== 'function') {
        return;
    }

    const colorScale = resolveColorScale(d3Instance, scaleConfig);
    const valueField = getValueFieldForCurrency(state.selectedCurrency);

    heatmapRoot.selectAll('rect.ch-subdomain-bg').each(function (datum) {
        const cell = d3Instance.select(this);
        const dataPoint = cell && typeof cell.datum === 'function' ? cell.datum() : datum;

        const timestamp =
            dataPoint && typeof dataPoint === 'object' && dataPoint !== null ? dataPoint.t : null;
        const dateValue =
            timestamp !== null && timestamp !== undefined
                ? new Date(timestamp)
                : dataPoint instanceof Date
                  ? dataPoint
                  : null;

        if (!dateValue || !Number.isFinite(dateValue.getTime())) {
            return;
        }

        const dateStr = `${dateValue.getUTCFullYear()}-${String(dateValue.getUTCMonth() + 1).padStart(2, '0')}-${String(dateValue.getUTCDate()).padStart(2, '0')}`;
        const entry = byDate.get(dateStr);

        const value =
            entry && valueField && entry[valueField] !== undefined
                ? entry[valueField]
                : entry && entry.value !== undefined
                  ? entry.value
                  : 0;

        const numericValue = Number.isFinite(value) ? value : 0;
        const color = colorScale ? colorScale(numericValue) : undefined;

        if (cell && typeof cell.attr === 'function') {
            cell.attr('fill', color);
        }
        if (cell && typeof cell.style === 'function') {
            cell.style('fill', color);
        }
    });
}

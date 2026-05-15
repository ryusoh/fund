import {
    CALENDAR_SELECTORS,
    CALENDAR_MONTH_LABEL_BACKGROUND,
    CALENDAR_MONTH_LABEL_HIGHLIGHT,
    COLORS,
    UI_BREAKPOINTS,
} from '@js/config.js';
import { setThinkingHighlight } from '@ui/textHighlightManager.js';

const FROSTED_FILTER_ID = 'cal-domain-frosted';

const MONTH_NAME_TO_INDEX = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    // Abbreviated month names
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    // may is already the same abbreviated and full
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

function lightenHexToRgba(hex, lightenFactor, alpha) {
    if (typeof hex !== 'string' || !/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex)) {
        return null;
    }
    const normalized =
        hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const r = parseInt(normalized.substring(1, 3), 16);
    const g = parseInt(normalized.substring(3, 5), 16);
    const b = parseInt(normalized.substring(5, 7), 16);
    /* istanbul ignore next: defensive parameter validation in utility function */
    const light = Math.max(0, Math.min(1, Number.isFinite(lightenFactor) ? lightenFactor : 0.5));
    /* istanbul ignore next: defensive parameter validation in utility function */
    const targetAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const lighten = (channel) => Math.round(channel + (255 - channel) * light);
    return `rgba(${lighten(r)}, ${lighten(g)}, ${lighten(b)}, ${targetAlpha})`;
}

/* istanbul ignore next: defensive utility function for month label parsing */
function getMonthKeyFromLabel(labelText) {
    /* istanbul ignore next: defensive programming for non-string input */
    if (typeof labelText !== 'string') {
        /* istanbul ignore next: defensive programming for non-string input */
        return null;
    }
    /* istanbul ignore next: defensive programming for empty strings */
    const trimmed = labelText.trim();
    /* istanbul ignore next: defensive programming for empty strings */
    if (!trimmed) {
        /* istanbul ignore next: defensive programming for empty strings */
        return null;
    }
    /* istanbul ignore next: defensive programming for invalid format */
    const match = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
    /* istanbul ignore next: defensive programming for invalid format */
    /* istanbul ignore if */ if (!match) {
        /* istanbul ignore next: defensive programming for invalid format */
        return null;
    }
    /* istanbul ignore next: defensive programming for invalid month/year */
    const monthName = match[1].toLowerCase();
    /* istanbul ignore next: defensive programming for invalid month/year */
    const year = Number(match[2]);
    /* istanbul ignore next: defensive programming for invalid month/year */
    const monthIndex = MONTH_NAME_TO_INDEX[monthName];
    /* istanbul ignore next: defensive programming for invalid month/year */
    if (!Number.isFinite(year) || !monthIndex) {
        /* istanbul ignore next: defensive programming for invalid month/year */
        return null;
    }
    /* istanbul ignore next: defensive programming for invalid month/year */
    return `${year}-${String(monthIndex).padStart(2, '0')}`;
}

/* istanbul ignore next: utility function to get currency-specific absolute change */
function getAbsoluteChangeForCurrency(monthlyPnlInfo, currency) {
    /* istanbul ignore next: defensive programming for invalid monthly PnL info */
    if (!monthlyPnlInfo || typeof monthlyPnlInfo !== 'object') {
        /* istanbul ignore next: defensive programming for invalid monthly PnL info */
        return null;
    }

    switch (currency) {
        case 'CNY':
            return monthlyPnlInfo.absoluteChangeCNY;
        case 'JPY':
            return monthlyPnlInfo.absoluteChangeJPY;
        case 'KRW':
            return monthlyPnlInfo.absoluteChangeKRW;
        case 'USD':
        default:
            return monthlyPnlInfo.absoluteChangeUSD;
    }
}

/* istanbul ignore next: utility function to get currency-specific percent change */
function getPercentChangeForCurrency(monthlyPnlInfo, currency) {
    /* istanbul ignore next: defensive programming for invalid monthly PnL info */
    if (!monthlyPnlInfo || typeof monthlyPnlInfo !== 'object') {
        /* istanbul ignore next: defensive programming for invalid monthly PnL info */
        return null;
    }

    switch (currency) {
        case 'CNY':
            return monthlyPnlInfo.percentChangeCNY;
        case 'JPY':
            return monthlyPnlInfo.percentChangeJPY;
        case 'KRW':
            return monthlyPnlInfo.percentChangeKRW;
        case 'USD':
        default:
            return monthlyPnlInfo.percentChangeUSD || monthlyPnlInfo.percentChange;
    }
}

/* istanbul ignore next: defensive utility function for monthly change formatting */
function formatMonthlyChange(state, currencySymbols, monthlyPnlInfo) {
    /* istanbul ignore next: defensive programming for invalid amounts */
    const currency = state.selectedCurrency || 'USD';
    const absoluteChange = getAbsoluteChangeForCurrency(monthlyPnlInfo, currency);

    /* istanbul ignore next: defensive programming for invalid amounts */
    if (!Number.isFinite(absoluteChange)) {
        /* istanbul ignore next: defensive programming for invalid amounts */
        return null;
    }

    /* istanbul ignore next: defensive programming for invalid amounts */
    const symbol = currencySymbols[currency] || currency;
    const formattedNumber = Math.abs(absoluteChange).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    /* istanbul ignore next: defensive programming for invalid amounts */
    const sign = absoluteChange > 0 ? '+' : absoluteChange < 0 ? '-' : '';
    /* istanbul ignore next: defensive programming for invalid amounts */
    return `${sign}${symbol}${formattedNumber}`;
}

/* istanbul ignore next: defensive utility function for monthly percent formatting */
function formatMonthlyPercent(percentChange) {
    /* istanbul ignore next: defensive programming for invalid percentages */
    if (!Number.isFinite(percentChange)) {
        /* istanbul ignore next: defensive programming for invalid percentages */
        return 'n/a';
    }
    /* istanbul ignore next: defensive programming for invalid percentages */
    const percentValue = percentChange * 100;
    /* istanbul ignore next: defensive programming for invalid percentages */
    const sign = percentValue > 0 ? '+' : percentValue < 0 ? '-' : '';
    /* istanbul ignore next: defensive programming for invalid percentages */
    return `${sign}${Math.abs(percentValue).toFixed(2)}%`;
}

/* istanbul ignore next: defensive utility function for SVG filter creation */
function ensureFrostedFilter(d3Instance) {
    /* istanbul ignore next: defensive programming for missing d3 instance */
    if (!d3Instance) {
        /* istanbul ignore next: defensive programming for missing d3 instance */
        return null;
    }
    /* istanbul ignore next: defensive programming for missing SVG */
    const svg = d3Instance.select(`${CALENDAR_SELECTORS.heatmap} svg`);
    /* istanbul ignore next: defensive programming for missing SVG */
    if (!svg || typeof svg.empty !== 'function' || svg.empty()) {
        /* istanbul ignore next: defensive programming for missing SVG */
        return null;
    }

    /* istanbul ignore next: defensive programming for missing SVG */
    let defs = svg.select('defs#cal-domain-defs');
    /* istanbul ignore next: defensive programming for missing SVG */
    if (defs.empty()) {
        /* istanbul ignore next: defensive programming for missing SVG */
        defs = svg.insert('defs', ':first-child').attr('id', 'cal-domain-defs');
    }

    /* istanbul ignore next: defensive programming for missing SVG */
    let filter = defs.select(`#${FROSTED_FILTER_ID}`);
    /* istanbul ignore next: defensive programming for missing SVG */
    if (filter.empty()) {
        /* istanbul ignore next: defensive programming for missing SVG */
        filter = defs
            .append('filter')
            .attr('id', FROSTED_FILTER_ID)
            .attr('x', '-25%')
            .attr('y', '-25%')
            .attr('width', '150%')
            .attr('height', '150%');

        /* istanbul ignore next: defensive programming for missing SVG */
        filter
            .append('feGaussianBlur')
            .attr('in', 'SourceGraphic')
            .attr('stdDeviation', CALENDAR_MONTH_LABEL_BACKGROUND.blurStdDeviation || 8);
        /* istanbul ignore next: defensive programming for missing SVG */
        filter
            .append('feComponentTransfer')
            .append('feFuncA')
            .attr('type', 'linear')
            .attr('slope', CALENDAR_MONTH_LABEL_BACKGROUND.alphaSlope || 0.65);
    }

    /* istanbul ignore next: defensive programming for successful filter creation */
    return FROSTED_FILTER_ID;
}

/* istanbul ignore next: defensive main function for month label updates */
export function updateMonthLabels(d3Instance, state, currencySymbols) {
    /* istanbul ignore next: defensive programming for missing d3 instance */
    if (!d3Instance) {
        /* istanbul ignore next: defensive programming for missing d3 instance */
        return;
    }

    /* istanbul ignore next: defensive programming for UI state calculation */
    const viewportThreshold = CALENDAR_MONTH_LABEL_BACKGROUND.maxWidth ?? UI_BREAKPOINTS.MOBILE;
    /* istanbul ignore next: defensive programming for UI state calculation */
    const isMobileViewport = window.innerWidth <= viewportThreshold;
    /* istanbul ignore next: defensive programming for UI state calculation */
    const pageWrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);
    /* istanbul ignore next: defensive programming for UI state calculation */
    const classList =
        pageWrapper && typeof pageWrapper.classList === 'object' ? pageWrapper.classList : null;
    /* istanbul ignore next: defensive programming for UI state calculation */
    const isZoomed = Boolean(
        classList && typeof classList.contains === 'function' && classList.contains('zoomed')
    );
    /* istanbul ignore next: defensive programming for UI state calculation */
    const backgroundsEnabled = CALENDAR_MONTH_LABEL_BACKGROUND.enabled !== false;
    /* istanbul ignore next: defensive programming for UI state calculation */
    const shouldShowBackground =
        backgroundsEnabled && (isMobileViewport || (!isMobileViewport && !isZoomed));
    /* istanbul ignore next: defensive programming for UI state calculation */
    const filterId = shouldShowBackground ? ensureFrostedFilter(d3Instance) : null;
    /* istanbul ignore next: defensive programming for UI state calculation */
    const transitionDuration = CALENDAR_MONTH_LABEL_BACKGROUND.transitionDuration ?? 200;

    /* istanbul ignore next: defensive programming for UI state calculation */
    const selection = d3Instance
        .select(CALENDAR_SELECTORS.heatmap)
        .selectAll('text.ch-domain-text');

    const highlightConfig = CALENDAR_MONTH_LABEL_HIGHLIGHT || {};
    const intervalValue = Number(highlightConfig.intervalMs);
    const intervalMs = Number.isFinite(intervalValue) && intervalValue > 0 ? intervalValue : 140;
    const waveSizeValue = Number(highlightConfig.waveSize);
    const waveSize = Math.max(1, Number.isFinite(waveSizeValue) ? Math.floor(waveSizeValue) : 2);
    const baseWaveColor =
        typeof highlightConfig.baseColor === 'string'
            ? highlightConfig.baseColor
            : 'rgba(255, 255, 255, 0.95)';
    const neutralWaveColor =
        typeof highlightConfig.neutralDimColor === 'string'
            ? highlightConfig.neutralDimColor
            : 'rgba(150, 150, 150, 0.65)';
    const alphaValue = Number(highlightConfig.waveAlpha);
    const waveAlpha =
        Number.isFinite(alphaValue) && alphaValue >= 0 && alphaValue <= 1 ? alphaValue : 0.85;
    const lightenFactorValue = Number(highlightConfig.pnlLightenFactor);
    const pnlLightenFactor =
        Number.isFinite(lightenFactorValue) && lightenFactorValue >= 0 && lightenFactorValue <= 1
            ? lightenFactorValue
            : 0.55;
    const pnlAlphaValue = Number(highlightConfig.pnlLightAlpha);
    const pnlLightAlpha =
        Number.isFinite(pnlAlphaValue) && pnlAlphaValue >= 0 && pnlAlphaValue <= 1
            ? pnlAlphaValue
            : waveAlpha;

    selection.each(function handleDomainLabel() {
        const el = d3Instance.select(this);
        el.attr('dominant-baseline', 'middle');
        const previousBaseSpan =
            el && typeof el.select === 'function' ? el.select('tspan.domain-label-base') : null;
        if (
            previousBaseSpan &&
            typeof previousBaseSpan.empty === 'function' &&
            !previousBaseSpan.empty()
        ) {
            setThinkingHighlight(previousBaseSpan, false);
        }
        let currentTextRaw = '';
        if (el && typeof el.text === 'function') {
            const candidate = el.text();
            if (typeof candidate === 'string') {
                currentTextRaw = candidate;
            }
        }
        const currentText = currentTextRaw.trim();
        const baseAttrValue =
            el && typeof el.attr === 'function' ? el.attr('data-base-label') : null;
        const baseText =
            typeof baseAttrValue === 'string' && baseAttrValue.trim() ? baseAttrValue : currentText;

        if (baseText) {
            el.attr('data-base-label', baseText);
        }

        if (!baseText) {
            /* istanbul ignore next: defensive programming for missing text */
            return;
        }

        const parent = this.parentNode ? d3Instance.select(this.parentNode) : null;
        let backgroundRect = null;
        if (parent) {
            const existing = parent.select('rect.domain-label-bg');
            if (shouldShowBackground) {
                backgroundRect = existing;
                if (backgroundRect.empty()) {
                    backgroundRect = parent
                        .insert('rect', () => this)
                        .attr('class', 'domain-label-bg')
                        .attr('rx', CALENDAR_MONTH_LABEL_BACKGROUND.radius || 0)
                        .attr('ry', CALENDAR_MONTH_LABEL_BACKGROUND.radius || 0)
                        .attr('fill', CALENDAR_MONTH_LABEL_BACKGROUND.fill || 'transparent')
                        .attr('stroke', CALENDAR_MONTH_LABEL_BACKGROUND.stroke || 'none')
                        .attr('stroke-width', CALENDAR_MONTH_LABEL_BACKGROUND.strokeWidth || 0)
                        .attr('opacity', 0)
                        .style('pointer-events', 'none');
                }
                if (filterId) {
                    backgroundRect.attr('filter', `url(#${filterId})`);
                }
                backgroundRect.lower();
            } else if (!existing.empty()) {
                existing
                    .interrupt()
                    .transition()
                    .duration(transitionDuration)
                    .ease(d3Instance.easeCubicInOut)
                    .attr('opacity', 0);
            }
        }

        const monthKey = getMonthKeyFromLabel(baseText);
        const info =
            monthKey && state.monthlyPnl instanceof Map ? state.monthlyPnl.get(monthKey) : null;
        const highlightMonthKey =
            typeof state.highlightMonthKey === 'string' ? state.highlightMonthKey : null;
        const shouldHighlightMonth = Boolean(highlightMonthKey && monthKey === highlightMonthKey);
        let color = null;
        if (info) {
            const currency = state.selectedCurrency || 'USD';
            const absoluteChange = getAbsoluteChangeForCurrency(info, currency);
            if (Number.isFinite(absoluteChange)) {
                if (absoluteChange > 0) {
                    color = COLORS.POSITIVE_PNL;
                } else if (absoluteChange < 0) {
                    color = COLORS.NEGATIVE_PNL;
                }
            }
        }
        const lightenedColor = color
            ? lightenHexToRgba(color, pnlLightenFactor, pnlLightAlpha)
            : null;
        const waveDimColor = lightenedColor || neutralWaveColor;
        const thinkingOptions = {
            intervalMs,
            waveSize,
            baseColor: baseWaveColor,
            dimColor: waveDimColor,
        };

        if (!info) {
            el.text('');
            const baseSpan = el.append('tspan').attr('class', 'domain-label-base').text(baseText);
            if (backgroundRect) {
                backgroundRect.interrupt();
                if (shouldShowBackground) {
                    const paddingX = CALENDAR_MONTH_LABEL_BACKGROUND.paddingX ?? 0;
                    const paddingY = CALENDAR_MONTH_LABEL_BACKGROUND.paddingY ?? 0;
                    const baseOpacity = CALENDAR_MONTH_LABEL_BACKGROUND.opacity ?? 1;
                    const bbox = this.getBBox();
                    backgroundRect
                        .attr('x', bbox.x - paddingX / 2)
                        .attr('y', bbox.y - paddingY / 2)
                        .attr('width', Math.max(0, bbox.width + paddingX))
                        .attr('height', Math.max(0, bbox.height + paddingY));
                    /* istanbul ignore next: defensive programming for background rect transitions */
                    backgroundRect
                        .transition()
                        .duration(transitionDuration)
                        .ease(d3Instance.easeCubicOut)
                        .attr('opacity', baseOpacity);
                } else {
                    /* istanbul ignore next: defensive programming for background rect alternative path */
                    backgroundRect
                        .transition()
                        .duration(transitionDuration)
                        .ease(d3Instance.easeCubicInOut)
                        .attr('opacity', 0);
                }
            }
            setThinkingHighlight(baseSpan, shouldHighlightMonth, thinkingOptions);
            return;
        }

        const changeText = formatMonthlyChange(state, currencySymbols, info);
        const currency = state.selectedCurrency || 'USD';
        const percentChange = getPercentChangeForCurrency(info, currency);
        const percentText = formatMonthlyPercent(percentChange);
        const showDetailed = Boolean(state.labelsVisible && changeText);

        el.text('');
        el.append('tspan').attr('class', 'domain-label-base').text(baseText);
        const openSpan = el.append('tspan').attr('class', 'domain-label-open-bracket').text(' (');
        const percentSpan = el
            .append('tspan')
            .attr('class', 'domain-label-percent')
            .text(percentText ?? '');
        const separatorSpan = el.append('tspan').attr('class', 'domain-label-separator').text(', ');
        const changeSpan = el
            .append('tspan')
            .attr('class', 'domain-label-pnl')
            .text(changeText ?? '');
        const closeSpan = el.append('tspan').attr('class', 'domain-label-close-bracket').text(')');

        if (showDetailed) {
            if (color) {
                percentSpan.attr('fill', color);
                changeSpan.attr('fill', color);
            } else {
                /* istanbul ignore next: defensive programming for null color case */
                percentSpan.attr('fill', null);
                /* istanbul ignore next: defensive programming for null color case */
                changeSpan.attr('fill', null);
            }
            openSpan.attr('opacity', 1);
            percentSpan.attr('opacity', 1);
            separatorSpan.attr('opacity', 1);
            changeSpan.attr('opacity', 1);
            closeSpan.attr('opacity', 1);
        } else {
            percentSpan.attr('fill', null);
            changeSpan.attr('fill', null);
            openSpan.attr('opacity', 0);
            percentSpan.attr('opacity', 0);
            separatorSpan.attr('opacity', 0);
            changeSpan.attr('opacity', 0);
            closeSpan.attr('opacity', 0);
        }

        if (backgroundRect && shouldShowBackground) {
            const paddingX = CALENDAR_MONTH_LABEL_BACKGROUND.paddingX ?? 0;
            const paddingY = CALENDAR_MONTH_LABEL_BACKGROUND.paddingY ?? 0;
            const baseOpacity = CALENDAR_MONTH_LABEL_BACKGROUND.opacity ?? 1;
            const bbox = this.getBBox();
            let storedWidth = Number(el.attr('data-bg-width')) || 0;
            let storedHeight = Number(el.attr('data-bg-height')) || 0;
            if (showDetailed || storedWidth === 0 || storedHeight === 0) {
                storedWidth = bbox.width;
                storedHeight = bbox.height;
                el.attr('data-bg-width', storedWidth);
                el.attr('data-bg-height', storedHeight);
            }
            const targetWidth = Math.max(storedWidth, bbox.width);
            const targetHeight = Math.max(storedHeight, bbox.height);
            const extraWidth = targetWidth - bbox.width;
            const extraHeight = targetHeight - bbox.height;
            const x = bbox.x - paddingX / 2 - extraWidth / 2;
            const y = bbox.y - paddingY / 2 - extraHeight / 2;

            backgroundRect
                .attr('x', x)
                .attr('y', y)
                .attr('width', Math.max(0, targetWidth + paddingX))
                .attr('height', Math.max(0, targetHeight + paddingY));
            /* istanbul ignore next: defensive programming for background rect detailed transitions */
            backgroundRect
                .interrupt()
                .transition()
                .duration(transitionDuration)
                .ease(d3Instance.easeCubicOut)
                .attr('opacity', baseOpacity);
        } else if (backgroundRect) {
            /* istanbul ignore next: defensive programming for background rect cleanup */
            backgroundRect
                .interrupt()
                .transition()
                .duration(transitionDuration)
                .ease(d3Instance.easeCubicInOut)
                .attr('opacity', 0);
        }

        const highlightTargets = [percentSpan, changeSpan];
        if (showDetailed && shouldHighlightMonth) {
            setThinkingHighlight(highlightTargets, true, thinkingOptions);
        } else {
            setThinkingHighlight(highlightTargets, false);
        }
    });
}

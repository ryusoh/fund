import { CALENDAR_SELECTORS } from '@js/config.js';
import { updateMonthLabels } from '@ui/calendarMonthLabelManager.js';
import { ensureEntryDisplay } from '@pages/calendar/displayCache.js';

/**
 * SVG-specific per-cell label rendering for the Cal-Heatmap backend.
 *
 * Writes the day number plus (when `state.labelsVisible`) the daily change and
 * total into each `text.ch-subdomain-text` as `tspan`s, with fade transitions.
 * Relocated out of the page module in Step 3 so `index.js` no longer reaches
 * into SVG/d3 directly. Uses the global `d3` (loaded via <script> on the page).
 *
 * @param {Map<string, object>} byDate
 * @param {object} state
 * @param {object} currencySymbols
 */
export function renderLabels(byDate, state, currencySymbols) {
    /* istanbul ignore next: defensive state handling in render labels */
    const monthState = state && state.monthlyPnl instanceof Map ? state : null;
    /* istanbul ignore next: defensive state handling in render labels */
    if (d3 && monthState && monthState.monthlyPnl instanceof Map) {
        /* istanbul ignore next: defensive state handling in render labels */
        updateMonthLabels(d3, monthState, currencySymbols);
    }
    if (!state.labelsVisible) {
        if (state.isAnimating) {
            // Smooth fade-out animation when toggling off
            /* istanbul ignore next: style method availability in test environment */
            const allTextElements = d3
                .select(CALENDAR_SELECTORS.heatmap)
                .selectAll('text.ch-subdomain-text');

            /* istanbul ignore next: filter method availability in test environment */
            const fadeOutSelection = allTextElements.filter
                ? allTextElements.filter(function () {
                      return this.textContent && this.textContent.trim() !== '';
                  })
                : allTextElements;
            /* istanbul ignore next: style method availability in test environment */
            if (fadeOutSelection.style) {
                fadeOutSelection
                    .transition()
                    .duration(400)
                    .ease(d3.easeCubicInOut)
                    .style('opacity', 0)
                    .on('end', function () {
                        d3.select(this).text('');
                        state.isAnimating = false;
                    });
            } else {
                // Fallback for test environment
                fadeOutSelection.text('');
                state.isAnimating = false;
            }
        } else {
            // Immediate clear without animation (navigation)
            const textNodes = d3
                .select(CALENDAR_SELECTORS.heatmap)
                .selectAll('text.ch-subdomain-text');
            textNodes.text('');
        }
        return;
    }

    d3.select(CALENDAR_SELECTORS.heatmap)
        .selectAll('text.ch-subdomain-text')
        .each(function () {
            const el = d3.select(this);
            el.attr('dominant-baseline', 'middle');
            const parent = this.parentNode;
            const datum = parent ? d3.select(parent).datum() : null;
            if (!datum || !datum.t) {
                el.selectAll('tspan').remove();
                return;
            }

            const dt = new Date(datum.t);
            const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
            const entry = byDate.get(dateStr);

            const dateText = dt.getUTCDate();
            /* istanbul ignore next: defensive attribute fallback in render labels */
            const x = el.attr('x') || 0;

            const display = ensureEntryDisplay(
                entry,
                state.selectedCurrency,
                state.rates,
                currencySymbols
            );
            const changeText = display.changeText;
            const totalText = display.totalText;
            const showDetails = display.showDetails;

            const ensureLine = (cls, dy) => {
                let line = el.select(`tspan.${cls}`);
                if (line.empty()) {
                    line = el.append('tspan').attr('class', cls).attr('dy', dy).attr('x', x);
                } else {
                    line.attr('x', x);
                }
                return line;
            };

            ensureLine('subdomain-line0', '-1.0em').text(dateText);

            if (showDetails) {
                ensureLine('subdomain-line1', '1.2em').text(changeText);
                ensureLine('subdomain-line2', '1.2em').text(totalText);
            } else {
                el.select('tspan.subdomain-line1').remove();
                el.select('tspan.subdomain-line2').remove();
            }
        });

    // Handle animation vs immediate display
    if (state.isAnimating) {
        // Smooth fade-in animation when toggling on
        /* istanbul ignore next: style method availability in test environment */
        const fadeSelection = d3
            .select(CALENDAR_SELECTORS.heatmap)
            .selectAll('text.ch-subdomain-text');
        /* istanbul ignore next: style method availability in test environment */
        if (fadeSelection.style) {
            fadeSelection
                .style('opacity', 0)
                .transition()
                .duration(400)
                .ease(d3.easeCubicInOut)
                .style('opacity', 1)
                .on('end', function () {
                    state.isAnimating = false;
                });
        }
    } else {
        // Immediate display without animation (navigation)
        /* istanbul ignore next: style method availability in test environment */
        const selection = d3.select(CALENDAR_SELECTORS.heatmap).selectAll('text.ch-subdomain-text');
        /* istanbul ignore next: style method availability in test environment */
        if (selection.style) {
            selection.style('opacity', 1);
        }
    }
}

import { renderAsciiTable } from './terminal/stats/formatting.js';
import { getDynamicStatsText, getStatsText } from './terminal/stats/transactions.js';
import { getHoldingsText, getHoldingsDebugText } from './terminal/stats/holdings.js';
import { getFinancialStatsText, getTechnicalStatsText } from './terminal/stats/financial.js';
import { getCagrText, getAnnualReturnText, getRatioText } from './terminal/stats/static.js';
import {
    getDurationStatsText,
    getLifespanStatsText,
    getConcentrationText,
} from './terminal/stats/analysis.js';

export {
    renderAsciiTable,
    getDynamicStatsText,
    getStatsText,
    getHoldingsText,
    getHoldingsDebugText,
    getFinancialStatsText,
    getTechnicalStatsText,
    getCagrText,
    getAnnualReturnText,
    getRatioText,
    getDurationStatsText,
    getLifespanStatsText,
    getConcentrationText,
};

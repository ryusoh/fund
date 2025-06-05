/**
 * Formats a numeric value as a currency string in the target currency.
 * @param {number} valueInUSD - The value in USD.
 * @param {string} targetCurrency - The target currency code (e.g., 'USD', 'CNY', 'JPY').
 * @param {Object} exchangeRates - An object with currency codes as keys and rates against USD as values.
 * @param {Object} currencySymbols - An object mapping currency codes to their symbols.
 * @returns {string} The formatted currency string.
 */
export function formatCurrency(valueInUSD, targetCurrency, exchangeRates, currencySymbols) {
    const numValueInUSD = parseFloat(valueInUSD);
    if (isNaN(numValueInUSD)) {
        return typeof valueInUSD === 'string' ? valueInUSD : `${currencySymbols[targetCurrency] || '$'}0.00`;
    }

    const rate = exchangeRates[targetCurrency];
    if (typeof rate !== 'number') {
        console.warn(`Exchange rate for ${targetCurrency} not found. Displaying in USD.`);
        return `${currencySymbols['USD'] || '$'}${numValueInUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Work with the absolute value for conversion and formatting
    const absoluteConvertedValue = Math.abs(numValueInUSD * rate);
    const symbol = currencySymbols[targetCurrency] || targetCurrency; // Fallback to code if symbol missing

    // Format the number with locale-specific thousand separators and 2 decimal places.
    const formattedNumber = absoluteConvertedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return `${symbol}${formattedNumber}`;
}

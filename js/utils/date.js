/**
 * Gets the current date in the America/New_York timezone.
 * @returns {Date} The current date in New York.
 */
export function getNyDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

/**
 * Checks if a given date (in NY timezone) is a trading day.
 * Trading days are Monday-Friday, excluding major US holidays.
 * @param {Date} date The date to check (should be in NY timezone).
 * @returns {boolean} True if it's a trading day.
 */
export function isTradingDay(date) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if it's a weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false; // Sunday or Saturday
    }
    
    // TODO: Add major holiday checks here if needed
    // For now, we'll just check weekends
    
    return true; // Monday through Friday
}

/**
 * Gets the current NY date only if it's a trading day, otherwise returns null.
 * @param {Date} [dateOverride] - Optional date to check instead of current NY date
 * @returns {Date|null} The current date in New York if it's a trading day, null otherwise.
 */
export function getTradingDayDate(dateOverride = null) {
    const nyDate = dateOverride || getNyDate();
    return isTradingDay(nyDate) ? nyDate : null;
}
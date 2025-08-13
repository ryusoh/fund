/**
 * Gets the current date in the America/New_York timezone.
 * @returns {Date} The current date in New York.
 */
export function getNyDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}
/**
 * Fetch and display geographic allocation summary with continent/region breakdown
 * @returns {Promise<string>} Formatted geography summary text
 */
export async function getGeographySummaryText() {
    try {
        const response = await fetch('/data/output/figures/geography_summary.txt');
        if (!response.ok) {
            throw new Error(`Failed to fetch geography summary: ${response.status}`);
        }
        return await response.text();
    } catch {
        return 'Error: Unable to load geography summary. Run data generation first.';
    }
}

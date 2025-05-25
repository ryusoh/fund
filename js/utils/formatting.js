export function formatCurrency(value) {
    // Use toLocaleString for currency formatting with commas
    // Ensure the value is a number
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
        return typeof value === 'string' ? value : '$0.00'; // Fallback for non-numeric or keep original string
    }
    return numValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

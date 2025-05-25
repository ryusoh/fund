export function getBlueColorForSlice(index) {
    // A palette of dark grays and near-blacks for a metallic, dark theme.
    // Larger slices (lower index) will get darker blues.
    const metallicDarkPalette = [
        '#2B2B2B', // Very Dark Gray / Near Black
        '#333333', // Dark Gray
        '#4F4F4F', // Medium Dark Gray
        '#606060', // Gray
        '#757575', // Medium Light Gray (Metallic Sheen)
        '#888888', // Light Gray (Metallic Sheen)
        '#A0A0A0', // Lighter Gray
        '#BDBDBD'  // Very Light Gray / Silver
    ];
    
    // Cycle through the palette if there are more items than colors
    return metallicDarkPalette[index % metallicDarkPalette.length];
}

export function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    // 3 digits
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) { // 6 digits
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

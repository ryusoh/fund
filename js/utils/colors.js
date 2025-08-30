import { COLOR_PALETTES } from '@js/config.js';

export function getBlueColorForSlice(index) {
    // Larger slices (lower index) will get darker blues.
    const palette = COLOR_PALETTES.PIE_CHART_SLICE_COLORS;

    // Cycle through the palette if there are more items than colors
    return palette[index % palette.length];
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

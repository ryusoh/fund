import { getBlueColorForSlice, hexToRgba } from '@utils/colors.js';
import { COLOR_PALETTES } from '@js/config.js';

describe('Color Utilities', () => {
    describe('getBlueColorForSlice', () => {
        it('should return a color from the palette', () => {
            const color = getBlueColorForSlice(0);
            expect(COLOR_PALETTES.PIE_CHART_SLICE_COLORS).toContain(color);
        });

        it('should cycle through the palette', () => {
            const index = COLOR_PALETTES.PIE_CHART_SLICE_COLORS.length;
            const color1 = getBlueColorForSlice(0);
            const color2 = getBlueColorForSlice(index);
            expect(color1).toBe(color2);
        });
    });

    describe('hexToRgba', () => {
        it('should convert a 6-digit hex color to rgba', () => {
            const rgba = hexToRgba('#ffffff', 0.5);
            expect(rgba).toBe('rgba(255, 255, 255, 0.5)');
        });

        it('should convert a 3-digit hex color to rgba', () => {
            const rgba = hexToRgba('#fff', 0.5);
            expect(rgba).toBe('rgba(255, 255, 255, 0.5)');
        });

        it('should handle invalid hex codes', () => {
            const rgba = hexToRgba('invalid', 0.5);
            expect(rgba).toBe('rgba(NaN, 10, NaN, 0.5)');
        });

        it('should handle 5-digit hex codes', () => {
            const rgba = hexToRgba('#fffff', 0.5);
            expect(rgba).toBe('rgba(0, 0, 0, 0.5)');
        });
    });
});

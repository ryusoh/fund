import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readRepoFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('terminal mobile legend', () => {
    const css = readRepoFile('css/terminal/chart.css');
    const mobileBlockMatch = css.match(
        /@media[^{]*\(\s*max-width:\s*768px\s*\)[^{]*\{([\s\S]*?)\n\}/
    );

    it('has a mobile media block', () => {
        expect(mobileBlockMatch).not.toBeNull();
    });

    it('places the legend above the chart on mobile', () => {
        const legendRule = mobileBlockMatch[1].match(/\.chart-legend\s*\{[\s\S]*?\}/);
        expect(legendRule).not.toBeNull();
        expect(legendRule[0]).toMatch(/order:\s*-1/);
        expect(legendRule[0]).toMatch(/margin-top:\s*0/);
    });

    it('gives legend items 44px-tall tap targets on mobile', () => {
        const itemRule = mobileBlockMatch[1].match(/\.legend-item\s*\{[\s\S]*?\}/);
        expect(itemRule).not.toBeNull();
        expect(itemRule[0]).toMatch(/min-height:\s*44px/);
    });
});

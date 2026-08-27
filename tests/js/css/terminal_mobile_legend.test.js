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

    it('hides the chart legend on mobile', () => {
        const legendRule = mobileBlockMatch[1].match(/\.chart-legend\s*\{[\s\S]*?\}/);
        expect(legendRule).not.toBeNull();
        expect(legendRule[0]).toMatch(/display:\s*none\s*!important/);
    });
});

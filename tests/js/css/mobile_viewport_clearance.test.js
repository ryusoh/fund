import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readRepoFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('mobile viewport vertical clearance', () => {
    it('guarantees position pie chart clears top docks and footer', () => {
        const css = readRepoFile('css/layout.css');
        expect(css).toMatch(/#fundPieChartContainer\s*\{[\s\S]*?margin:\s*calc\(\s*85px/);
        expect(css).toMatch(
            /#fundPieChartContainer\s*\{[\s\S]*?max-height:\s*min\([\s\S]*?calc\(100dvh - 170px\)/
        );
    });

    it('guarantees calendar wrapper clears top docks and footer', () => {
        const css = readRepoFile('css/calendar.css');
        expect(css).toMatch(
            /\.body-calendar\s+\.page-center-wrapper\s*\{[\s\S]*?margin:\s*calc\(\s*85px/
        );
        expect(css).toMatch(
            /\.body-calendar\s+\.page-center-wrapper\s*\{[\s\S]*?max-height:\s*calc\([\s\S]*?100dvh - 150px/
        );
    });

    it('guarantees terminal container clears top docks and footer', () => {
        const css = readRepoFile('css/terminal/responsive.css');
        expect(css).toMatch(/\.transaction-container\s*\{[\s\S]*?margin-top:\s*calc\(\s*75px/);
        expect(css).toMatch(
            /\.transaction-container\s*\{[\s\S]*?height:\s*calc\([\s\S]*?100dvh - 140px/
        );
    });
});

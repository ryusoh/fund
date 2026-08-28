import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readRepoFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('Position page pie chart stability & table mobile bounds (TDD)', () => {
    const layoutCss = readRepoFile('css/layout.css');

    it('ensures pie chart has a stable single full size and position on mobile regardless of table state', () => {
        // Must have stable mobile margin and full sizing on #fundPieChartContainer
        expect(layoutCss).toMatch(
            /#fundPieChartContainer\s*\{[\s\S]*?margin:\s*calc\(\s*75px\s*\+\s*env\(safe-area-inset-top,\s*0px\)\)\s*auto\s*10px/
        );
        expect(layoutCss).toMatch(
            /#fundPieChartContainer\s*\{[\s\S]*?max-width:\s*min\(90vw,\s*360px\)/
        );
        expect(layoutCss).toMatch(
            /#fundPieChartContainer\s*\{[\s\S]*?max-height:\s*min\(90vw,\s*360px\)/
        );

        // Must NOT mutate pie chart size or margin when table is active
        expect(layoutCss).not.toMatch(/body\.position-table-active\s+#fundPieChartContainer/);
        expect(layoutCss).not.toMatch(
            /body:has\(\.content-block:not\(\.hidden\)\)\s+#fundPieChartContainer/
        );
    });

    it('ensures holdings table is bounded within viewport and clears footer on mobile', () => {
        // Table container must have max-height clamped to fit below chart (top ~325px) and above footer (bottom ~55px)
        expect(layoutCss).toMatch(
            /\.table-responsive-container\s*\{[\s\S]*?max-height:\s*calc\([\s\S]*?100dvh\s*-\s*390px/
        );
        // Table must have smooth momentum vertical scrolling
        expect(layoutCss).toMatch(/\.table-responsive-container\s*\{[\s\S]*?overflow-y:\s*auto/);
        // Table margin and width must align with currency toggle (left 15px) and nav container (right 15px)
        expect(layoutCss).toMatch(
            /\.content-block\s*\{[\s\S]*?margin-left:\s*calc\(15px\s*\+\s*env\(safe-area-inset-left,\s*0px\)\)/
        );
        expect(layoutCss).toMatch(
            /\.content-block\s*\{[\s\S]*?margin-right:\s*calc\(15px\s*\+\s*env\(safe-area-inset-right,\s*0px\)\)/
        );
        expect(layoutCss).toMatch(
            /\.content-block\s*\{[\s\S]*?width:\s*calc\([\s\S]*?100%\s*-\s*30px/
        );
    });
});

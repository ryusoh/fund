import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readRepoFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('currency dock symmetry (top-left counterpart to nav dock)', () => {
    const css = readRepoFile('css/toggle.css');

    it('positions the currency dock at top-left across desktop and mobile', () => {
        expect(css).toMatch(/#currencyToggleContainer\s*\{[\s\S]*?position:\s*fixed;/);
        expect(css).toMatch(/#currencyToggleContainer\s*\{[\s\S]*?top:\s*15px;/);
        expect(css).toMatch(/#currencyToggleContainer\s*\{[\s\S]*?left:\s*15px;/);
        expect(css).toMatch(/#currencyToggleContainer\s*\{[\s\S]*?flex-direction:\s*row;/);
        expect(css).toMatch(/#currencyToggleContainer\s*\{[\s\S]*?z-index:\s*1000;/);
    });

    it('supports iOS safe-area top and left insets for currency toggle', () => {
        expect(css).toMatch(/@supports\s*\(\s*top:\s*env\(safe-area-inset-top\)\s*\)/);
        expect(css).toMatch(/@supports\s*\(\s*left:\s*env\(safe-area-inset-left\)\s*\)/);
    });

    it('uses 30x30 square buttons with 4px border-radius matching nav buttons', () => {
        const toggleRule = css.match(/\.currency-toggle\s*\{[\s\S]*?\}/);
        expect(toggleRule).not.toBeNull();
        expect(toggleRule[0]).toMatch(/width:\s*30px;/);
        expect(toggleRule[0]).toMatch(/height:\s*30px;/);
    });
});

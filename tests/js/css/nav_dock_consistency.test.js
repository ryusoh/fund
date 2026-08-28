import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readRepoFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('nav dock consistency (matching ryusoh.github.io)', () => {
    const css = readRepoFile('css/container.css');

    it('positions the nav dock at top-right by default', () => {
        expect(css).toMatch(/\.container,\s*\.nav-container\s*\{[\s\S]*?position:\s*fixed;/);
        expect(css).toMatch(/\.container,\s*\.nav-container\s*\{[\s\S]*?top:\s*15px;/);
        expect(css).toMatch(/\.container,\s*\.nav-container\s*\{[\s\S]*?right:\s*15px;/);
        expect(css).toMatch(/\.container,\s*\.nav-container\s*\{[\s\S]*?z-index:\s*1000;/);
    });

    it('supports iOS safe-area top and right insets', () => {
        expect(css).toMatch(/@supports\s*\(\s*top:\s*env\(safe-area-inset-top\)\s*\)/);
        expect(css).toMatch(/@supports\s*\(\s*right:\s*env\(safe-area-inset-right\)\s*\)/);
    });

    it('uses 30x30 square buttons with 4px border-radius', () => {
        const linkRuleMatch = css.match(/\.container\s+a,\s*\.nav-container\s+a\s*\{[\s\S]*?\}/);
        expect(linkRuleMatch).not.toBeNull();
        expect(linkRuleMatch[0]).toMatch(/width:\s*30px;/);
        expect(linkRuleMatch[0]).toMatch(/height:\s*30px;/);
        expect(linkRuleMatch[0]).toMatch(/border-radius:\s*4px;/);
    });

    it('does not force ceiling center or body top padding on mobile', () => {
        const mobileBlockMatch = css.match(
            /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\}/
        );
        expect(mobileBlockMatch).not.toBeNull();
        expect(mobileBlockMatch[1]).not.toMatch(/translateX\(-50%\)/);
        expect(mobileBlockMatch[1]).not.toMatch(/padding-top:\s*64px/);
    });
});

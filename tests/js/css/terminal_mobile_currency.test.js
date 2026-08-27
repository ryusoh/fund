import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readRepoFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('terminal mobile currency switcher', () => {
    it('is not hidden on mobile', () => {
        const html = readRepoFile('terminal/index.html');
        const containerMatch = html.match(/<div id="currencyToggleContainer"[^>]*>/);
        expect(containerMatch).not.toBeNull();
        expect(containerMatch[0]).not.toMatch(/hide-on-mobile/);

        const baseCss = readRepoFile('css/terminal/base.css');
        expect(baseCss).not.toMatch(
            /\.body-terminal\s+#currencyToggleContainer\s*\{\s*display:\s*none/
        );
    });

    it('has 44px touch targets on mobile', () => {
        const responsiveCss = readRepoFile('css/terminal/responsive.css');
        const ruleMatch = responsiveCss.match(/\.body-terminal\s+\.currency-toggle\s*\{[\s\S]*?\}/);
        expect(ruleMatch).not.toBeNull();
        expect(ruleMatch[0]).toMatch(/width:\s*44px/);
        expect(ruleMatch[0]).toMatch(/height:\s*44px/);
    });

    it('restates the mobile vertical centering at winning specificity', () => {
        // base.css `.body-terminal #currencyToggleContainer { top: 15px }` (id+class)
        // outranks toggle.css's mobile `top: 50%` (plain id); responsive.css must
        // restate it inside the mobile block.
        const responsiveCss = readRepoFile('css/terminal/responsive.css');
        const mobileBlockMatch = responsiveCss.match(
            /@media[^{]*\(\s*max-width:\s*768px\s*\)[^{]*\{([\s\S]*)\}(?=\s*@media|\s*$)/
        );
        expect(mobileBlockMatch).not.toBeNull();
        const ruleMatch = mobileBlockMatch[1].match(
            /\.body-terminal\s+#currencyToggleContainer\s*\{[\s\S]*?\}/
        );
        expect(ruleMatch).not.toBeNull();
        expect(ruleMatch[0]).toMatch(/top:\s*50%/);
    });
});

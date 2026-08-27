import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readRepoFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('terminal mobile currency switcher', () => {
    it('is hidden on mobile in responsive css', () => {
        const responsiveCss = readRepoFile('css/terminal/responsive.css');
        const mobileBlockMatch = responsiveCss.match(
            /@media[^{]*\(\s*max-width:\s*768px\s*\)[^{]*\{([\s\S]*)\}(?=\s*@media|\s*$)/
        );
        expect(mobileBlockMatch).not.toBeNull();
        const ruleMatch = mobileBlockMatch[1].match(
            /\.body-terminal\s+#currencyToggleContainer\s*\{[\s\S]*?\}/
        );
        expect(ruleMatch).not.toBeNull();
        expect(ruleMatch[0]).toMatch(/display:\s*none\s*!important/);
    });
});

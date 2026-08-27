import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readCssFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('terminal mobile background', () => {
    it('covers the full dynamic viewport height', () => {
        const css = readCssFile('css/terminal/responsive.css');
        const mobileBodyMatch = css.match(
            /@media[^{]*\(\s*max-width:\s*768px\s*\)[^{]*\{[\s\S]*?body\s*\{[\s\S]*?\}/i
        );
        expect(mobileBodyMatch).not.toBeNull();
        const bodyBlock = mobileBodyMatch[0];
        expect(bodyBlock).toMatch(/min-height:\s*100dvh/);
    });
});

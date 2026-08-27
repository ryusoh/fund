import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT_DIR = resolve(process.cwd());
const readCssFile = (relativePath) => readFileSync(join(ROOT_DIR, relativePath), 'utf-8');

describe('terminal mobile background', () => {
    it('covers the full dynamic viewport height', () => {
        const css = readCssFile('css/terminal/responsive.css');
        const mobileBlockMatch = css.match(
            /@media[^{]*\(\s*max-width:\s*768px\s*\)[^{]*\{([\s\S]*?body\s*\{[\s\S]*?\}[\s\S]*?)\}(?=\s*@media|\s*$)/i
        );
        expect(mobileBlockMatch).not.toBeNull();
        const mobileBlock = mobileBlockMatch[1];

        const htmlBlockMatch = mobileBlock.match(/html\s*\{[\s\S]*?\}/);
        expect(htmlBlockMatch).not.toBeNull();
        expect(htmlBlockMatch[0]).toMatch(/overflow:\s*visible/);

        const bodyBlockMatch = mobileBlock.match(/body\s*\{[\s\S]*?\}/);
        expect(bodyBlockMatch).not.toBeNull();
        expect(bodyBlockMatch[0]).toMatch(/position:\s*fixed/);
        expect(bodyBlockMatch[0]).toMatch(/top:\s*0/);
        expect(bodyBlockMatch[0]).toMatch(/bottom:\s*0/);
        expect(bodyBlockMatch[0]).toMatch(/left:\s*0/);
        expect(bodyBlockMatch[0]).toMatch(/right:\s*0/);

        const pseudoMatch = mobileBlock.match(/body::before,\s*body::after\s*\{[\s\S]*?\}/);
        expect(pseudoMatch).not.toBeNull();
        expect(pseudoMatch[0]).toMatch(/display:\s*none/);
    });
});

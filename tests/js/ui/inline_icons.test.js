/* global DOMParser, __dirname, Buffer */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const PAGES = ['index.html', 'position/index.html', 'calendar/index.html', 'terminal/index.html'];
const CSS_FILES = ['css/base.css', 'css/terminal/base.css'];
const ICON_UNICODE = {
    calendar: 'f073',
    'chevron-left': 'f053',
    'chevron-right': 'f054',
    'circle-o': 'f10c',
    cny: 'f157',
    code: 'f121',
    filter: 'f0b0',
    github: 'f09b',
    jpy: 'f157',
    krw: 'f159',
    'pie-chart': 'f200',
    usd: 'f155',
};

const readEmbeddedFont = (css) => {
    const match = css.match(
        /font-family:\s*'FundIcons';[\s\S]*?url\((['"])data:font\/woff;base64,([^'"]+)\1\)\s*format\((['"])woff\3\)/
    );
    expect(match).not.toBeNull();
    return Buffer.from(match[2], 'base64');
};

describe('embedded navigation icons', () => {
    test.each(CSS_FILES)('%s embeds a small WOFF subset and all used glyphs', (file) => {
        const css = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
        const font = readEmbeddedFont(css);

        expect(font.subarray(0, 4).toString('ascii')).toBe('wOFF');
        expect(font.length).toBeLessThan(4096);
        expect(css).not.toMatch(/url\(['"]?(?!data:)[^)]*fontawesome/i);

        Object.entries(ICON_UNICODE).forEach(([name, unicode]) => {
            const rule = new RegExp(
                `\\.fa-${name}::before\\s*\\{\\s*content:\\s*['"]\\\\${unicode}['"];`
            );
            expect(css).toMatch(rule);
        });
    });

    test('both stylesheets embed the identical subset', () => {
        const fonts = CSS_FILES.map((file) =>
            readEmbeddedFont(fs.readFileSync(path.join(ROOT_DIR, file), 'utf8'))
        );
        expect(fonts[0].equals(fonts[1])).toBe(true);
    });

    test.each(PAGES)('%s uses smoothed font glyphs without icon-font requests', (page) => {
        const html = fs.readFileSync(path.join(ROOT_DIR, page), 'utf8');
        const document = new DOMParser().parseFromString(html, 'text/html');
        expect(document.querySelector('link[href*="font-awesome"]')).toBeNull();
        expect(document.querySelector('link[href*="fontawesome-webfont"]')).toBeNull();
        expect(document.querySelector('script[src*="icon_font_ready"]')).toBeNull();
        expect(document.querySelector('.icon-sprite')).toBeNull();

        const icons = Array.from(document.querySelectorAll('.fa'));
        expect(icons.length).toBeGreaterThan(0);
        icons.forEach((icon) => {
            expect(icon.tagName.toLowerCase()).toBe('i');
            expect(icon.getAttribute('aria-hidden')).toBe('true');
            expect(
                Array.from(icon.classList).some((name) =>
                    Object.prototype.hasOwnProperty.call(ICON_UNICODE, name.slice(3))
                )
            ).toBe(true);
        });
    });
});

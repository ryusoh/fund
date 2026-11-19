/* global DOMParser, __dirname */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const PAGES = ['index.html', 'position/index.html', 'calendar/index.html', 'terminal/index.html'];
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
const normalizePath = (value) => value.replace(/\s+/g, ' ').trim();
const readFontSvg = () =>
    fs.readFileSync(path.join(ROOT_DIR, 'assets/vendor/fonts/fontawesome-webfont.svg'), 'utf8');
const expectOriginalGeometry = (symbol, name, fontSvg) => {
    expect(symbol).not.toBeNull();
    const glyphTag = fontSvg.match(
        new RegExp(`<glyph[^>]*unicode="&#x${ICON_UNICODE[name]};"[^>]*>`)
    );
    expect(glyphTag).not.toBeNull();
    const expectedPath = glyphTag[0].match(/\bd="([^"]+)"/)[1];
    expect(normalizePath(symbol.querySelector('path').getAttribute('d'))).toBe(
        normalizePath(expectedPath)
    );
};

describe('inline navigation icons', () => {
    test.each(PAGES)(
        '%s uses original Font Awesome geometry without icon-font requests',
        (page) => {
            const html = fs.readFileSync(path.join(ROOT_DIR, page), 'utf8');
            const document = new DOMParser().parseFromString(html, 'text/html');
            expect(document.querySelector('link[href*="font-awesome"]')).toBeNull();
            expect(document.querySelector('link[href*="fontawesome-webfont"]')).toBeNull();
            expect(document.querySelector('script[src*="icon_font_ready"]')).toBeNull();

            const icons = Array.from(document.querySelectorAll('.fa'));
            expect(icons.length).toBeGreaterThan(0);
            const fontSvg = readFontSvg();

            icons.forEach((icon) => {
                expect(icon.tagName.toLowerCase()).toBe('svg');
                const iconName = Array.from(icon.classList).find((name) => name.startsWith('fa-'));
                const name = iconName.slice(3);
                expect(icon.getAttribute('aria-hidden')).toBe('true');
                expect(icon.getAttribute('focusable')).toBe('false');
                expect(icon.querySelector('use').getAttribute('href')).toBe(`#icon-${name}`);
                expectOriginalGeometry(document.getElementById(`icon-${name}`), name, fontSvg);
            });
        }
    );

    test.each(['calendar/index.html', 'terminal/index.html'])(
        '%s defines original glyphs for dynamic currency icons',
        (page) => {
            const html = fs.readFileSync(path.join(ROOT_DIR, page), 'utf8');
            const document = new DOMParser().parseFromString(html, 'text/html');
            const fontSvg = readFontSvg();
            ['usd', 'cny', 'jpy', 'krw'].forEach((name) => {
                expectOriginalGeometry(document.getElementById(`icon-${name}`), name, fontSvg);
            });
        }
    );
});

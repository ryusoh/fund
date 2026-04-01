describe('nav_current_page', () => {
    beforeEach(() => {
        // Reset the DOM
        document.body.innerHTML = '';

        // Reset modules
        jest.resetModules();
    });

    const setupLocation = (pathname) => {
        // Mock the window.location and JSDOM's baseURI handling by leveraging pushState
        window.history.pushState({}, '', pathname);
    };

    const loadNavCurrentPage = () => {
        require('../../../js/ui/nav_current_page.js');
    };

    const createContainer = (html) => {
        document.body.innerHTML = html;
        // JSDOM has an issue where link.href returns relative paths without base URL applied.
        // It returns `"http://localhost/..."` only if the JSDOM URL is configured correctly before setting innerHTML.
        // Since jest default env sets URL to "http://localhost/", this should work naturally
        // as long as the location matches. If `window.location.origin` fails, let's explicitly provide it:

        // Ensure hrefs properly simulate browser behavior relative to "http://localhost"
        document.querySelectorAll('a').forEach((a) => {
            const raw = a.getAttribute('href');
            if (raw && raw.startsWith('/')) {
                Object.defineProperty(a, 'href', {
                    get: () => {
                        return a.hasAttribute('href')
                            ? `http://localhost${a.getAttribute('href')}`
                            : '';
                    },
                    configurable: true,
                });
            }
        });
    };

    test('disables link matching current page exact path', () => {
        setupLocation('/about');
        createContainer(`
            <div class="nav-container">
                <a href="/about" id="about-link">About</a>
                <a href="/contact" id="contact-link">Contact</a>
            </div>
        `);

        loadNavCurrentPage();

        const aboutLink = document.getElementById('about-link');
        const contactLink = document.getElementById('contact-link');

        // Check about link (should be disabled)
        expect(aboutLink.hasAttribute('href')).toBe(false);
        expect(aboutLink.style.pointerEvents).toBe('none');
        expect(aboutLink.style.cursor).toBe('default');
        expect(aboutLink.getAttribute('aria-current')).toBe('page');
        expect(aboutLink.parentElement.classList.contains('is-current-page')).toBe(true);

        // Check contact link (should be normal)
        expect(contactLink.hasAttribute('href')).toBe(true);
        expect(contactLink.style.pointerEvents).not.toBe('none');
    });

    test('handles index.html resolution', () => {
        setupLocation('/');
        createContainer(`
            <div class="container">
                <a href="/index.html" id="home-link">Home</a>
                <a href="/about.html" id="about-link">About</a>
            </div>
        `);

        loadNavCurrentPage();

        const homeLink = document.getElementById('home-link');

        expect(homeLink.hasAttribute('href')).toBe(false);
        expect(homeLink.getAttribute('aria-current')).toBe('page');
    });

    test('handles trailing slash normalization', () => {
        setupLocation('/analysis/');
        createContainer(`
            <div class="nav-container">
                <a href="/analysis" id="analysis-link">Analysis</a>
            </div>
        `);

        loadNavCurrentPage();

        const analysisLink = document.getElementById('analysis-link');

        expect(analysisLink.hasAttribute('href')).toBe(false);
        expect(analysisLink.getAttribute('aria-current')).toBe('page');
    });

    test('handles path variations of index.html', () => {
        setupLocation('/analysis/index.html');
        createContainer(`
            <div class="nav-container">
                <a href="/analysis/" id="analysis-link">Analysis</a>
            </div>
        `);

        loadNavCurrentPage();

        const analysisLink = document.getElementById('analysis-link');

        expect(analysisLink.hasAttribute('href')).toBe(false);
        expect(analysisLink.getAttribute('aria-current')).toBe('page');
    });

    test('handles variations when one of them is empty root', () => {
        setupLocation('/index.html');
        createContainer(`
            <div class="nav-container">
                <a href="/" id="home-link">Home</a>
            </div>
        `);

        loadNavCurrentPage();

        const homeLink = document.getElementById('home-link');

        expect(homeLink.hasAttribute('href')).toBe(false);
        expect(homeLink.getAttribute('aria-current')).toBe('page');
    });

    test('ignores links from different origins', () => {
        setupLocation('/about');
        createContainer(`
            <div class="nav-container">
                <a href="https://external.com/about" id="external-link">External</a>
            </div>
        `);

        loadNavCurrentPage();

        const externalLink = document.getElementById('external-link');

        expect(externalLink.hasAttribute('href')).toBe(true);
        expect(externalLink.getAttribute('href')).toBe('https://external.com/about');
        expect(externalLink.style.pointerEvents).not.toBe('none');
    });

    test('handles links without parent elements safely', () => {
        setupLocation('/orphan');

        // Use a detached container so that querySelectorAll can find it
        // if we mock document.querySelectorAll. Wait, `document.querySelectorAll`
        // searches the DOM tree. If it's in the DOM tree, it has a parent.
        // Let's mock document.querySelectorAll directly.

        const orphanLink = document.createElement('a');
        orphanLink.href = '/orphan';

        // By redefining href, `new URL(link.href, ...)` in nav_current_page.js gets the correct string
        Object.defineProperty(orphanLink, 'href', {
            get: () => {
                return orphanLink.hasAttribute('href')
                    ? `http://localhost${orphanLink.getAttribute('href')}`
                    : '';
            },
            configurable: true,
        });

        // Ensure parentElement is null
        expect(orphanLink.parentElement).toBeNull();

        const originalQuerySelectorAll = document.querySelectorAll;
        document.querySelectorAll = jest.fn(() => [orphanLink]);

        loadNavCurrentPage();

        expect(orphanLink.hasAttribute('href')).toBe(false);
        expect(orphanLink.style.pointerEvents).toBe('none');
        expect(orphanLink.getAttribute('aria-current')).toBe('page');

        // Restore
        document.querySelectorAll = originalQuerySelectorAll;
    });

    test('adds ready listener if document.readyState is loading', () => {
        setupLocation('/test');

        const originalReadyState = document.readyState;
        Object.defineProperty(document, 'readyState', {
            value: 'loading',
            writable: true,
            configurable: true,
        });

        createContainer(`
            <div class="nav-container">
                <a href="/test" id="test-link">Test</a>
            </div>
        `);

        loadNavCurrentPage();

        const testLink = document.getElementById('test-link');
        // Because it waits for DOMContentLoaded, it shouldn't be processed yet
        expect(testLink.hasAttribute('href')).toBe(true);

        // Trigger DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(testLink.hasAttribute('href')).toBe(false);
        expect(testLink.getAttribute('aria-current')).toBe('page');

        Object.defineProperty(document, 'readyState', {
            value: originalReadyState,
            writable: true,
            configurable: true,
        });
    });
});

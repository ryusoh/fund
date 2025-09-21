/**
 * Prevent self-redirecting links on navigation
 * Disables links that point to the current page
 */
(function () {
    'use strict';

    function disableCurrentPageLinks() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.container a');

        navLinks.forEach((link) => {
            const linkPath = new window.URL(link.href, window.location.origin).pathname;

            // Normalize paths for comparison
            const normalizedCurrent = currentPath.replace(/\/$/, '') || '/';
            const normalizedLink = linkPath.replace(/\/$/, '') || '/';

            // Handle different path formats
            if (
                normalizedCurrent === normalizedLink ||
                (normalizedCurrent.endsWith('/index.html') &&
                    normalizedLink === normalizedCurrent.replace('/index.html', '')) ||
                (normalizedLink.endsWith('/index.html') &&
                    normalizedCurrent === normalizedLink.replace('/index.html', '')) ||
                (normalizedCurrent === '/' && normalizedLink === '/index.html') ||
                (normalizedCurrent === '/index.html' && normalizedLink === '/')
            ) {
                // Disable the link
                link.style.opacity = '0.3';
                link.style.pointerEvents = 'none';
                link.style.cursor = 'default';
                link.removeAttribute('href');

                // Add visual indicator for current page
                link.parentElement.style.borderLeft = '3px solid rgba(255, 255, 255, 0.6)';
                link.parentElement.style.paddingLeft = '10px';
            }
        });
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', disableCurrentPageLinks);
    } else {
        disableCurrentPageLinks();
    }
})();

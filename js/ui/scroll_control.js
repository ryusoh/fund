(function() {
    let lastScrollTop = 0;

    window.addEventListener('scroll', function() {
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        // If scrolling up and at the very top of the page
        if (scrollTop < lastScrollTop && scrollTop === 0) {
            // Prevent default scroll behavior
            window.scrollTo(0, 0);
        }
        lastScrollTop = scrollTop;
    });

    // For touch devices, to prevent overscroll bounce when scrolling up from the top
    // This might interfere with native pull-to-refresh if not handled carefully.
    // Given the user wants to prevent scrolling up, this is a necessary evil.
    let startY;

    document.addEventListener('touchstart', function(e) {
        startY = e.touches[0].clientY;
    });

    document.addEventListener('touchmove', function(e) {
        let currentY = e.touches[0].clientY;
        let deltaY = currentY - startY;

        // If trying to scroll page up (swiping finger up)
        if (deltaY < 0) {
            e.preventDefault(); // Prevent default touchmove behavior to disallow moving the page up
        }
        // If at the top and pulling down (deltaY > 0), allow default behavior (pull-to-refresh)
        // No 'else if' or 'else' needed here, as we only prevent specific cases.
    }, { passive: false }); // Use passive: false to allow preventDefault
})();
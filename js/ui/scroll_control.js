(function () {
    let lastScrollTop = 0;

    window.addEventListener('scroll', function () {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

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

    document.addEventListener('touchstart', function (e) {
        startY = e.touches[0].clientY;
    });

    document.addEventListener(
        'touchmove',
        function (e) {
            const currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;

            // If trying to scroll page up (swiping finger up)
            if (deltaY < 0) {
                e.preventDefault(); // Prevent default touchmove behavior to disallow moving the page up
            }
            // If at the top and pulling down (deltaY > 0), allow default behavior (pull-to-refresh)
            // No 'else if' or 'else' needed here, as we only prevent specific cases.
        },
        { passive: false }
    ); // Use passive: false to allow preventDefault
})();

// Add to scroll_control.js to shift themes
window.addEventListener('scroll', function () {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    if (scrollY > 100) {
        document.body.setAttribute('data-theme', 'scrolled');
    } else {
        document.body.removeAttribute('data-theme');
    }
});

// Add scroll-linked marquee effect
window.addEventListener('scroll', function () {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    const leftMarquees = document.querySelectorAll('.marquee-left');
    const rightMarquees = document.querySelectorAll('.marquee-right');

    // Add translation based on scroll position to the existing transform
    leftMarquees.forEach((el) => {
        el.style.transform = `perspective(1000px) rotate(-3deg) scale(1.1) translateX(${scrollY * -0.5}px)`;
    });

    rightMarquees.forEach((el) => {
        el.style.transform = `perspective(1000px) rotate(3deg) scale(1.1) translateX(${scrollY * 0.5}px)`;
    });
});

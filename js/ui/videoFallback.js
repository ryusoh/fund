/**
 * Video playback fallback handler for iOS web apps
 * Gracefully falls back to static poster image when autoplay fails
 */

export function initVideoFallback() {
    const videoContainer = document.querySelector('.video-background');
    const video = videoContainer?.querySelector('video');

    if (!video || !videoContainer) {
        return;
    }

    // Get fallback image from poster attribute
    const fallbackImage = video.poster || './assets/mobile_bg.jpg';

    // Set up fallback function
    const fallbackToStaticImage = () => {
        // Hide video element
        video.style.display = 'none';

        // Apply static background to container
        videoContainer.style.backgroundImage = `url(${fallbackImage})`;
        videoContainer.style.backgroundSize = 'cover';
        videoContainer.style.backgroundPosition = 'center center';
        videoContainer.style.backgroundRepeat = 'no-repeat';
    };

    // Try to play video with timeout fallback
    const playPromise = video.play();

    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                // Video playing successfully
            })
            .catch(() => {
                // Autoplay failed, use fallback
                fallbackToStaticImage();
            });
    } else {
        // Older browsers without play() promise support
        // Set up event listeners for fallback
        video.addEventListener('loadstart', () => {
            // Give video a chance to start playing
            setTimeout(() => {
                if (video.paused || video.ended) {
                    fallbackToStaticImage();
                }
            }, 1000);
        });
    }

    // Additional fallback: if video fails to load
    video.addEventListener('error', fallbackToStaticImage);

    // Fallback for network issues
    video.addEventListener('stalled', () => {
        setTimeout(() => {
            if (video.paused || video.ended) {
                fallbackToStaticImage();
            }
        }, 2000);
    });
}

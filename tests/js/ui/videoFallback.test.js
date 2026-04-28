import { initVideoFallback } from '@ui/videoFallback.js';

describe('videoFallback.js', () => {
    let container;
    let video;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = `
            <div class="video-background">
                <video poster="custom_poster.jpg"></video>
            </div>
        `;
        container = document.querySelector('.video-background');
        video = container.querySelector('video');

        jest.useFakeTimers();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('does nothing if video container is missing', () => {
        document.body.innerHTML = '';
        expect(() => initVideoFallback()).not.toThrow();
    });

    test('does nothing if video element is missing inside container', () => {
        document.body.innerHTML = '<div class="video-background"></div>';
        expect(() => initVideoFallback()).not.toThrow();
    });

    test('uses fallback image from poster when play promise rejects', async () => {
        const playPromise = Promise.reject(new Error('Autoplay prevented'));

        // Disable fake timers temporarily for async resolution
        jest.useRealTimers();

        video.play = jest.fn().mockReturnValue(playPromise);

        initVideoFallback();

        // Wait for the rejection to be handled (flush microtasks)
        try {
            await playPromise;
        } catch (err) {
            console.warn('Caught expected error in test:', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(video.style.display).toBe('none');
        expect(container.style.backgroundImage).toContain('custom_poster.jpg');
        expect(container.style.backgroundSize).toBe('cover');
        expect(container.style.backgroundPosition).toBe('center center');
        expect(container.style.backgroundRepeat).toBe('no-repeat');

        // Restore fake timers
        jest.useFakeTimers();
    });

    test('uses default fallback image if poster is not specified', async () => {
        video.removeAttribute('poster');
        const playPromise = Promise.reject(new Error('Autoplay prevented'));

        jest.useRealTimers();

        video.play = jest.fn().mockReturnValue(playPromise);

        initVideoFallback();
        try {
            await playPromise;
        } catch (err) {
            console.warn('Caught expected error in test:', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(container.style.backgroundImage).toContain('mobile_bg.jpg');

        jest.useFakeTimers();
    });

    test('handles older browsers without play() promise support via loadstart', () => {
        video.play = jest.fn().mockReturnValue(undefined); // Simulate old browser

        initVideoFallback();

        // Trigger loadstart
        const loadstartEvent = new Event('loadstart');
        video.dispatchEvent(loadstartEvent);

        // Simulate video not playing (paused = true)
        Object.defineProperty(video, 'paused', { value: true, configurable: true });

        // Advance timers by 1000ms
        jest.advanceTimersByTime(1000);

        expect(video.style.display).toBe('none');
        expect(container.style.backgroundImage).toContain('custom_poster.jpg');
    });

    test('does not apply fallback in older browsers if video is playing', () => {
        video.play = jest.fn().mockReturnValue(undefined);
        initVideoFallback();

        video.dispatchEvent(new Event('loadstart'));

        // Simulate video playing (paused = false, ended = false)
        Object.defineProperty(video, 'paused', { value: false, configurable: true });
        Object.defineProperty(video, 'ended', { value: false, configurable: true });

        jest.advanceTimersByTime(1000);

        expect(video.style.display).not.toBe('none');
        expect(container.style.backgroundImage).toBe('');
    });

    test('applies fallback on video error event', () => {
        video.play = jest.fn().mockReturnValue(Promise.resolve());
        initVideoFallback();

        video.dispatchEvent(new Event('error'));

        expect(video.style.display).toBe('none');
        expect(container.style.backgroundImage).toContain('custom_poster.jpg');
    });

    test('applies fallback on video stalled event if video is paused', () => {
        video.play = jest.fn().mockReturnValue(Promise.resolve());
        initVideoFallback();

        video.dispatchEvent(new Event('stalled'));

        // Simulate video being paused
        Object.defineProperty(video, 'paused', { value: true, configurable: true });

        jest.advanceTimersByTime(2000);

        expect(video.style.display).toBe('none');
        expect(container.style.backgroundImage).toContain('custom_poster.jpg');
    });

    test('does not apply fallback on stalled event if video is still playing', () => {
        video.play = jest.fn().mockReturnValue(Promise.resolve());
        initVideoFallback();

        video.dispatchEvent(new Event('stalled'));

        // Simulate video still playing
        Object.defineProperty(video, 'paused', { value: false, configurable: true });
        Object.defineProperty(video, 'ended', { value: false, configurable: true });

        jest.advanceTimersByTime(2000);

        expect(video.style.display).not.toBe('none');
        expect(container.style.backgroundImage).toBe('');
    });
});

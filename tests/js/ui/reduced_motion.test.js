describe('reduced_motion.js', () => {
    const SCRIPT_PATH = '@ui/reduced_motion.js';

    beforeEach(() => {
        document.body.innerHTML = '';
        jest.resetModules();
        delete global.matchMedia;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete global.matchMedia;
    });

    function loadScript() {
        jest.isolateModules(() => {
            require(SCRIPT_PATH);
        });
    }

    test('pauses background video when prefers-reduced-motion matches', () => {
        const video = document.createElement('video');
        video.setAttribute('autoplay', '');
        const pauseSpy = jest.spyOn(video, 'pause').mockImplementation(() => {});
        document.body.innerHTML = '<div class="video-background"></div>';
        document.querySelector('.video-background')?.appendChild(video);

        global.matchMedia = jest.fn().mockReturnValue({ matches: true });

        loadScript();

        expect(pauseSpy).toHaveBeenCalledTimes(1);
        expect(video.hasAttribute('autoplay')).toBe(false);
    });

    test('does nothing when prefers-reduced-motion does not match', () => {
        const video = document.createElement('video');
        video.setAttribute('autoplay', '');
        const pauseSpy = jest.spyOn(video, 'pause').mockImplementation(() => {});
        document.body.innerHTML = '<div class="video-background"></div>';
        document.querySelector('.video-background')?.appendChild(video);

        global.matchMedia = jest.fn().mockReturnValue({ matches: false });

        loadScript();

        expect(pauseSpy).not.toHaveBeenCalled();
        expect(video.hasAttribute('autoplay')).toBe(true);
    });

    test('gracefully handles missing video element even when motion reduced', () => {
        document.body.innerHTML = '<div class="video-background"></div>';
        global.matchMedia = jest.fn().mockReturnValue({ matches: true });

        expect(loadScript).not.toThrow();
    });

    test('handles environments without matchMedia gracefully', () => {
        const video = document.createElement('video');
        video.setAttribute('autoplay', '');
        const pauseSpy = jest.spyOn(video, 'pause').mockImplementation(() => {});
        document.body.innerHTML = '<div class="video-background"></div>';
        document.querySelector('.video-background')?.appendChild(video);

        expect(loadScript).not.toThrow();
        expect(pauseSpy).not.toHaveBeenCalled();
        expect(video.hasAttribute('autoplay')).toBe(true);
    });

    test('ignores errors thrown during execution', () => {
        const video = document.createElement('video');
        video.setAttribute('autoplay', '');
        const pauseSpy = jest.spyOn(video, 'pause').mockImplementation(() => {});
        document.body.innerHTML = '<div class="video-background"></div>';
        document.querySelector('.video-background')?.appendChild(video);

        global.matchMedia = jest.fn().mockImplementation(() => {
            throw new Error('matchMedia not available');
        });

        expect(loadScript).not.toThrow();
        expect(pauseSpy).not.toHaveBeenCalled();
        expect(video.hasAttribute('autoplay')).toBe(true);
    });
});

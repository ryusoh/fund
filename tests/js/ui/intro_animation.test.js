/**
 * @jest-environment jsdom
 */

import { initIntroAnimation } from '../../../js/ui/intro_animation.js';

describe('Intro Animation', () => {
    let mockGsap;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <nav class="container"></nav>
            <footer></footer>
            <div class="quantum-widget"></div>
        `;

        window.sessionStorage.clear();

        mockGsap = {
            set: jest.fn(),
            to: jest.fn().mockReturnThis(),
            timeline: jest.fn().mockReturnValue({
                to: jest.fn().mockReturnThis(),
            }),
        };
        window.gsap = mockGsap;
    });

    it('should add is-loading class and elements to body', () => {
        initIntroAnimation();

        expect(document.body.classList.contains('is-loading')).toBeTruthy();
        expect(document.querySelector('.intro-overlay')).toBeTruthy();
        expect(document.querySelector('.intro-counter')).toBeTruthy();
    });

    it('should skip animation if session storage flag exists', () => {
        document.body.classList.remove('is-loading'); // Reset state explicitly
        window.sessionStorage.setItem('introPlayed', 'true');
        initIntroAnimation();

        // The body starts with no 'is-loading' class, and it should NOT be added
        expect(document.body.classList.contains('is-loading')).toBeFalsy();
        expect(document.querySelector('.intro-overlay')).toBeNull();
    });

    it('should set initial gsap states', () => {
        initIntroAnimation();

        expect(mockGsap.set).toHaveBeenCalledTimes(3);
        expect(mockGsap.timeline).toHaveBeenCalled();
    });
});

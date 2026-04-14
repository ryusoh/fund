/**
 * @jest-environment jsdom
 */

import { initMagneticNav } from '@ui/magnetic_nav.js';

describe('Magnetic Nav', () => {
    let mockGsap;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <nav class="container">
                <li><a href="#">Link 1</a></li>
                <li><a href="#">Link 2</a></li>
            </nav>
            <footer><a href="#">Footer</a></footer>
        `;

        mockGsap = {
            to: jest.fn(),
        };
        window.gsap = mockGsap;

        // Reset touch mock
        delete window.ontouchstart;
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    });

    it('should attach event listeners to elements', () => {
        initMagneticNav();
        const firstLi = document.querySelector('li');

        // Mock getBoundingClientRect
        firstLi.getBoundingClientRect = jest.fn(() => ({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
        }));

        const mouseMoveEvent = new MouseEvent('mousemove', {
            clientX: 60,
            clientY: 60,
        });

        firstLi.dispatchEvent(mouseMoveEvent);
        expect(mockGsap.to).toHaveBeenCalled();

        const mouseLeaveEvent = new MouseEvent('mouseleave');
        firstLi.dispatchEvent(mouseLeaveEvent);
        // Expect more calls to gsap.to for elastic snapback
        expect(mockGsap.to.mock.calls.length).toBeGreaterThan(1);
    });

    it('should not attach listeners on touch devices', () => {
        window.ontouchstart = true;
        initMagneticNav();

        const firstLi = document.querySelector('li');
        firstLi.getBoundingClientRect = jest.fn(() => ({ width: 100, height: 100 }));

        const mouseMoveEvent = new MouseEvent('mousemove', { clientX: 60, clientY: 60 });
        firstLi.dispatchEvent(mouseMoveEvent);

        expect(mockGsap.to).not.toHaveBeenCalled();
    });
});

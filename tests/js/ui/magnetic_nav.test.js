/**
 * @jest-environment jsdom
 */

import { initMagneticNav } from '../../../js/ui/magnetic_nav.js';

describe('Magnetic Nav', () => {
    let mockGsap;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <nav class="container">
                <li><a href="#">Link 1</a></li>
                <li><a href="#">Link 2</a></li>
            </nav>
            <div id="currencyToggleContainer">
                <button class="currency-toggle active" data-currency="USD">$</button>
                <button class="currency-toggle" data-currency="CNY">¥</button>
            </div>
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

    it('should apply magnetic effect to currency toggle buttons', () => {
        initMagneticNav();
        const currencyBtn = document.querySelector('#currencyToggleContainer .currency-toggle');

        currencyBtn.getBoundingClientRect = jest.fn(() => ({
            left: 0,
            top: 0,
            width: 30,
            height: 30,
        }));

        const mouseMoveEvent = new MouseEvent('mousemove', {
            clientX: 20,
            clientY: 20,
        });

        currencyBtn.dispatchEvent(mouseMoveEvent);
        expect(mockGsap.to).toHaveBeenCalled();

        mockGsap.to.mockClear();
        const mouseLeaveEvent = new MouseEvent('mouseleave');
        currencyBtn.dispatchEvent(mouseLeaveEvent);
        expect(mockGsap.to).toHaveBeenCalledWith(
            currencyBtn,
            expect.objectContaining({
                x: 0,
                y: 0,
                ease: 'elastic.out(1, 0.3)',
            })
        );
    });
});

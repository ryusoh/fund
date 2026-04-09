import { jest } from '@jest/globals';
import { requestFadeUpdate, setFadePreserveSecondLast } from '@js/transactions/fade.js';

describe('Fade Effect Logic', () => {
    let outputContainer;

    beforeEach(() => {
        // Mock requestAnimationFrame to execute synchronously
        global.requestAnimationFrame = (cb) => cb();
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        }); // Desktop width

        // Create container mock
        outputContainer = document.createElement('div');
        // Mock layout properties using defineProperty specifically for JSDOM/Jest
        Object.defineProperty(outputContainer, 'clientHeight', { value: 500, writable: true });
        Object.defineProperty(outputContainer, 'scrollTop', { value: 0, writable: true });
        Object.defineProperty(outputContainer, 'scrollHeight', { value: 1000, writable: true });
    });

    afterEach(() => {
        jest.clearAllMocks();
        outputContainer.innerHTML = '';
    });

    test('requestFadeUpdate ensures the last child is always fully opaque even in fade zone', () => {
        const singleChild = document.createElement('div');
        Object.defineProperty(singleChild, 'offsetTop', { value: 0, writable: true });
        Object.defineProperty(singleChild, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(singleChild);

        requestFadeUpdate(outputContainer);

        expect(singleChild.style.opacity).toBe('1');
    });

    test('requestFadeUpdate fades top items but keeps last child opaque', () => {
        const child0 = document.createElement('div');
        Object.defineProperty(child0, 'offsetTop', { value: 0, writable: true });
        Object.defineProperty(child0, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child0);

        const child1 = document.createElement('div');
        Object.defineProperty(child1, 'offsetTop', { value: 50, writable: true });
        Object.defineProperty(child1, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child1);

        Object.defineProperty(outputContainer, 'scrollTop', { value: 25, writable: true });

        requestFadeUpdate(outputContainer);

        expect(child0.style.opacity).not.toBe('1');
        expect(parseFloat(child0.style.opacity)).toBeLessThan(1);
        expect(child1.style.opacity).toBe('1');

        Object.defineProperty(outputContainer, 'scrollTop', { value: 75, writable: true });

        requestFadeUpdate(outputContainer);

        expect(child1.style.opacity).toBe('1');
    });

    test('requestFadeUpdate respects setFadePreserveSecondLast(true) for context', () => {
        const child0 = document.createElement('div');
        Object.defineProperty(child0, 'offsetTop', { value: 0, writable: true });
        Object.defineProperty(child0, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child0);

        const child1 = document.createElement('div');
        Object.defineProperty(child1, 'offsetTop', { value: 50, writable: true });
        Object.defineProperty(child1, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child1);

        const child2 = document.createElement('div');
        Object.defineProperty(child2, 'offsetTop', { value: 100, writable: true });
        Object.defineProperty(child2, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child2);

        Object.defineProperty(outputContainer, 'scrollTop', { value: 25, writable: true });

        setFadePreserveSecondLast(true);
        requestFadeUpdate(outputContainer);

        expect(child0.style.opacity).toBe('1');
        expect(child1.style.opacity).toBe('1');
        expect(child2.style.opacity).toBe('1');

        setFadePreserveSecondLast(false);
        requestFadeUpdate(outputContainer);

        expect(child0.style.opacity).not.toBe('1');
        expect(parseFloat(child0.style.opacity)).toBeLessThan(1);
    });

    test('updateOutputFade bails out if outputContainer is missing', () => {
        requestFadeUpdate(null);
    });

    test('updateOutputFade handles mobile view by making all items opaque', () => {
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 500,
        }); // Mobile width

        const child = document.createElement('div');
        outputContainer.appendChild(child);

        requestFadeUpdate(outputContainer);

        expect(child.style.opacity).toBe('1');
    });

    test('updateOutputFade skips non-element nodes in mobile view', () => {
        Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });

        const textNode = document.createTextNode('test');
        outputContainer.appendChild(textNode);

        const div = document.createElement('div');
        outputContainer.appendChild(div);

        // Falsy child mock
        Object.defineProperty(outputContainer, 'children', {
            get: () => [null, textNode, div],
            configurable: true,
        });

        requestFadeUpdate(outputContainer);
        expect(div.style.opacity).toBe('1');
    });

    test('updateOutputFade bails if viewHeight is <= 0', () => {
        Object.defineProperty(outputContainer, 'clientHeight', { value: 0, writable: true });

        const child = document.createElement('div');
        child.style.opacity = '0.5';
        outputContainer.appendChild(child);

        requestFadeUpdate(outputContainer);

        expect(child.style.opacity).toBe('0.5'); // Unchanged
    });

    test('updateOutputFade makes items fully invisible if scrolled past top', () => {
        const child0 = document.createElement('div');
        Object.defineProperty(child0, 'offsetTop', { value: -100, writable: true });
        Object.defineProperty(child0, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child0);

        const child1 = document.createElement('div');
        outputContainer.appendChild(child1);

        Object.defineProperty(outputContainer, 'scrollTop', { value: 0, writable: true });

        requestFadeUpdate(outputContainer);

        expect(child0.style.opacity).toBe('0');
    });

    test('updateOutputFade clears opacity if below threshold', () => {
        const child0 = document.createElement('div');
        Object.defineProperty(child0, 'offsetTop', { value: 200, writable: true });
        Object.defineProperty(child0, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child0);

        const child1 = document.createElement('div');
        outputContainer.appendChild(child1);

        Object.defineProperty(outputContainer, 'scrollTop', { value: 0, writable: true });

        requestFadeUpdate(outputContainer);

        expect(child0.style.opacity).toBe('');
    });

    test('updateOutputFade skips falsy children and non-element nodes in desktop view', () => {
        const textNode = document.createTextNode('test');
        outputContainer.appendChild(textNode);

        const div = document.createElement('div');
        outputContainer.appendChild(div);

        // For falsy child, mock children getter
        Object.defineProperty(outputContainer, 'children', {
            get: () => [null, undefined, textNode, div],
            configurable: true,
        });

        requestFadeUpdate(outputContainer);

        // Assert div got opacity 1 since it's the last child
        expect(div.style.opacity).toBe('1');
    });

    test('updateOutputFade skips non-element nodes in desktop view', () => {
        const textNode = document.createTextNode('test');
        outputContainer.appendChild(textNode);

        requestFadeUpdate(outputContainer);
    });

    test('initFade registers scroll listener', () => {
        const mockAddEventListener = jest.spyOn(outputContainer, 'addEventListener');
        return import('@js/transactions/fade.js').then(({ initFade }) => {
            initFade(outputContainer);
            expect(mockAddEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
        });
    });

    test('initFade handles null container', () => {
        return import('@js/transactions/fade.js').then(({ initFade }) => {
            initFade(null);
        });
    });
});

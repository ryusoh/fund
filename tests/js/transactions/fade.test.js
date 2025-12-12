import { jest } from '@jest/globals';
import { requestFadeUpdate, setFadePreserveSecondLast } from '@js/transactions/fade.js';

describe('Fade Effect Logic', () => {
    let outputContainer;

    beforeEach(() => {
        // Mock requestAnimationFrame to execute synchronously
        global.requestAnimationFrame = (cb) => cb();
        global.window.innerWidth = 1024; // Desktop width

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
        // Scenario: Single item at top (scroll 0), inside the fade threshold
        // Threshold = 25% of 500 = 125px.
        const singleChild = document.createElement('div');
        Object.defineProperty(singleChild, 'offsetTop', { value: 0, writable: true });
        Object.defineProperty(singleChild, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(singleChild);

        // Execute fade update
        requestFadeUpdate(outputContainer);

        // Expect opacity 1 because it's the last child
        expect(singleChild.style.opacity).toBe('1');
    });

    test('requestFadeUpdate fades top items but keeps last child opaque', () => {
        // Create 2 items
        // Threshold = 125px

        // Child 0: Top 0, Height 50. Not last.
        const child0 = document.createElement('div');
        Object.defineProperty(child0, 'offsetTop', { value: 0, writable: true });
        Object.defineProperty(child0, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child0);

        // Child 1: Top 50, Height 50. Last child.
        const child1 = document.createElement('div');
        Object.defineProperty(child1, 'offsetTop', { value: 50, writable: true });
        Object.defineProperty(child1, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child1);

        // Case 1: Scroll so Child 0 is partially offscreen (scrolled UP)
        // scrollTop = 25.
        // Child 0 relativeTop = -25. relativeBottom = 25. Coverage = 0.5. Should fade.
        // Child 1 relativeTop = 25. relativeBottom = 75. Fully in threshold (0-125) but fully visible (25-75). Coverage = 1.
        Object.defineProperty(outputContainer, 'scrollTop', { value: 25, writable: true });

        requestFadeUpdate(outputContainer);

        expect(child0.style.opacity).not.toBe('1');
        expect(parseFloat(child0.style.opacity)).toBeLessThan(1);
        expect(child1.style.opacity).toBe('1'); // Last child always 1

        // Case 2: Scroll so Child 1 (Last) is partially offscreen
        // scrollTop = 75.
        // Child 1 relativeTop = 50 - 75 = -25. relativeBottom = 25.
        // Normally would fade (like Child 0 did).
        // But due to protection, must be 1.
        Object.defineProperty(outputContainer, 'scrollTop', { value: 75, writable: true });

        requestFadeUpdate(outputContainer);

        expect(child1.style.opacity).toBe('1');
    });

    test('requestFadeUpdate respects setFadePreserveSecondLast(true) for context', () => {
        // Create 3 items to simulate: PreviousOutput, ZoomPrompt, ZoomOutput
        // Threshold = 125px

        // Child 0: Previous Output. Top 0.
        const child0 = document.createElement('div');
        Object.defineProperty(child0, 'offsetTop', { value: 0, writable: true });
        Object.defineProperty(child0, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child0);

        // Child 1: Zoom Prompt. Top 50.
        const child1 = document.createElement('div');
        Object.defineProperty(child1, 'offsetTop', { value: 50, writable: true });
        Object.defineProperty(child1, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child1);

        // Child 2: Zoom Output (Last). Top 100.
        const child2 = document.createElement('div');
        Object.defineProperty(child2, 'offsetTop', { value: 100, writable: true });
        Object.defineProperty(child2, 'offsetHeight', { value: 50, writable: true });
        outputContainer.appendChild(child2);

        // Scroll so Child 0 is partially offscreen (scrolled UP)
        // scrollTop = 25.
        // Child 0 relativeTop = -25. relativeBottom = 25. Coverage = 0.5. Should fade by default.
        Object.defineProperty(outputContainer, 'scrollTop', { value: 25, writable: true });

        // Enable exception
        setFadePreserveSecondLast(true);
        requestFadeUpdate(outputContainer);

        // Child 0 (3rd last) should NOT be faded
        expect(child0.style.opacity).toBe('1');
        // Child 1 (2nd last) should NOT be faded
        expect(child1.style.opacity).toBe('1');
        // Child 2 (Last) always 1
        expect(child2.style.opacity).toBe('1');

        // Disable exception
        setFadePreserveSecondLast(false);
        requestFadeUpdate(outputContainer);

        // Child 0 should be faded now
        expect(child0.style.opacity).not.toBe('1');
        expect(parseFloat(child0.style.opacity)).toBeLessThan(1);
    });
});

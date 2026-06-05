/* global performance, KeyboardEvent */
/**
 * @jest-environment jsdom
 */

describe('quantum_shader coverage', () => {
    let originalConsoleError;
    let originalConsoleWarn;
    let originalCreateElement;

    beforeEach(() => {
        document.body.innerHTML = '';
        originalConsoleError = console.error;
        console.error = jest.fn();
        originalConsoleWarn = console.warn;
        console.warn = jest.fn();

        // Mock RAF
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            setTimeout(() => cb(performance.now()), 0);
            return 1;
        });

        // Mock ResizeObserver
        window.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };

        originalCreateElement = document.createElement.bind(document);

        jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
            const el = originalCreateElement(tagName);
            if (tagName === 'canvas') {
                el.width = 100;
                el.height = 100;
                el.getContext = () => ({
                    createImageData: () => ({
                        data: new Uint8ClampedArray(40000),
                    }),
                    putImageData: jest.fn(),
                    fillRect: jest.fn(),
                    clearRect: jest.fn(),
                    fill: jest.fn(),
                    beginPath: jest.fn(),
                });
            }
            return el;
        });
    });

    afterEach(() => {
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
        jest.resetModules();
        jest.restoreAllMocks();
    });

    it('initializes and triggers offline fallback without three.js', async () => {
        jest.mock(
            '../../../js/vendor/three.module.js',
            () => {
                throw new Error('three module not found');
            },
            { virtual: true }
        );

        require('@js/ambient/quantum_shader.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        await new Promise((resolve) => setTimeout(resolve, 0));

        const offlineFallback = document.querySelector('.quantum-offline');
        expect(offlineFallback).not.toBeNull();
    });

    it('initializes normal rendering path if three.js loads', async () => {
        // Mock three.js
        const mockVector2 = class {
            constructor(x, y) {
                this.x = x;
                this.y = y;
            }
            set(x, y) {
                this.x = x;
                this.y = y;
            }
            copy(v) {
                this.x = v.x;
                this.y = v.y;
            }
            lerp(v, alpha) {
                this.x += (v.x - this.x) * alpha;
                this.y += (v.y - this.y) * alpha;
            }
        };

        const mockColor = class {
            constructor() {}
            setHex() {}
        };

        const mockThree = {
            WebGLRenderer: class {
                constructor() {
                    this.domElement = document.createElement('canvas');
                }
                setSize() {}
                setPixelRatio() {}
                setClearColor() {}
                render() {}
            },
            Scene: class {
                constructor() {
                    this.background = null;
                }
                add() {}
            },
            PerspectiveCamera: class {
                constructor() {
                    this.position = new mockVector2(0, 0);
                    this.position.z = 0;
                }
                lookAt() {}
                updateProjectionMatrix() {}
            },
            Color: mockColor,
            Vector2: mockVector2,
            Vector3: class {
                constructor(x, y, z) {
                    this.x = x;
                    this.y = y;
                    this.z = z;
                }
            },
            BufferGeometry: class {
                constructor() {}
                setAttribute() {}
            },
            BufferAttribute: class {
                constructor() {}
            },
            PlaneGeometry: class {
                constructor() {}
            },
            RingGeometry: class {
                constructor() {}
            },
            ShaderMaterial: class {
                constructor(opts) {
                    this.uniforms = opts.uniforms;
                }
            },
            Mesh: class {
                constructor() {
                    this.rotation = { x: 0, y: 0, z: 0 };
                    this.position = { x: 0, y: 0, z: 0 };
                }
            },
            Points: class {
                constructor() {
                    this.rotation = { x: 0, y: 0, z: 0 };
                    this.position = { x: 0, y: 0, z: 0 };
                }
            },
            Group: class {
                constructor() {
                    this.rotation = { x: 0, y: 0, z: 0 };
                    this.position = { x: 0, y: 0, z: 0 };
                }
                add() {}
            },
            DoubleSide: 2,
            AdditiveBlending: 2,
        };

        jest.mock('../../../js/vendor/three.module.js', () => mockThree, { virtual: true });

        // Try 'loading' path too
        Object.defineProperty(document, 'readyState', {
            get() {
                return 'loading';
            },
            configurable: true,
        });

        // Trigger the script
        require('@js/ambient/quantum_shader.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        // Wait for next tick so promises resolve
        await new Promise((resolve) => setTimeout(resolve, 50));

        const container = document.querySelector('.quantum-widget');
        expect(container).not.toBeNull();

        // Trigger pointer move
        let event = new MouseEvent('pointermove', { clientX: 50, clientY: 50 });
        container.dispatchEvent(event);

        // Trigger pointer down
        event = new MouseEvent('pointerdown', { clientX: 50, clientY: 50 });
        event.pointerId = 1;
        container.setPointerCapture = jest.fn();
        container.dispatchEvent(event);

        // Error path for pointer capture
        event = new MouseEvent('pointerdown', { clientX: 50, clientY: 50 });
        event.pointerId = 2;
        container.setPointerCapture = jest.fn(() => {
            throw new Error('Capture error');
        });
        container.dispatchEvent(event);

        // Trigger pointer move after down
        event = new MouseEvent('pointermove', { clientX: 100, clientY: 100 });
        event.pointerId = 2;
        container.dispatchEvent(event);

        // Different pointer ID
        event = new MouseEvent('pointermove', { clientX: 100, clientY: 100 });
        event.pointerId = 1;
        container.dispatchEvent(event);

        // Trigger pointer up
        event = new MouseEvent('pointerup');
        event.pointerId = 2;
        container.releasePointerCapture = jest.fn();
        container.hasPointerCapture = jest.fn(() => true);
        container.dispatchEvent(event);

        // pointerup with missing pointerId
        event = new MouseEvent('pointerup');
        event.pointerId = 1;
        container.dispatchEvent(event);

        // Error path for pointer release
        event = new MouseEvent('pointerup');
        event.pointerId = 2;
        // manually set the pointer back to active
        const downEvent = new MouseEvent('pointerdown', { clientX: 50, clientY: 50 });
        downEvent.pointerId = 2;
        container.setPointerCapture = jest.fn();
        container.dispatchEvent(downEvent);

        container.releasePointerCapture = jest.fn(() => {
            throw new Error('Release error');
        });
        container.dispatchEvent(event);

        // Trigger pointer cancel
        event = new MouseEvent('pointercancel');
        event.pointerId = 2;
        container.dispatchEvent(event);

        // Trigger pointer leave
        event = new MouseEvent('pointerleave');
        container.dispatchEvent(event);

        // set pointerActive
        const dEvent = new MouseEvent('pointerdown', { clientX: 50, clientY: 50 });
        dEvent.pointerId = 2;
        container.dispatchEvent(dEvent);
        container.dispatchEvent(event); // pointerleave while active

        // context menu
        container.dispatchEvent(new Event('contextmenu'));

        // blur
        window.dispatchEvent(new Event('blur'));

        // Trigger resize
        window.dispatchEvent(new Event('resize'));

        // trigger arrow keys
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space' })); // unhandled

        // test ignoring keys when active element is contenteditable
        // create a fake target that returns true for isContentEditable
        const mockEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
        const mockTarget = document.createElement('div');
        Object.defineProperty(mockTarget, 'isContentEditable', { value: true, enumerable: true });
        Object.defineProperty(mockEvent, 'target', { value: mockTarget, enumerable: true });
        document.dispatchEvent(mockEvent);

        // Ignore inputs
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));

        const ta = document.createElement('textarea');
        document.body.appendChild(ta);
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    });

    it('covers the else branch for document.readyState', () => {
        Object.defineProperty(document, 'readyState', {
            get() {
                return 'complete';
            },
            configurable: true,
        });

        // Need a clean slate for the module execution
        jest.resetModules();
        jest.mock(
            '../../../js/vendor/three.module.js',
            () => {
                throw new Error('three module not found');
            },
            { virtual: true }
        );
        require('@js/ambient/quantum_shader.js');
    });
});

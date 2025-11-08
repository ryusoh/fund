// GSAP is loaded globally via script tag
const gsap = window.gsap;

const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || matchMedia('(hover: none)').matches);

const lerp = (start, end, alpha) => start + (end - start) * alpha;

// ---------------------------------------------------------------------------
// Custom cursor
// ---------------------------------------------------------------------------

export class CustomCursor {
    constructor({
        root = document.body,
        hoverTargets = 'a, button',
        className = 'custom-cursor',
        hoverClass = 'is-hovered',
        followEase = 0.4,
        fadeEase = 0.1,
        hoverScale = 3,
    } = {}) {
        this.disabled = isTouchDevice;
        if (this.disabled) {
            return;
        }

        this.root = root;
        this.hoverTargets = hoverTargets;
        this.hoverClass = hoverClass;
        this.followEase = followEase;
        this.fadeEase = fadeEase;
        this.hoverScale = hoverScale;

        this.element = document.createElement('div');
        this.element.className = className;
        this.element.style.position = 'fixed';
        this.element.style.pointerEvents = 'none';
        this.element.style.top = '0';
        this.element.style.left = '0';
        this.element.style.transformOrigin = '50% 50%';

        this.coords = {
            x: { current: window.innerWidth / 2, value: window.innerWidth / 2 },
            y: { current: window.innerHeight / 2, value: window.innerHeight / 2 },
            opacity: { current: 1, value: 1 },
            scale: { current: 1, value: 1 },
        };

        root.appendChild(this.element);

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseOut = this.onMouseOut.bind(this);
        this.onMouseEnter = this.onMouseEnter.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.loop = this.loop.bind(this);

        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseout', this.onMouseOut);
        this.attachHoverTargets();

        this.rafId = requestAnimationFrame(this.loop);
    }

    attachHoverTargets() {
        if (this.disabled) return;
        const nodes = this.root.querySelectorAll(this.hoverTargets);
        nodes.forEach((node) => {
            node.addEventListener('mouseenter', this.onMouseEnter);
            node.addEventListener('mouseleave', this.onMouseLeave);
            node.addEventListener('click', this.onMouseLeave);
        });
    }

    onMouseMove(event) {
        this.coords.x.current = event.clientX;
        this.coords.y.current = event.clientY;
        this.coords.opacity.current = 1;
    }

    onMouseOut(event) {
        if (event.relatedTarget === null) {
            this.coords.opacity.current = 0;
        }
    }

    onMouseEnter() {
        this.element.classList.add(this.hoverClass);
        this.coords.scale.current = this.hoverScale;
    }

    onMouseLeave() {
        this.element.classList.remove(this.hoverClass);
        this.coords.scale.current = 1;
    }

    loop() {
        this.coords.opacity.value = lerp(
            this.coords.opacity.value,
            this.coords.opacity.current,
            this.fadeEase
        );
        this.coords.scale.value = lerp(
            this.coords.scale.value,
            this.coords.scale.current,
            this.fadeEase
        );
        this.coords.x.value = lerp(this.coords.x.value, this.coords.x.current, this.followEase);
        this.coords.y.value = lerp(this.coords.y.value, this.coords.y.current, this.followEase);

        gsap.set(this.element, {
            opacity: this.coords.opacity.value,
            scale: this.coords.scale.value,
            x: this.coords.x.value,
            y: this.coords.y.value,
            zIndex: 100,
        });

        this.rafId = requestAnimationFrame(this.loop);
    }

    destroy() {
        if (this.disabled || !this.element) return;
        cancelAnimationFrame(this.rafId);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseout', this.onMouseOut);
        this.root.querySelectorAll(this.hoverTargets).forEach((node) => {
            node.removeEventListener('mouseenter', this.onMouseEnter);
            node.removeEventListener('mouseleave', this.onMouseLeave);
            node.removeEventListener('click', this.onMouseLeave);
        });
        this.element.remove();
    }
}

/**
 * Helper to instantiate just the cursor enhancement.
 */
export function initCursor({ cursor } = {}) {
    const cursorInstance = isTouchDevice ? null : new CustomCursor(cursor);
    return { cursor: cursorInstance };
}

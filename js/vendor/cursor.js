// GSAP is loaded globally via script tag
const gsap = window.gsap;

const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || matchMedia('(hover: none)').matches);

const lerp = (start, end, alpha) => start + (end - start) * alpha;

const htmlElement = typeof document !== 'undefined' ? document.documentElement : null;
const getBody = () => (typeof document !== 'undefined' ? document.body : null);
let forceHideRefCount = 0;
const FORCE_HIDE_CLASS = 'force-hide-cursor';
const HIDDEN_CURSOR_VALUE =
    'url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==") 0 0, none';
const overriddenElements = new Set();
let pointerListenersBound = false;

const applyInlineCursorToElement = (element) => {
    if (
        !element ||
        !element.style ||
        overriddenElements.has(element) ||
        element.classList?.contains('custom-cursor')
    ) {
        return;
    }
    try {
        element.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
        overriddenElements.add(element);
    } catch {
        // ignore elements that do not expose style setters (e.g., SVG defs)
    }
};

const clearInlineCursorOverrides = () => {
    overriddenElements.forEach((element) => {
        try {
            if (element.style?.cursor === HIDDEN_CURSOR_VALUE) {
                element.style.removeProperty('cursor');
            }
        } catch {
            // ignore
        }
    });
    overriddenElements.clear();
};

const pointerEventHandler = (event) => {
    if (!htmlElement || !htmlElement.classList?.contains(FORCE_HIDE_CLASS)) return;
    applyInlineCursorToElement(event.target);
};

const bindPointerListeners = () => {
    if (pointerListenersBound || typeof document === 'undefined') return;
    document.addEventListener('pointerover', pointerEventHandler, true);
    document.addEventListener('pointerdown', pointerEventHandler, true);
    document.addEventListener('focusin', pointerEventHandler, true);
    pointerListenersBound = true;
};

const unbindPointerListeners = () => {
    if (!pointerListenersBound || typeof document === 'undefined') return;
    document.removeEventListener('pointerover', pointerEventHandler, true);
    document.removeEventListener('pointerdown', pointerEventHandler, true);
    document.removeEventListener('focusin', pointerEventHandler, true);
    pointerListenersBound = false;
};

const applyForceHideCursor = () => {
    if (!htmlElement || !htmlElement.classList) return;
    forceHideRefCount += 1;
    if (forceHideRefCount === 1) {
        htmlElement.classList.add(FORCE_HIDE_CLASS);
        htmlElement.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
        const body = getBody();
        if (body) {
            body.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
        }
        bindPointerListeners();
    }
};

const releaseForceHideCursor = () => {
    if (!htmlElement || !htmlElement.classList) return;
    forceHideRefCount = Math.max(0, forceHideRefCount - 1);
    if (forceHideRefCount === 0) {
        htmlElement.classList.remove(FORCE_HIDE_CLASS);
        htmlElement.style.removeProperty('cursor');
        const body = getBody();
        if (body) {
            body.style.removeProperty('cursor');
        }
        clearInlineCursorOverrides();
        unbindPointerListeners();
    }
};

// ---------------------------------------------------------------------------
// Custom cursor
// ---------------------------------------------------------------------------

export class CustomCursor {
    constructor({
        root = document.body,
        hoverTargets = 'a, button, .nav-link, .fa, i, .container a, .container i, *[class*="nav"], *[class*="back"], *[role="button"], .back-button, .nav-back, .back',
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
        this.element.className = `${className} ${className}--wrapper`;
        this.element.style.position = 'fixed';
        this.element.style.pointerEvents = 'none';
        this.element.style.top = '0';
        this.element.style.left = '0';
        this.element.style.transform = 'translate(-50%, -50%)';

        this.core = document.createElement('div');
        this.core.className = `${className}__core`;
        this.core.style.transformOrigin = '50% 50%';
        this.element.appendChild(this.core);

        this.coords = {
            x: { current: window.innerWidth / 2, value: window.innerWidth / 2 },
            y: { current: window.innerHeight / 2, value: window.innerHeight / 2 },
            opacity: { current: 1, value: 1 },
            scale: { current: 1, value: 1 },
        };

        root.appendChild(this.element);
        applyForceHideCursor();

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
            node.style.setProperty('cursor', HIDDEN_CURSOR_VALUE, 'important');
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
        this.core.classList.add(this.hoverClass);
        this.coords.scale.current = this.hoverScale;
    }

    onMouseLeave() {
        this.core.classList.remove(this.hoverClass);
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
            x: this.coords.x.value,
            y: this.coords.y.value,
            zIndex: 100,
        });
        gsap.set(this.core, {
            scale: this.coords.scale.value,
        });

        this.rafId = requestAnimationFrame(this.loop);
    }

    destroy() {
        if (this.disabled || !this.element) return;
        cancelAnimationFrame(this.rafId);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseout', this.onMouseOut);

        this.root.querySelectorAll(this.hoverTargets).forEach((node) => {
            if (node.style?.cursor === HIDDEN_CURSOR_VALUE) {
                node.style.removeProperty('cursor');
            }
            node.removeEventListener('mouseenter', this.onMouseEnter);
            node.removeEventListener('mouseleave', this.onMouseLeave);
            node.removeEventListener('click', this.onMouseLeave);
        });
        this.element.remove();
        releaseForceHideCursor();
    }
}

/**
 * Helper to instantiate just the cursor enhancement.
 */
export function initCursor({ cursor } = {}) {
    const cursorInstance = isTouchDevice ? null : new CustomCursor(cursor);
    return { cursor: cursorInstance };
}

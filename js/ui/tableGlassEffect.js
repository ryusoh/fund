import { PIE_CHART_GLASS_EFFECT, UI_BREAKPOINTS } from '@js/config.js';
import { TableGlassWebGL } from './tableGlassWebGL.js';
import { LiquidGlassRefraction } from './liquidGlassRefraction.js';

function isDataRow(row) {
    if (!row) {
        return false;
    }
    // Exclude header rows
    if (row.closest('thead') || row.querySelector('th')) {
        return false;
    }
    // Exclude footer rows
    if (row.closest('tfoot')) {
        return false;
    }
    const className = row.className ? row.className.toLowerCase() : '';
    const id = row.id ? row.id.toLowerCase() : '';
    if (
        className.includes('footer') ||
        className.includes('total') ||
        className.includes('summary') ||
        id.includes('footer') ||
        id.includes('total') ||
        id.includes('summary')
    ) {
        return false;
    }
    return true;
}

export class TableGlassEffect {
    constructor(containerSelector, options = {}) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) {
            throw new Error(`Container not found: ${containerSelector}`);
        }
        // Expose instance for external control (e.g. zoom animations)
        this.container.glassEffect = this;

        // Merge defaults with provided options
        // If options has threeD, it overrides PIE_CHART_GLASS_EFFECT.threeD
        this.options = {
            ...PIE_CHART_GLASS_EFFECT,
            ...options,
            threeD: {
                ...PIE_CHART_GLASS_EFFECT.threeD,
                ...(options.threeD || {}),
            },
        };

        if (this.options.enabled === false) {
            return;
        }

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.animationFrame = null;
        this.state = {
            phase: 0,
            continuousPhase: 0,
            ambientPhase: 0,
            lastTime: 0,
            energyParticles: [],
            pointer: { x: 0, y: 0 },
            pointerSmoothed: { x: 0, y: 0 },
            hoveredRowIndex: -1,
            lastHoveredRowIndex: -1,
            spotlightAlpha: 0,
        };
        this.resizePaused = false;

        this.init();
    }

    pauseResize() {
        this.resizePaused = true;
    }

    resumeResize() {
        this.resizePaused = false;
        this.resize();
    }

    init() {
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.pointerEvents = 'none'; // Let clicks pass through
        this.canvas.style.zIndex = '-1'; // Behind content
        this.canvas.style.display = 'block';

        // Handle header exclusion
        this._headerHeight = 0;
        if (this.options.excludeHeader) {
            const thead = this.container.querySelector('thead');
            this._headerHeight = thead ? thead.offsetHeight : 0;
            this.canvas.style.top = `${this._headerHeight}px`;
            this.canvas.style.borderRadius = '0';
        } else {
            this.canvas.style.top = '0';
            this.canvas.style.borderRadius = '8px';
        }

        // Ensure container is relative so canvas is positioned correctly
        const computedStyle = window.getComputedStyle(this.container);
        if (computedStyle.position === 'static') {
            this.container.style.position = 'relative';
        }

        // Use sticky only when content actually overflows the container,
        // so the canvas stays pinned during scroll with zero lag.
        // Just checking overflow CSS is not enough — containers like .chart-card
        // have overflow:auto but content never exceeds the viewport.
        this._scrollable =
            /auto|scroll/.test(computedStyle.overflow + computedStyle.overflowY) &&
            this.container.scrollHeight > this.container.clientHeight + 1;

        if (this._scrollable) {
            this.canvas.style.position = 'sticky';
            this.container.insertBefore(this.canvas, this.container.firstChild);
        } else {
            this.canvas.style.position = 'absolute';
            this.container.appendChild(this.canvas);
        }

        // Find the table element to observe its full width
        this.table = this.container.querySelector('table');
        const target = this.table || this.container;

        // Observe size changes on the table (content) instead of just the container
        // eslint-disable-next-line no-undef
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(target);

        // Also observe the parent .content-block which gets display:none toggled.
        // ResizeObserver on the table alone misses re-show because the table's
        // intrinsic size doesn't change — only its parent's display does.
        const contentBlock = this.container.closest('.content-block');
        if (contentBlock) {
            this.resizeObserver.observe(contentBlock);

            // MutationObserver catches class attribute changes (hidden toggle)
            // that ResizeObserver misses on display:none → visible transitions.
            // eslint-disable-next-line no-undef
            this._contentBlockObserver = new MutationObserver(() => {
                if (!contentBlock.classList.contains('hidden')) {
                    this.resize();
                }
            });
            this._contentBlockObserver.observe(contentBlock, {
                attributes: true,
                attributeFilter: ['class'],
            });
        }

        // Initialize WebGL overlay
        this.webglLayer = new TableGlassWebGL(this);

        // Physically-based backdrop refraction (Liquid Glass lens, Chromium only).
        // `refraction.target` mounts the lens on an ancestor instead — needed when
        // the visible glass pane (and its backdrop-filter) is a wrapper like
        // .content-block: nesting a second backdrop-filter inside it would break
        // backdrop sampling and darken the pane.
        if (this.options.refraction && this.options.refraction.enabled !== false) {
            try {
                const refractionTarget = this.options.refraction.target
                    ? this.container.closest(this.options.refraction.target) || this.container
                    : this.container;
                this.refractionLayer = new LiquidGlassRefraction(
                    refractionTarget,
                    this.options.refraction
                );
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn('Liquid glass refraction unavailable:', error);
            }
        }

        // Observe DOM mutations in the tbody to catch data refreshes
        // When data refreshes, rows are replaced, making cached row references stale.
        const tbody = this.container.querySelector('tbody');
        if (tbody) {
            // eslint-disable-next-line no-undef
            this.mutationObserver = new MutationObserver(() => this.resize());
            this.mutationObserver.observe(tbody, { childList: true });
        }

        this.initParticles();
        this.resize();
        this.startLoop();

        // Mouse/Touch movement for parallax/interaction
        this._mouseMoveHandler = (e) => this.handleMouseMove(e);
        this._mouseLeaveHandler = () => this.handleMouseLeave();
        this._touchStartHandler = (e) => {
            if (e.touches && e.touches[0]) {
                this.handleMouseMove(e.touches[0]);
            }
        };
        this._touchMoveHandler = (e) => {
            if (e.touches && e.touches[0]) {
                this.handleMouseMove(e.touches[0]);
            }
        };
        // On mobile, touchend preserves the hover state so the pie chart
        // slice highlight persists after lifting a finger from a table row.
        // touchcancel always clears state (e.g. interrupted gestures).
        this._touchEndHandler = () => {
            if (window.innerWidth > UI_BREAKPOINTS.MOBILE) {
                this.handleMouseLeave();
            }
        };
        this._touchCancelHandler = () => this.handleMouseLeave();

        // Pointer events for Chrome mobile compatibility.
        // Chrome fires pointer events instead of touch events in many cases.
        // Only handle touch-type pointers; mouse pointers are handled by mousemove/mouseleave.
        this._pointerDownHandler = (e) => {
            if (e.pointerType === 'touch') {
                this.handleMouseMove(e);
            }
        };
        this._pointerMoveHandler = (e) => {
            if (e.pointerType === 'touch') {
                this.handleMouseMove(e);
            }
        };
        this._pointerUpHandler = (e) => {
            if (e.pointerType === 'touch' && window.innerWidth > UI_BREAKPOINTS.MOBILE) {
                this.handleMouseLeave();
            }
        };
        this._pointerCancelHandler = (e) => {
            if (e.pointerType === 'touch') {
                this.handleMouseLeave();
            }
        };

        this.container.addEventListener('mousemove', this._mouseMoveHandler);
        this.container.addEventListener('mouseleave', this._mouseLeaveHandler);
        this.container.addEventListener('touchstart', this._touchStartHandler, { passive: true });
        this.container.addEventListener('touchmove', this._touchMoveHandler, { passive: true });
        this.container.addEventListener('touchend', this._touchEndHandler, { passive: true });
        this.container.addEventListener('touchcancel', this._touchCancelHandler, { passive: true });
        this.container.addEventListener('pointerdown', this._pointerDownHandler, { passive: true });
        this.container.addEventListener('pointermove', this._pointerMoveHandler, { passive: true });
        this.container.addEventListener('pointerup', this._pointerUpHandler, { passive: true });
        this.container.addEventListener('pointercancel', this._pointerCancelHandler, {
            passive: true,
        });

        this._scrollHandler = () => {
            if (this._scrollable && this.rows && this.rows.length > 0) {
                const canvasRect = this.canvas.getBoundingClientRect();
                for (let i = 0; i < this.rows.length; i++) {
                    const row = this.rows[i];
                    if (row.element) {
                        const rowRect = row.element.getBoundingClientRect();
                        row.top = rowRect.top - canvasRect.top;
                        row.left = rowRect.left - canvasRect.left;
                    }
                }
            }
            if (this.state.lastPointerRaw && this.state.lastPointerRaw.x !== -10) {
                this.handleMouseMove({
                    clientX: this.state.lastPointerRaw.x,
                    clientY: this.state.lastPointerRaw.y,
                });
            }
        };
        this.container.addEventListener('scroll', this._scrollHandler, { passive: true });
    }

    initParticles() {
        const electric = this.options.threeD?.electric || {};
        const count = Math.max(12, (electric.arcCount || 3) * 8);
        // Bolt: Replace Array.from with pre-allocated array and explicit loop to eliminate GC overhead
        this.state.energyParticles = new Array(count);
        for (let i = 0; i < count; i++) {
            this.state.energyParticles[i] = {
                progress: Math.random(), // 0 to 1 along the path
                speed: 0.2 + Math.random() * 0.5,
                size: 1.2 + Math.random() * 1.6,
                flickerOffset: Math.random() * Math.PI * 2,
                offset: (Math.random() - 0.5) * 10, // Perpendicular offset
            };
        }
    }

    resize() {
        if (this.resizePaused) {
            return;
        }

        // Skip resize when container is hidden (display:none via .hidden class).
        // Writing zero dimensions to the canvas would clobber it for the next re-show.
        const contentBlock = this.container.closest('.content-block');
        if (contentBlock && contentBlock.classList.contains('hidden')) {
            this._needsResize = true;
            return;
        }
        this._needsResize = false;

        // Re-check header height on resize if needed
        let headerHeight = 0;
        if (this.options.excludeHeader) {
            const thead = this.container.querySelector('thead');
            headerHeight = thead ? thead.offsetHeight : 0;
            this._headerHeight = headerHeight;
            this.canvas.style.top = `${headerHeight}px`;
        }

        // Re-evaluate whether content actually overflows and update positioning
        const overflowStyle =
            window.getComputedStyle(this.container).overflow +
            window.getComputedStyle(this.container).overflowY;
        const nowScrollable =
            /auto|scroll/.test(overflowStyle) &&
            this.container.scrollHeight > this.container.clientHeight + 1;

        if (nowScrollable !== this._scrollable) {
            this._scrollable = nowScrollable;
            if (this._scrollable) {
                this.canvas.style.position = 'sticky';
                // Move canvas to first child for sticky to work
                if (this.canvas !== this.container.firstChild) {
                    this.container.insertBefore(this.canvas, this.container.firstChild);
                }
                // Keep WebGL canvas right after the 2D canvas so sticky works
                if (this.webglLayer?.canvas) {
                    this.container.insertBefore(this.webglLayer.canvas, this.canvas.nextSibling);
                }
            } else {
                this.canvas.style.position = 'absolute';
                this.canvas.style.marginBottom = '';
            }
        }

        // Use the table's full scroll width if available, otherwise container width
        // This ensures the canvas extends to cover all scrollable content
        const contentWidth = this.table ? this.table.scrollWidth : this.container.scrollWidth;
        // Add a small buffer to prevent pixel-perfect clipping at the very edge
        this.width = Math.max(this.container.clientWidth, contentWidth + 2);

        // Explicitly set style width to match the full content width
        this.canvas.style.width = `${this.width}px`;

        // Keep canvas at visible viewport size (avoids exceeding browser canvas limits)
        // Sticky positioning keeps it pinned during scroll with zero lag
        const visibleHeight = this.container.clientHeight - headerHeight;
        this.height = Math.max(1, visibleHeight);
        this.canvas.style.height = `${this.height}px`;

        // Handle high DPI displays (must be set before WebGL resize)
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);

        if (this.webglLayer) {
            this.webglLayer.resize(this.width, this.height, this.dpr);
        }

        // For sticky canvas, negative margin pulls content up so the canvas doesn't consume layout space
        if (this._scrollable) {
            this.canvas.style.marginBottom = `-${this.height}px`;
        }

        // Track rows for hover effect
        this.rows = [];
        if (this.options.rowHoverEffect?.enabled) {
            const tbody = this.container.querySelector('tbody');
            if (tbody) {
                const rows = tbody.querySelectorAll('tr');

                // We need the canvas position to calculate relative row offsets accurately
                const canvasRect = this.canvas.getBoundingClientRect();

                // Build data rows array, filtering out header/footer rows
                const tempRows = [];
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (!isDataRow(row)) {
                        continue;
                    }
                    const rowRect = row.getBoundingClientRect();

                    // Calculate top and left relative to the canvas itself
                    // This handles all offset/header/padding logic implicitly because
                    // we simply ask "where is the row relative to the canvas?"
                    const relativeTop = rowRect.top - canvasRect.top;
                    const relativeLeft = rowRect.left - canvasRect.left;

                    tempRows.push({
                        top: relativeTop,
                        left: relativeLeft,
                        width: rowRect.width,
                        height: rowRect.height,
                        element: row,
                    });
                }
                this.rows = tempRows;
            }
        }
    }
    handleMouseMove(e) {
        if (!this.state.lastPointerRaw) {
            this.state.lastPointerRaw = { x: -10, y: -10 };
        }
        this.state.lastPointerRaw.x = e.clientX;
        this.state.lastPointerRaw.y = e.clientY;

        const rect = this.container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        this.state.pointer.x = x * 2; // -1 to 1
        this.state.pointer.y = y * 2; // -1 to 1

        // Determine hovered row by finding actual element under cursor
        if (this.options.rowHoverEffect?.enabled) {
            // Find the actual row element under the mouse cursor
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            if (elementUnderMouse) {
                // Find the closest table row
                const rowElement = elementUnderMouse.closest('tr');

                if (rowElement && this.container.contains(rowElement) && isDataRow(rowElement)) {
                    // Find the index of this row in our stored rows array
                    let foundIndex = -1;
                    for (let i = 0; i < this.rows.length; i++) {
                        if (this.rows[i].element === rowElement) {
                            foundIndex = i;
                            break;
                        }
                    }
                    if (this.state.hoveredRowIndex === -1) {
                        this.state.pointerSmoothed.x = this.state.pointer.x;
                        this.state.pointerSmoothed.y = this.state.pointer.y;
                    }
                    if (this.state.hoveredRowIndex !== foundIndex) {
                        this.state.hoveredRowIndex = foundIndex;
                        this.state.lastHoveredRowIndex = foundIndex;
                        if (typeof this.options.onHoverRow === 'function') {
                            const ticker =
                                this.rows[foundIndex]?.element?.getAttribute('data-ticker');
                            this.options.onHoverRow(ticker || null);
                        }
                    }
                } else if (this.state.hoveredRowIndex !== -1) {
                    this.state.hoveredRowIndex = -1;
                    if (typeof this.options.onHoverRow === 'function') {
                        this.options.onHoverRow(null);
                    }
                }
            } else if (this.state.hoveredRowIndex !== -1) {
                this.state.hoveredRowIndex = -1;
                if (typeof this.options.onHoverRow === 'function') {
                    this.options.onHoverRow(null);
                }
            }
        }
    }

    handleMouseLeave() {
        if (!this.state.lastPointerRaw) {
            this.state.lastPointerRaw = { x: -10, y: -10 };
        }
        this.state.lastPointerRaw.x = -10;
        this.state.lastPointerRaw.y = -10;

        // Move pointer far off-screen so WebGL and Canvas trails don't freeze in the center
        this.state.pointer.x = -10;
        this.state.pointer.y = -10;
        if (this.state.hoveredRowIndex !== -1) {
            this.state.hoveredRowIndex = -1;
            if (typeof this.options.onHoverRow === 'function') {
                this.options.onHoverRow(null);
            }
        }
    }

    startLoop() {
        const loop = (time) => {
            this.update(time);
            this.draw();
            this.animationFrame = requestAnimationFrame(loop);
        };
        this.animationFrame = requestAnimationFrame(loop);
    }

    update(time) {
        if (!this.state.lastTime) {
            this.state.lastTime = time;
        }
        const delta = (time - this.state.lastTime) / 1000;
        this.state.lastTime = time;

        const speed = this.options.threeD?.reflection?.speed || 0.05;
        this.state.phase = (this.state.phase + delta * speed) % 1;
        this.state.continuousPhase += delta * speed;
        this.state.ambientPhase = (this.state.ambientPhase + delta * 0.5) % 1;

        // Smooth pointer
        const damping = 0.1;
        this.state.pointerSmoothed.x +=
            (this.state.pointer.x - this.state.pointerSmoothed.x) * damping;
        this.state.pointerSmoothed.y +=
            (this.state.pointer.y - this.state.pointerSmoothed.y) * damping;

        // Calculate pointer velocity (only if mouse is actively hovering and not leave/reset)
        let instantVelocity = 0;
        if (
            this.state.hoveredRowIndex !== -1 &&
            this.state.lastPointer &&
            this.state.pointer.x !== -10
        ) {
            const dx = this.state.pointer.x - this.state.lastPointer.x;
            const dy = this.state.pointer.y - this.state.lastPointer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            instantVelocity = delta > 0 ? dist / delta : 0;
        }

        const velocityDamping = 0.1;
        if (this.state.pointerVelocity === undefined) {
            this.state.pointerVelocity = 0;
        }
        this.state.pointerVelocity +=
            (instantVelocity - this.state.pointerVelocity) * velocityDamping;

        if (!this.state.lastPointer) {
            this.state.lastPointer = { x: 0, y: 0 };
        }
        this.state.lastPointer.x = this.state.pointer.x;
        this.state.lastPointer.y = this.state.pointer.y;

        // Update spotlight alpha transition
        if (this.state.spotlightAlpha === undefined) {
            this.state.spotlightAlpha = 0;
        }
        const targetAlpha = this.state.hoveredRowIndex !== -1 ? 1.0 : 0.0;
        const alphaSpeed = this.state.hoveredRowIndex !== -1 ? 5.0 : 3.0; // Fast fade-in, slightly slower fade-out
        this.state.spotlightAlpha += (targetAlpha - this.state.spotlightAlpha) * delta * alphaSpeed;
        this.state.spotlightAlpha = Math.max(0.0, Math.min(1.0, this.state.spotlightAlpha));

        // Update particles
        const particles = this.state.energyParticles;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.progress = (p.progress + delta * p.speed * 0.5) % 1;
        }
    }

    draw() {
        // Deferred resize: content-block was hidden during init/resize, now visible
        if (this._needsResize) {
            const cb = this.container.closest('.content-block');
            if (!cb || !cb.classList.contains('hidden')) {
                this._needsResize = false;
                this.resize();
            }
        }

        // Nothing to draw until resize() has set dimensions
        if (!this.width || !this.height) {
            return;
        }

        this.ctx.clearRect(0, 0, this.width, this.height);

        const radius = this.options.excludeHeader ? 0 : 8; // Border radius

        // Draw effects
        this.drawAmbientGlow(radius);
        this.drawRowHoverEffect(); // New effect
        this.drawElectricTrails(radius);
        this.drawParticles(radius);
        this.drawReflection(radius);

        // Whole Pane Caustic Grid & Rim (WebGL Fluid Overlay)
        if (this.webglLayer) {
            this.webglLayer.draw(
                this.state,
                this.options,
                this.width,
                this.height,
                this.dpr,
                this.rows
            );
        }
    }

    drawRowHoverEffect() {
        if (!this.options.rowHoverEffect?.enabled || !this.rows) {
            return;
        }

        const activeIndex =
            this.state.hoveredRowIndex !== -1
                ? this.state.hoveredRowIndex
                : this.state.lastHoveredRowIndex;
        if (activeIndex === undefined || activeIndex === -1) {
            return;
        }

        const alpha = this.state.spotlightAlpha !== undefined ? this.state.spotlightAlpha : 1.0;
        if (alpha < 0.001) {
            return;
        }

        const row = this.rows[activeIndex];
        if (!row) {
            return;
        }

        const rowTopRelativeToCanvas = row.top;
        const actualHeight = row.height;
        const rowLeft = row.left;
        const actualWidth = row.width;

        const settings = this.options.rowHoverEffect;

        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.globalCompositeOperation = 'source-over';

        // Mouse relative to canvas (using smoothed pointer for smooth physical chase)
        const mouseX = ((this.state.pointerSmoothed.x + 1) / 2) * this.width;

        const spotlightRadius = settings.spotlightRadius || 300;

        // 1. Hovered Row Spotlight Background
        const gradient = this.ctx.createRadialGradient(
            mouseX,
            rowTopRelativeToCanvas + actualHeight / 2,
            0,
            mouseX,
            rowTopRelativeToCanvas + actualHeight / 2,
            spotlightRadius
        );
        gradient.addColorStop(0, settings.color || 'rgba(255, 255, 255, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(rowLeft, rowTopRelativeToCanvas, actualWidth, actualHeight);

        // 2. Hovered Row Border Reveal
        const borderGradient = this.ctx.createRadialGradient(
            mouseX,
            rowTopRelativeToCanvas + actualHeight / 2,
            0,
            mouseX,
            rowTopRelativeToCanvas + actualHeight / 2,
            spotlightRadius * 0.8
        );
        borderGradient.addColorStop(0, settings.borderColor || 'rgba(255, 255, 255, 0.2)');
        borderGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.strokeStyle = borderGradient;
        this.ctx.lineWidth = 1;

        // Draw top and bottom border of the currently hovered row (subtle physical 2D border)
        this.ctx.beginPath();
        this.ctx.moveTo(rowLeft, rowTopRelativeToCanvas);
        this.ctx.lineTo(rowLeft + actualWidth, rowTopRelativeToCanvas);
        this.ctx.moveTo(rowLeft, rowTopRelativeToCanvas + actualHeight);
        this.ctx.lineTo(rowLeft + actualWidth, rowTopRelativeToCanvas + actualHeight);
        this.ctx.stroke();

        this.ctx.restore();
    }

    // Helper to get point along rounded rectangle path
    // Helper to get point along rounded rectangle path
    getPointAtProgressZeroRadius(progress) {
        const w = this.width;
        const h = this.height;
        const perimeter = 2 * w + 2 * h;
        const dist = progress * perimeter;
        if (dist <= w) {
            return { x: dist, y: 0 };
        }
        if (dist <= w + h) {
            return { x: w, y: dist - w };
        }
        if (dist <= 2 * w + h) {
            return { x: w - (dist - (w + h)), y: h };
        }
        return { x: 0, y: h - (dist - (2 * w + h)) };
    }

    getPointAtProgress(progress, radius) {
        progress = progress % 1;
        if (progress < 0) {
            progress += 1;
        }

        if (radius === 0) {
            return this.getPointAtProgressZeroRadius(progress);
        }

        // ⚡ Bolt: Inline mathematical calculations inside high-frequency
        // animation loops to eliminate Array.reduce and object generation GC pressure.
        const w = this.width;
        const h = this.height;
        const cornerLen = 0.5 * Math.PI * radius;
        const lineW = w - 2 * radius;
        const lineH = h - 2 * radius;
        const perimeter = 2 * lineW + 2 * lineH + 4 * cornerLen;

        let dist = progress * perimeter;

        if (dist <= lineW) {
            return { x: radius + dist, y: 0 };
        }
        dist -= lineW;

        if (dist <= cornerLen) {
            const angle = -Math.PI / 2 + (dist / cornerLen) * (Math.PI / 2);
            return {
                x: w - radius + Math.cos(angle) * radius,
                y: radius + Math.sin(angle) * radius,
            };
        }
        dist -= cornerLen;

        if (dist <= lineH) {
            return { x: w, y: radius + dist };
        }
        dist -= lineH;

        if (dist <= cornerLen) {
            const angle = (dist / cornerLen) * (Math.PI / 2);
            return {
                x: w - radius + Math.cos(angle) * radius,
                y: h - radius + Math.sin(angle) * radius,
            };
        }
        dist -= cornerLen;

        if (dist <= lineW) {
            return { x: w - radius - dist, y: h };
        }
        dist -= lineW;

        if (dist <= cornerLen) {
            const angle = Math.PI / 2 + (dist / cornerLen) * (Math.PI / 2);
            return {
                x: radius + Math.cos(angle) * radius,
                y: h - radius + Math.sin(angle) * radius,
            };
        }
        dist -= cornerLen;

        if (dist <= lineH) {
            return { x: 0, y: h - radius - dist };
        }
        dist -= lineH;

        const angle = Math.PI + (dist / cornerLen) * (Math.PI / 2);
        return {
            x: radius + Math.cos(angle) * radius,
            y: radius + Math.sin(angle) * radius,
        };
    }

    // Better path follower that respects corners
    drawPath(ctx, radius) {
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(this.width - radius, 0);
        ctx.quadraticCurveTo(this.width, 0, this.width, radius);
        ctx.lineTo(this.width, this.height - radius);
        ctx.quadraticCurveTo(this.width, this.height, this.width - radius, this.height);
        ctx.lineTo(radius, this.height);
        ctx.quadraticCurveTo(0, this.height, 0, this.height - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();
    }

    drawAmbientGlow(radius) {
        const glow = this.options.threeD?.ambientGlow || {};
        const pulse = 0.5 + 0.5 * Math.sin(this.state.ambientPhase * Math.PI * 2);

        this.ctx.save();
        this.drawPath(this.ctx, radius);
        this.ctx.clip();

        // Inner glow
        const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
        gradient.addColorStop(0, glow.innerColor || 'rgba(118, 183, 229, 0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        this.ctx.globalAlpha = (glow.innerOpacity || 0.15) * (0.8 + pulse * 0.2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        this.ctx.restore();
    }

    drawElectricTrails(radius) {
        const electric = this.options.threeD?.electric || {};
        if (electric.enabled === false) {
            return;
        }

        const colors = electric.colors || {};
        const rawPalette = [colors.primary, colors.secondary, colors.tertiary];
        let validPaletteCount = 0;
        for (let i = 0; i < rawPalette.length; i++) {
            if (rawPalette[i]) {
                validPaletteCount++;
            }
        }

        let activePalette = rawPalette;
        let activePaletteLength = validPaletteCount;

        if (validPaletteCount === 0) {
            activePalette = ['rgba(255, 255, 255, 0.4)'];
            activePaletteLength = 1;
        }

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen'; // Softer than lighter
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = electric.arcThickness || 1.5;

        const trailWidth = electric.width || 0.1;
        const segments = 30; // More segments for smoother gradient

        let paletteIdx = 0;
        for (let i = 0; i < activePalette.length; i++) {
            const color = activePalette[i];
            if (!color) {
                continue;
            }

            const offset =
                paletteIdx / activePaletteLength +
                this.state.continuousPhase * (electric.streakSpeedMultiplier || 1);
            const headProgress = offset % 1;

            // Subtle shadow
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 5;

            // Draw trail as segments
            for (let j = 0; j < segments; j++) {
                const segmentProgress = j / segments; // 0 to 1
                const p1 = headProgress - segmentProgress * trailWidth;
                const p2 = headProgress - ((j + 1) / segments) * trailWidth;

                const point1 = this.getPointAtProgress(p1, radius);
                const point2 = this.getPointAtProgress(p2, radius);

                // Smooth fade out
                // Use a power curve for more elegant falloff
                const opacity = Math.pow(1 - segmentProgress, 2);

                // Parse color to apply opacity
                // Assuming color is rgba or hex, but for simplicity let's rely on globalAlpha
                // and the fact that the palette colors might already have alpha.
                // Best to use the base color and apply alpha.

                this.ctx.globalAlpha = opacity;
                this.ctx.strokeStyle = color;

                this.ctx.beginPath();
                this.ctx.moveTo(point1.x, point1.y);
                this.ctx.lineTo(point2.x, point2.y);
                this.ctx.stroke();
            }
            paletteIdx++;
        }

        this.ctx.restore();
    }

    drawParticles(radius) {
        const electric = this.options.threeD?.electric || {};
        if (electric.particlesEnabled === false) {
            return;
        }

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';

        const particles = this.state.energyParticles;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            // Only draw path particles (those without 'life' property)
            if (p.life !== undefined) {
                continue;
            }

            const pos = this.getPointAtProgress(p.progress, radius);

            // Add some jitter/offset
            const flicker = 0.5 + 0.5 * Math.sin(this.state.phase * 10 + p.flickerOffset);

            this.ctx.fillStyle = electric.colors?.primary || 'rgba(255, 255, 255, 0.8)';
            this.ctx.shadowColor = this.ctx.fillStyle;
            this.ctx.shadowBlur = 3 * flicker; // Reduced blur

            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, p.size * flicker, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    drawReflection(radius) {
        const reflection = this.options.threeD?.reflection || {};
        const intensity = reflection.intensity || 0.5;
        const color = reflection.color || 'rgba(255,255,255,1)';
        const width = reflection.width || 0.2;
        const fadeZone = reflection.fadeZone || 0.15; // Configurable fade zone

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'overlay';

        // Diagonal sweep
        const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);

        const phase = this.state.phase;
        const start = phase - width;
        const end = phase + width;

        // Calculate fade multiplier for smooth wrap
        // Fade out when approaching 1, fade in when starting from 0
        let fadeMultiplier = 1.0;
        if (phase > 1 - fadeZone) {
            // Fade out: goes from 1 to 0 as phase goes from (1-fadeZone) to 1
            fadeMultiplier = (1.0 - phase) / fadeZone;
        } else if (phase < fadeZone) {
            // Fade in: goes from 0 to 1 as phase goes from 0 to fadeZone
            fadeMultiplier = phase / fadeZone;
        }

        // Parse color to apply intensity/alpha
        // If color is rgba, we can just use it directly if we assume the user handles alpha,
        // OR we can try to inject intensity.
        // For simplicity and flexibility, let's assume 'color' is the peak color (e.g. white)
        // and we modulate opacity via stop colors.

        // Actually, 'overlay' blend mode works best with white/grey.
        // Let's stick to the existing logic but allow color override.
        // If the user provides a color, we use it.
        // We need transparent versions of that color for the edges.

        // Helper to get transparent version of a color
        // This is tricky without a full color parser.
        // Let's assume the user provides an rgba string or we default to white.

        // If we just use globalAlpha, it might be easier.
        this.ctx.globalAlpha = intensity * fadeMultiplier;

        gradient.addColorStop(Math.max(0, start), 'rgba(255,255,255,0)'); // Start transparent
        gradient.addColorStop(Math.max(0, Math.min(1, phase)), color); // Peak color
        gradient.addColorStop(Math.min(1, end), 'rgba(255,255,255,0)'); // End transparent

        this.ctx.fillStyle = gradient;
        this.drawPath(this.ctx, radius);
        this.ctx.fill();

        this.ctx.restore();
    }

    dispose() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.webglLayer) {
            this.webglLayer.dispose();
            this.webglLayer = null;
        }
        if (this.refractionLayer) {
            this.refractionLayer.dispose();
            this.refractionLayer = null;
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
        if (this._contentBlockObserver) {
            this._contentBlockObserver.disconnect();
        }
        if (this.container) {
            this.container.removeEventListener('mousemove', this._mouseMoveHandler);
            this.container.removeEventListener('mouseleave', this._mouseLeaveHandler);
            this.container.removeEventListener('touchstart', this._touchStartHandler);
            this.container.removeEventListener('touchmove', this._touchMoveHandler);
            this.container.removeEventListener('touchend', this._touchEndHandler);
            this.container.removeEventListener('touchcancel', this._touchCancelHandler);
            this.container.removeEventListener('pointerdown', this._pointerDownHandler);
            this.container.removeEventListener('pointermove', this._pointerMoveHandler);
            this.container.removeEventListener('pointerup', this._pointerUpHandler);
            this.container.removeEventListener('pointercancel', this._pointerCancelHandler);
            if (this._scrollHandler) {
                this.container.removeEventListener('scroll', this._scrollHandler);
            }
            if (this.canvas && this.canvas.parentElement) {
                this.canvas.parentElement.removeChild(this.canvas);
            }
            this.container.glassEffect = null;
        }
        this.ctx = null;
        this.canvas = null;
    }
}

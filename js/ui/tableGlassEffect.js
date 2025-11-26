import { PIE_CHART_GLASS_EFFECT } from '@js/config.js';

export class TableGlassEffect {
    constructor(containerSelector, options = {}) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) {
            throw new Error(`Container not found: ${containerSelector}`);
        }

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
        };

        this.init();
    }

    init() {
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.pointerEvents = 'none'; // Let clicks pass through
        this.canvas.style.zIndex = '-1'; // Behind content
        this.canvas.style.borderRadius = '8px'; // Match container radius

        // Handle header exclusion
        if (this.options.excludeHeader) {
            // Try to find the header height
            const thead = this.container.querySelector('thead');
            const headerHeight = thead ? thead.offsetHeight : 0;
            this.canvas.style.top = `${headerHeight}px`;
            this.canvas.style.height = `calc(100% - ${headerHeight}px)`;
            this.canvas.style.borderRadius = '0'; // Sharp corners when confined to body
        } else {
            this.canvas.style.top = '0';
            this.canvas.style.height = '100%';
            this.canvas.style.borderRadius = '8px'; // Match container radius
        }

        // Ensure container is relative so canvas is positioned correctly
        const computedStyle = window.getComputedStyle(this.container);
        if (computedStyle.position === 'static') {
            this.container.style.position = 'relative';
        }

        this.container.appendChild(this.canvas);

        // Observe container size changes
        // eslint-disable-next-line no-undef
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);

        this.initParticles();
        this.resize();
        this.startLoop();

        // Mouse movement for parallax/interaction
        this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.container.addEventListener('mouseleave', () => this.handleMouseLeave());
    }

    initParticles() {
        const electric = this.options.threeD?.electric || {};
        const count = Math.max(12, (electric.arcCount || 3) * 8);
        this.state.energyParticles = Array.from({ length: count }, () => ({
            progress: Math.random(), // 0 to 1 along the path
            speed: 0.2 + Math.random() * 0.5,
            size: 1.2 + Math.random() * 1.6,
            flickerOffset: Math.random() * Math.PI * 2,
            offset: (Math.random() - 0.5) * 10, // Perpendicular offset
        }));
    }

    resize() {
        // Re-check header height on resize if needed
        if (this.options.excludeHeader) {
            const thead = this.container.querySelector('thead');
            const headerHeight = thead ? thead.offsetHeight : 0;
            this.canvas.style.top = `${headerHeight}px`;
            this.canvas.style.height = `calc(100% - ${headerHeight}px)`;
        }

        const rect = this.container.getBoundingClientRect();
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;

        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.scale(dpr, dpr);

        // Track rows for hover effect
        this.rows = [];
        if (this.options.rowHoverEffect?.enabled) {
            const tbody = this.container.querySelector('tbody');
            if (tbody) {
                const rows = tbody.querySelectorAll('tr');
                const canvasTop = this.options.excludeHeader
                    ? parseFloat(this.canvas.style.top)
                    : 0;

                rows.forEach((row) => {
                    const rowRect = row.getBoundingClientRect();
                    // Calculate relative position to the canvas
                    // Canvas is at (rect.left, rect.top + canvasTop)
                    // Row is at (rowRect.left, rowRect.top)
                    // Relative Y = rowRect.top - (rect.top + canvasTop)

                    this.rows.push({
                        top: rowRect.top - rect.top - canvasTop,
                        height: rowRect.height,
                        element: row,
                    });
                });
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        this.state.pointer.x = x * 2; // -1 to 1
        this.state.pointer.y = y * 2; // -1 to 1

        // Determine hovered row
        if (this.options.rowHoverEffect?.enabled && this.rows) {
            const canvasTop = this.options.excludeHeader ? parseFloat(this.canvas.style.top) : 0;
            const mouseY = e.clientY - rect.top - canvasTop;

            this.state.hoveredRowIndex = this.rows.findIndex(
                (row) => mouseY >= row.top && mouseY <= row.top + row.height
            );
        }
    }

    handleMouseLeave() {
        this.state.pointer.x = 0;
        this.state.pointer.y = 0;
        this.state.hoveredRowIndex = -1;
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

        // Update particles
        this.state.energyParticles.forEach((p) => {
            p.progress = (p.progress + delta * p.speed * 0.5) % 1;
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        const radius = this.options.excludeHeader ? 0 : 8; // Border radius

        // Draw effects
        this.drawAmbientGlow(radius);
        this.drawRowHoverEffect(); // New effect
        this.drawElectricTrails(radius);
        this.drawParticles(radius);
        this.drawReflection(radius);
    }

    drawRowHoverEffect() {
        if (
            !this.options.rowHoverEffect?.enabled ||
            this.state.hoveredRowIndex === -1 ||
            !this.rows
        ) {
            return;
        }

        const row = this.rows[this.state.hoveredRowIndex];
        if (!row) {
            return;
        }

        const settings = this.options.rowHoverEffect;

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen'; // Softer blending

        // Calculate mouse X relative to canvas
        // pointer.x is -1 to 1. Convert back to pixels.
        const mouseX = ((this.state.pointer.x + 1) / 2) * this.width;
        const spotlightRadius = settings.spotlightRadius || 300;

        // 1. Spotlight Background (Radial Gradient)
        // Center the gradient on the mouse X, but vertically centered on the row
        const gradient = this.ctx.createRadialGradient(
            mouseX,
            row.top + row.height / 2,
            0,
            mouseX,
            row.top + row.height / 2,
            spotlightRadius
        );

        gradient.addColorStop(0, settings.color || 'rgba(255, 255, 255, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, row.top, this.width, row.height);

        // 2. Border Reveal (Masked by the same spotlight gradient)
        // We want the borders to be visible only near the mouse

        const borderGradient = this.ctx.createRadialGradient(
            mouseX,
            row.top + row.height / 2,
            0,
            mouseX,
            row.top + row.height / 2,
            spotlightRadius * 0.8
        );
        borderGradient.addColorStop(0, settings.borderColor || 'rgba(255, 255, 255, 0.2)');
        borderGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.strokeStyle = borderGradient;
        this.ctx.lineWidth = 1;

        // Top border
        this.ctx.beginPath();
        this.ctx.moveTo(0, row.top);
        this.ctx.lineTo(this.width, row.top);
        this.ctx.stroke();

        // Bottom border
        this.ctx.beginPath();
        this.ctx.moveTo(0, row.top + row.height);
        this.ctx.lineTo(this.width, row.top + row.height);
        this.ctx.stroke();

        this.ctx.restore();
    }

    // Helper to get point along rounded rectangle path
    // Helper to get point along rounded rectangle path
    getPointAtProgress(progress, radius) {
        // Ensure progress is 0-1
        progress = progress % 1;
        if (progress < 0) {
            progress += 1;
        }

        const w = this.width;
        const h = this.height;

        // If radius is 0, simplify
        if (radius === 0) {
            const perimeter = 2 * w + 2 * h;
            const dist = progress * perimeter;
            if (dist <= w) {
                return { x: dist, y: 0 };
            } // Top
            if (dist <= w + h) {
                return { x: w, y: dist - w };
            } // Right
            if (dist <= 2 * w + h) {
                return { x: w - (dist - (w + h)), y: h };
            } // Bottom
            return { x: 0, y: h - (dist - (2 * w + h)) }; // Left
        }

        // Corner length (quarter circle)
        const cornerLen = 0.5 * Math.PI * radius;
        // Straight lengths
        const topLen = w - 2 * radius;
        const rightLen = h - 2 * radius;
        const bottomLen = w - 2 * radius;
        const leftLen = h - 2 * radius;

        const perimeter = 2 * topLen + 2 * rightLen + 4 * cornerLen;
        const dist = progress * perimeter;

        let currentDist = 0;

        // Top
        if (dist <= topLen) {
            return { x: radius + dist, y: 0 };
        }
        currentDist += topLen;

        // Top-Right Corner
        if (dist <= currentDist + cornerLen) {
            const angle = -Math.PI / 2 + ((dist - currentDist) / cornerLen) * (Math.PI / 2);
            return {
                x: w - radius + Math.cos(angle) * radius,
                y: radius + Math.sin(angle) * radius,
            };
        }
        currentDist += cornerLen;

        // Right
        if (dist <= currentDist + rightLen) {
            return { x: w, y: radius + (dist - currentDist) };
        }
        currentDist += rightLen;

        // Bottom-Right Corner
        if (dist <= currentDist + cornerLen) {
            const angle = 0 + ((dist - currentDist) / cornerLen) * (Math.PI / 2);
            return {
                x: w - radius + Math.cos(angle) * radius,
                y: h - radius + Math.sin(angle) * radius,
            };
        }
        currentDist += cornerLen;

        // Bottom
        if (dist <= currentDist + bottomLen) {
            return { x: w - radius - (dist - currentDist), y: h };
        }
        currentDist += bottomLen;

        // Bottom-Left Corner
        if (dist <= currentDist + cornerLen) {
            const angle = Math.PI / 2 + ((dist - currentDist) / cornerLen) * (Math.PI / 2);
            return {
                x: radius + Math.cos(angle) * radius,
                y: h - radius + Math.sin(angle) * radius,
            };
        }
        currentDist += cornerLen;

        // Left
        if (dist <= currentDist + leftLen) {
            return { x: 0, y: h - radius - (dist - currentDist) };
        }
        currentDist += leftLen;

        // Top-Left Corner
        const angle = Math.PI + ((dist - currentDist) / cornerLen) * (Math.PI / 2);
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
        const palette = [colors.primary, colors.secondary, colors.tertiary].filter(Boolean);
        if (!palette.length) {
            palette.push('rgba(255, 255, 255, 0.4)');
        }

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen'; // Softer than lighter
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = electric.arcThickness || 1.5;

        const trailWidth = electric.width || 0.1;
        const segments = 30; // More segments for smoother gradient

        palette.forEach((color, i) => {
            const offset =
                i / palette.length +
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
        });

        this.ctx.restore();
    }

    drawParticles(radius) {
        const electric = this.options.threeD?.electric || {};
        if (electric.particlesEnabled === false) {
            return;
        }

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';

        this.state.energyParticles.forEach((p) => {
            // Only draw path particles (those without 'life' property)
            if (p.life !== undefined) {
                return;
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
        });

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
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}

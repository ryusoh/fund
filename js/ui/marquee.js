import { MARQUEE_CONFIG } from '../config.js';

const GRAVITY = {
    influenceRadius: 350,
    pullStrength: 55,
    pushStrength: 22,
    scaleBoost: 0.35,
    yDamping: 0.6,
    spacingCompress: 0.6, // max fraction of width to squeeze (0.6 = 60% narrower at center)
};

export function initMarquee() {
    if (typeof window === 'undefined' || !window.gsap || !MARQUEE_CONFIG.enabled) {
        return;
    }
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
        return;
    }

    const widget = document.querySelector('.quantum-widget');
    const mWrappers = document.querySelectorAll('.marquee-container');
    const multiplier = MARQUEE_CONFIG.sizeMultiplier || 1;
    const charGroups = [];

    mWrappers.forEach((wrapper) => {
        const content = wrapper.querySelector('.marquee-content');
        if (!content) {
            return;
        }
        if (multiplier !== 1) {
            content.style.fontSize = `${multiplier * 100}%`;
        }

        if (widget) {
            splitIntoChars(content);
        }

        const clone = content.cloneNode(true);
        wrapper.appendChild(clone);

        const configDirection = MARQUEE_CONFIG.direction || 1;
        const elementDirection = wrapper.classList.contains('marquee-right') ? 1 : -1;
        const direction = configDirection * elementDirection;

        if (widget) {
            const spans = Array.from(wrapper.querySelectorAll('.mq-char'));
            charGroups.push({ spans, direction });
        }

        window.gsap.to(wrapper.children, {
            xPercent: -100 * direction,
            ease: 'none',
            duration: MARQUEE_CONFIG.animationDuration || 20,
            repeat: -1,
            modifiers: {
                xPercent: window.gsap.utils.wrap(-100, 0),
            },
        });
    });

    if (widget && charGroups.length > 0) {
        initGravitationalDistortion(widget, charGroups);
    }
}

function splitIntoChars(contentEl) {
    const originalSpan = contentEl.querySelector('span');
    if (!originalSpan) {
        return;
    }
    const text = originalSpan.textContent;
    const fragment = document.createDocumentFragment();
    for (const char of text) {
        const s = document.createElement('span');
        if (char === ' ') {
            s.className = 'mq-char mq-space';
            s.textContent = '\u00A0';
        } else {
            s.className = 'mq-char';
            s.textContent = char;
        }
        fragment.appendChild(s);
    }
    originalSpan.replaceWith(fragment);
}

function initGravitationalDistortion(widget, charGroups) {
    const { influenceRadius, pullStrength, pushStrength, scaleBoost, yDamping, spacingCompress } =
        GRAVITY;
    const radiusSq = influenceRadius * influenceRadius;

    window.gsap.ticker.add(() => {
        const wRect = widget.getBoundingClientRect();
        if (wRect.width === 0) {
            return;
        }
        const wcx = wRect.left + wRect.width / 2;
        const wcy = wRect.top + wRect.height / 2;

        for (const { spans, direction } of charGroups) {
            // Batch read all positions first to avoid layout thrashing
            const positions = new Array(spans.length);
            for (let i = 0; i < spans.length; i += 1) {
                const r = spans[i].getBoundingClientRect();
                positions[i] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }

            // Batch write transforms
            for (let i = 0; i < spans.length; i += 1) {
                const dx = wcx - positions[i].x;
                const dy = wcy - positions[i].y;
                const distSq = dx * dx + dy * dy;

                if (distSq >= radiusSq || distSq < 1) {
                    if (spans[i].style.transform) {
                        spans[i].style.transform = '';
                        spans[i].style.marginLeft = '';
                        spans[i].style.marginRight = '';
                    }
                    continue;
                }

                const dist = Math.sqrt(distSq);
                const t = 1 - dist / influenceRadius;
                const strength = t * t * t; // cubic falloff

                // Text moving left (direction < 0): chars right of center are approaching
                // Text moving right (direction > 0): chars left of center are approaching
                const isApproaching = (direction < 0 && dx > 0) || (direction > 0 && dx < 0);

                const force = isApproaching ? pullStrength : -pushStrength;
                const nx = dx / dist;
                const ny = dy / dist;
                const tx = nx * strength * force;
                const ty = ny * strength * Math.abs(force) * yDamping;
                const s = isApproaching
                    ? 1 + strength * scaleBoost
                    : 1 - strength * scaleBoost * 0.25;

                // Compress spacing — negative margins pull chars together near center
                const squeeze = strength * spacingCompress * 0.5;
                spans[i].style.marginLeft = `${(-squeeze).toFixed(2)}em`;
                spans[i].style.marginRight = `${(-squeeze).toFixed(2)}em`;

                spans[i].style.transform =
                    `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(3)})`;
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarquee);
} else {
    initMarquee();
}

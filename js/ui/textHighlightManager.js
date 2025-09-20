/* istanbul ignore file */
const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_OPTIONS = Object.freeze({
    className: 'text-shimmer',
});

const DEFAULT_THINKING_CONFIG = Object.freeze({
    intervalMs: 140,
    baseColor: 'rgba(255, 255, 255, 0.95)',
    dimColor: 'rgba(110, 220, 210, 0.75)',
    waveSize: 1,
    disableAnimation: false,
});

const THINKING_REGISTRY = new WeakMap();

function getWindow() {
    return typeof window !== 'undefined' ? window : null;
}

function scheduleFrame(callback) {
    const w = getWindow();
    if (w && typeof w.requestAnimationFrame === 'function') {
        return w.requestAnimationFrame(callback);
    }
    return setTimeout(() => callback(Date.now()), 16);
}

function cancelFrame(handle) {
    const w = getWindow();
    if (w && typeof w.cancelAnimationFrame === 'function') {
        w.cancelAnimationFrame(handle);
    } else {
        clearTimeout(handle);
    }
}

function prefersReducedMotion() {
    const w = getWindow();
    if (!w || typeof w.matchMedia !== 'function') {
        return false;
    }
    try {
        return w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

function normalizeTargets(target) {
    if (!target) {
        return [];
    }

    if (Array.isArray(target)) {
        const nodes = [];
        target.forEach((item) => {
            nodes.push(...normalizeTargets(item));
        });
        return nodes;
    }

    if (typeof target.each === 'function') {
        const nodes = [];
        target.each(function collectNodes() {
            if (this && this.nodeType === 1) {
                nodes.push(this);
            }
        });
        return nodes;
    }

    if (typeof target.node === 'function') {
        const node = target.node();
        return node ? [node] : [];
    }

    if (target.nodeType === 1) {
        return [target];
    }

    return [];
}

/**
 * Applies or removes the shimmer highlight class from the provided target(s).
 * The function accepts DOM elements, d3 selections, or arrays of DOM elements.
 *
 * @param {Element|Array<Element>|Object} target - Target node(s) or d3 selection.
 * @param {boolean} shouldHighlight - When true the highlight class is added, otherwise removed.
 * @param {object} [options]
 * @param {string} [options.className='text-shimmer'] - CSS class to toggle.
 */
export function setHighlightState(target, shouldHighlight, options = DEFAULT_OPTIONS) {
    const { className = DEFAULT_OPTIONS.className } = options || DEFAULT_OPTIONS;
    const nodes = normalizeTargets(target);

    nodes.forEach((node) => {
        if (!node || !node.classList) {
            return;
        }
        if (shouldHighlight) {
            node.classList.add(className);
        } else {
            node.classList.remove(className);
        }
    });
}

/**
 * Convenience helper to apply both foreground (text) and background shimmer highlights.
 *
 * @param {Element|Array<Element>|Object} textTarget
 * @param {Element|Array<Element>|Object} backgroundTarget
 * @param {boolean} shouldHighlight
 */
export function setCompositeHighlight(textTarget, backgroundTarget, shouldHighlight) {
    setHighlightState(textTarget, shouldHighlight, { className: 'text-shimmer' });
    setHighlightState(backgroundTarget, shouldHighlight, { className: 'text-shimmer-bg' });
}

export const HIGHLIGHT_CLASSES = Object.freeze({
    text: 'text-shimmer',
    background: 'text-shimmer-bg',
});

function createCharacterNodes(node, baseText, baseColor) {
    const characters = Array.from(baseText);
    const created = [];
    node.textContent = '';
    const fragment = node.ownerDocument.createDocumentFragment();
    characters.forEach((char, index) => {
        const child = node.ownerDocument.createElementNS(node.namespaceURI || SVG_NS, 'tspan');
        child.textContent = char;
        child.setAttribute('class', 'text-thinking-char');
        child.setAttribute('data-thinking-index', String(index));
        child.setAttribute('fill', baseColor);
        child.setAttribute('data-thinking-base-fill', baseColor);
        fragment.appendChild(child);
        created.push(child);
    });
    node.appendChild(fragment);
    return created;
}

function mergeThinkingOptions(options) {
    if (!options) {
        return { ...DEFAULT_THINKING_CONFIG };
    }
    return { ...DEFAULT_THINKING_CONFIG, ...options };
}

function startThinking(node, options) {
    if (!node || node.nodeType !== 1) {
        return;
    }

    const existing = THINKING_REGISTRY.get(node);
    if (existing) {
        stopThinking(node);
    }

    const mergedOptions = mergeThinkingOptions(options);
    const baseText = node.textContent || '';
    if (!baseText) {
        return;
    }

    const charNodes = createCharacterNodes(node, baseText, mergedOptions.baseColor);
    if (!charNodes.length) {
        return;
    }

    const waveSize = Math.max(1, Math.min(mergedOptions.waveSize || 1, charNodes.length));
    mergedOptions.waveSize = waveSize;

    const entry = {
        node,
        baseText,
        baseFillAttr: node.getAttribute('fill'),
        baseStyleFill: node.style ? node.style.fill : undefined,
        options: mergedOptions,
        charNodes,
        frameId: null,
        currentIndex: 0,
        lastTimestamp: 0,
        destroyed: false,
        nodes: null,
    };

    node.setAttribute('data-thinking-active', 'true');

    const applyWave = () => {
        const { charNodes: nodes, options: opts } = entry;
        const { dimColor, waveSize: size } = opts;
        const total = nodes.length;
        for (let i = 0; i < total; i += 1) {
            const distance = (i - entry.currentIndex + total) % total;
            const baseFill = nodes[i].getAttribute('data-thinking-base-fill') || opts.baseColor;
            const fillColor = distance < size ? dimColor : baseFill;
            nodes[i].setAttribute('fill', fillColor);
        }
        entry.currentIndex = (entry.currentIndex + 1) % total;
    };

    const disableAnimation = Boolean(mergedOptions.disableAnimation || prefersReducedMotion());
    applyWave();
    THINKING_REGISTRY.set(node, entry);

    if (disableAnimation) {
        return;
    }

    function frame(timestamp) {
        if (entry.destroyed) {
            return;
        }
        if (!node.isConnected) {
            stopThinking(node);
            return;
        }
        if (!entry.lastTimestamp) {
            entry.lastTimestamp = timestamp;
        }
        if (timestamp - entry.lastTimestamp >= entry.options.intervalMs) {
            entry.lastTimestamp = timestamp;
            applyWave();
        }
        entry.frameId = scheduleFrame(frame);
    }

    entry.frameId = scheduleFrame(frame);
}

function startThinkingGroup(nodes, options) {
    const mergedOptions = mergeThinkingOptions(options);
    const validNodes = nodes.filter((node) => node && node.nodeType === 1);
    if (!validNodes.length) {
        return;
    }

    const nodeStates = [];
    const charNodes = [];

    validNodes.forEach((node) => {
        const existing = THINKING_REGISTRY.get(node);
        if (existing) {
            stopThinking(node);
        }
    });

    validNodes.forEach((node) => {
        const baseText = node.textContent || '';
        if (!baseText) {
            return;
        }
        const baseFillAttr = node.getAttribute('fill');
        const baseStyleFill = node.style ? node.style.fill : undefined;
        const baseColor = baseFillAttr || baseStyleFill || mergedOptions.baseColor;
        const created = createCharacterNodes(node, baseText, baseColor);
        if (!created.length) {
            return;
        }
        node.setAttribute('data-thinking-active', 'true');
        nodeStates.push({
            node,
            baseText,
            baseFillAttr,
            baseStyleFill,
        });
        charNodes.push(...created);
    });

    if (!charNodes.length) {
        return;
    }

    const waveSize = Math.max(1, Math.min(mergedOptions.waveSize || 1, charNodes.length));
    mergedOptions.waveSize = waveSize;

    const entry = {
        nodes: nodeStates,
        options: mergedOptions,
        charNodes,
        frameId: null,
        currentIndex: 0,
        lastTimestamp: 0,
        destroyed: false,
        isGroup: true,
    };

    nodeStates.forEach((state) => THINKING_REGISTRY.set(state.node, entry));

    const applyWave = () => {
        const { charNodes: chars, options: opts } = entry;
        const { dimColor, waveSize: size } = opts;
        const total = chars.length;
        for (let i = 0; i < total; i += 1) {
            const distance = (i - entry.currentIndex + total) % total;
            const baseFill = chars[i].getAttribute('data-thinking-base-fill') || opts.baseColor;
            const fillColor = distance < size ? dimColor : baseFill;
            chars[i].setAttribute('fill', fillColor);
        }
        entry.currentIndex = (entry.currentIndex + 1) % total;
    };

    const disableAnimation = Boolean(mergedOptions.disableAnimation || prefersReducedMotion());
    applyWave();

    if (disableAnimation) {
        return;
    }

    function frame(timestamp) {
        if (entry.destroyed) {
            return;
        }
        const primary = entry.nodes[0]?.node;
        if (!primary || !primary.isConnected) {
            entry.nodes.forEach((state) => stopThinking(state.node));
            return;
        }
        if (!entry.lastTimestamp) {
            entry.lastTimestamp = timestamp;
        }
        if (timestamp - entry.lastTimestamp >= entry.options.intervalMs) {
            entry.lastTimestamp = timestamp;
            applyWave();
        }
        entry.frameId = scheduleFrame(frame);
    }

    entry.frameId = scheduleFrame(frame);
}

function stopThinking(node) {
    const entry = THINKING_REGISTRY.get(node);
    if (!entry) {
        return;
    }
    entry.destroyed = true;
    if (entry.frameId !== null) {
        cancelFrame(entry.frameId);
    }

    const states = entry.nodes || [
        {
            node: entry.node,
            baseText: entry.baseText,
            baseFillAttr: entry.baseFillAttr,
            baseStyleFill: entry.baseStyleFill,
        },
    ];

    states.forEach((state) => {
        if (!state || !state.node) {
            return;
        }
        state.node.textContent = state.baseText || '';
        if (state.baseFillAttr !== null && state.baseFillAttr !== undefined) {
            state.node.setAttribute('fill', state.baseFillAttr);
        } else {
            state.node.removeAttribute('fill');
        }
        if (state.node.style) {
            if (state.baseStyleFill !== undefined) {
                state.node.style.fill = state.baseStyleFill;
            } else {
                state.node.style.fill = '';
            }
        }
        state.node.removeAttribute('data-thinking-active');
        THINKING_REGISTRY.delete(state.node);
    });
}

/**
 * Applies a sequential "thinking" highlight where letters dim in a wave pattern.
 *
 * @param {Element|Array<Element>|Object} target
 * @param {boolean} shouldHighlight
 * @param {object} [options]
 */
export function setThinkingHighlight(target, shouldHighlight, options = null) {
    if (Array.isArray(target)) {
        const nodes = normalizeTargets(target);
        if (!nodes.length) {
            return;
        }
        if (shouldHighlight) {
            startThinkingGroup(nodes, options || undefined);
        } else {
            nodes.forEach((node) => stopThinking(node));
        }
        return;
    }

    const nodes = normalizeTargets(target);
    nodes.forEach((node) => {
        if (!node || node.nodeType !== 1) {
            return;
        }
        if (shouldHighlight) {
            startThinking(node, options || undefined);
        } else {
            stopThinking(node);
        }
    });
}

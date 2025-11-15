const ensureArray = (value) => (Array.isArray(value) ? value : []);

const parseDateInput = (input) => {
    if (!input) {
        return new Date();
    }
    if (input instanceof Date) {
        return input;
    }
    if (typeof input === 'number') {
        return new Date(input);
    }
    if (typeof input === 'string') {
        const parsed = Date.parse(input);
        return Number.isFinite(parsed) ? new Date(parsed) : new Date();
    }
    if (input && typeof input === 'object' && 'date' in input) {
        return parseDateInput(input.date);
    }
    return new Date();
};

const createNode = (tag, datum = null) => ({
    tag,
    attributes: {},
    innerHTML: '',
    _textValue: '',
    get textContent() {
        return this._textValue;
    },
    set textContent(value) {
        this._textValue = value;
    },
    children: [],
    parentNode: null,
    style: {},
    __datum: datum,
});

const createTransition = (selection) => {
    const transitionApi = {
        style: jest.fn((prop, value) => {
            selection._nodes.forEach((node) => {
                node.style[prop] = value;
            });
            return transitionApi;
        }),
        duration: jest.fn(() => transitionApi),
        ease: jest.fn(() => transitionApi),
        on: jest.fn((event, handler) => {
            if (event === 'end' && typeof handler === 'function') {
                handler.call(selection._nodes[0] || null);
            }
            return transitionApi;
        }),
    };
    return transitionApi;
};

const createSelection = (nodes = [], options = {}) => {
    const selection = {
        _nodes: nodes,
        select: jest.fn((selector) => {
            if (!nodes[0]) {
                return createSelection([]);
            }
            const matches = ensureArray(nodes[0].children || []).filter((child) => {
                if (!selector) {
                    return false;
                }
                if (selector.startsWith('.')) {
                    const cls = selector.slice(1);
                    return child.attributes?.class === cls;
                }
                if (selector.includes('.')) {
                    const [tag, cls] = selector.split('.');
                    return child.tag === tag && child.attributes?.class === cls;
                }
                return child.tag === selector;
            });
            const childSelection = createSelection(matches);
            childSelection.remove = jest.fn(() => {
                childSelection._nodes.forEach((node) => {
                    if (node?.parentNode) {
                        node.parentNode.children = (node.parentNode.children || []).filter(
                            (child) => child !== node
                        );
                    }
                });
                childSelection._nodes = [];
                return childSelection;
            });
            childSelection.empty = jest.fn(() => childSelection._nodes.length === 0);
            return childSelection;
        }),
        selectAll: jest.fn((selector) => {
            if (typeof options.selectAll === 'function') {
                return options.selectAll(selector);
            }
            let childNodes = [];
            nodes.forEach((node) => {
                childNodes = childNodes.concat(ensureArray(node.children || []));
            });
            return createSelection(childNodes);
        }),
        filter: jest.fn((predicate) => {
            if (typeof predicate !== 'function') {
                return selection;
            }
            const filtered = nodes.filter((node, index) =>
                predicate.call(node, node.__datum, index, nodes)
            );
            return createSelection(filtered);
        }),
        html: jest.fn((value) => {
            if (value === undefined) {
                return nodes[0]?.innerHTML ?? '';
            }
            nodes.forEach((node) => {
                node.innerHTML = value;
            });
            return selection;
        }),
        attr: jest.fn((name, value) => {
            if (value === undefined) {
                return nodes[0]?.attributes?.[name];
            }
            nodes.forEach((node) => {
                if (!node.attributes) {
                    node.attributes = {};
                }
                node.attributes[name] = value;
            });
            return selection;
        }),
        append: jest.fn((tag) => {
            if (!nodes[0]) {
                return createSelection([]);
            }
            const child = createNode(tag);
            child.parentNode = nodes[0];
            nodes[0].children.push(child);
            return createSelection([child]);
        }),
        text: jest.fn((value) => {
            nodes.forEach((node) => {
                node._textValue = value;
            });
            return selection;
        }),
        each: jest.fn((callback) => {
            if (typeof callback !== 'function') {
                return selection;
            }
            nodes.forEach((node, index) => {
                callback.call(node, node.__datum, index, nodes);
            });
            return selection;
        }),
        style: jest.fn((prop, value) => {
            nodes.forEach((node) => {
                node.style[prop] = value;
            });
            return selection;
        }),
        on: jest.fn(() => selection),
        datum: jest.fn((value) => {
            if (value === undefined) {
                return nodes[0]?.__datum;
            }
            nodes.forEach((node) => {
                node.__datum = value;
            });
            return selection;
        }),
        transition: jest.fn(() => createTransition(selection)),
    };
    return selection;
};

const buildDatums = () => {
    const source = global.__mockCalendarDatums;
    if (!Array.isArray(source) || source.length === 0) {
        return ['2025-01-01'];
    }
    return source;
};

const buildTextNodes = (root, datums) => {
    root.children = [];
    if (!datums.length) {
        const fallbackGroup = createNode('g', { t: Date.now() });
        fallbackGroup.parentNode = root;
        const fallbackText = createNode('text', { t: Date.now() });
        fallbackText.parentNode = fallbackGroup;
        fallbackGroup.children.push(fallbackText);
        root.children.push(fallbackGroup);
        return [fallbackText];
    }
    return datums.map((value) => {
        const date = parseDateInput(value);
        const group = createNode('g', { t: date.getTime() });
        group.parentNode = root;
        const text = createNode('text', { t: date.getTime() });
        text.parentNode = group;
        group.children.push(text);
        root.children.push(group);
        return text;
    });
};

const buildRectNodes = (root, datums) => {
    root.rectangles = [];
    return datums.map((value) => {
        const date = parseDateInput(value);
        const rect = createNode('rect', { t: date.getTime() });
        rect.parentNode = root;
        rect.style = {};
        root.rectangles.push(rect);
        return rect;
    });
};

const d3Mock = {
    easeCubicInOut: (t) => t,
    scaleLinear: jest.fn(() => {
        let currentDomain = [];
        let currentRange = [];
        const scale = jest.fn((value) => {
            if (!currentRange.length) {
                return undefined;
            }
            if (!currentDomain.length) {
                return currentRange[0];
            }
            if (value <= currentDomain[0]) {
                return currentRange[0];
            }
            if (value >= currentDomain[currentDomain.length - 1]) {
                return currentRange[currentRange.length - 1];
            }
            return currentRange[Math.floor(currentRange.length / 2)] ?? currentRange[0];
        });
        scale.domain = jest.fn((values) => {
            currentDomain = ensureArray(values);
            return scale;
        });
        scale.range = jest.fn((values) => {
            currentRange = ensureArray(values);
            return scale;
        });
        scale.clamp = jest.fn(() => scale);
        return scale;
    }),
    select: jest.fn((target) => {
        if (typeof target === 'string') {
            if (target === '#cal-heatmap') {
                if (!global.__d3HeatmapRoot) {
                    global.__d3HeatmapRoot = createNode('heatmap-root');
                }
                const root = global.__d3HeatmapRoot;
                return createSelection([root], {
                    selectAll: (selector) => {
                        if (selector === 'text.ch-subdomain-text') {
                            const datums = buildDatums();
                            const signature = JSON.stringify(datums);
                            if (!root.textNodes || root.textNodesSignature !== signature) {
                                root.textNodes = buildTextNodes(root, datums);
                                root.textNodesSignature = signature;
                            }
                            global.__d3TextNodes = root.textNodes;
                            return createSelection(root.textNodes);
                        }
                        if (selector === 'rect.ch-subdomain-bg') {
                            const datums = buildDatums();
                            const signature = `rect-${JSON.stringify(datums)}`;
                            if (!root.rectangles || root.rectanglesSignature !== signature) {
                                root.rectangles = buildRectNodes(root, datums);
                                root.rectanglesSignature = signature;
                            }
                            global.__d3RectNodes = root.rectangles;
                            return createSelection(root.rectangles);
                        }
                        return createSelection([]);
                    },
                });
            }
            return createSelection([createNode('element')]);
        }
        if (target && typeof target === 'object' && target !== null) {
            return createSelection([target]);
        }
        return createSelection([]);
    }),
};

global.d3 = d3Mock;

module.exports = d3Mock;
module.exports.default = d3Mock;

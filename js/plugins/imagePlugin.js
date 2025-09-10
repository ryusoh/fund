import { drawImage } from '@charts/imageDrawer.js';

export const imagePlugin = {
    id: 'imagePlugin',
    afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const dataset = chart.data.datasets[0];
        const images = dataset.images;

        if (!images || images.length === 0) {
            return;
        }

        const showLogos = chart.showLogos || false;
        const hoveredSliceIndex = chart.hoveredSliceIndex;

        // Initialize caches once
        if (!chart.imagePlugin_loadedImages) {
            chart.imagePlugin_loadedImages = {};
        }
        if (!chart.imagePlugin_pendingLoads) {
            chart.imagePlugin_pendingLoads = new Set();
        }
        const loadedImages = chart.imagePlugin_loadedImages;
        const pendingLoads = chart.imagePlugin_pendingLoads;

        // Background preload when logos are not requested yet
        // - Start only after first render (this hook) and when data/meta exist
        // - Respect connection constraints; cap number of preloads
        const meta = chart.getDatasetMeta(0);
        if (meta.data.length > 0 && !showLogos && hoveredSliceIndex === undefined) {
            try {
                const conn = typeof navigator !== 'undefined' ? navigator.connection : undefined;
                const saveData = !!(conn && conn.saveData);
                const is2g = !!(conn && /(^|\b)2g\b/i.test(String(conn.effectiveType || '')));
                const PRELOAD_LIMIT = saveData || is2g ? 0 : 10; // preload up to 10 on decent networks
                for (let i = 0; i < Math.min(images.length, PRELOAD_LIMIT); i++) {
                    const info = images[i];
                    const imageUrl = info && info.src;
                    if (!imageUrl) {
                        continue;
                    }
                    if (loadedImages[imageUrl] || pendingLoads.has(imageUrl)) {
                        continue;
                    }
                    pendingLoads.add(imageUrl);
                    const img = new Image();
                    // Hint decode scheduling; avoid blocking the main thread
                    try {
                        img.decoding = 'async';
                    } catch {}
                    img.onload = () => {
                        loadedImages[imageUrl] = img;
                        pendingLoads.delete(imageUrl);
                        // Do not trigger chart.draw() here; drawing waits for user toggle/hover
                    };
                    img.onerror = () => {
                        pendingLoads.delete(imageUrl);
                    };
                    img.src = imageUrl;
                }
            } catch {}
            // Do not draw yet; exit early since logos aren't visible
            return;
        }

        if (meta.data.length === 0) {
            return;
        }

        meta.data.forEach((arc, index) => {
            if (showLogos || index === hoveredSliceIndex) {
                const logoInfo = images[index];
                if (logoInfo && logoInfo.src) {
                    const imageUrl = logoInfo.src;
                    if (loadedImages[imageUrl]) {
                        // Image is already loaded and in cache, just draw it
                        drawImage(ctx, arc, loadedImages[imageUrl], logoInfo);
                    } else {
                        // Image is not loaded yet, start loading
                        const img = new Image();
                        img.src = imageUrl;
                        img.onload = () => {
                            loadedImages[imageUrl] = img; // Cache the loaded image
                            chart.draw(); // Redraw the chart to show the loaded image
                        };
                    }
                }
            }
        });
    },
};

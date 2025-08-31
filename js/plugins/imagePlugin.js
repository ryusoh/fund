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

        if (!showLogos && hoveredSliceIndex === undefined) {
            return; // Don't draw any logos
        }

        // Initialize a cache for loaded images on the chart instance if it doesn't exist
        if (!chart.imagePlugin_loadedImages) {
            chart.imagePlugin_loadedImages = {};
        }
        const loadedImages = chart.imagePlugin_loadedImages;

        const meta = chart.getDatasetMeta(0);
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

import { drawImage } from '@charts/imageDrawer.js';
import { logger } from '../utils/logger.js';

function _getPreloadLimit() {
    const conn = typeof navigator !== 'undefined' ? navigator.connection : undefined;
    const saveData = !!(conn && conn.saveData);
    const is2g = !!(conn && /(^|\b)2g\b/i.test(String(conn.effectiveType || '')));
    return saveData || is2g ? 0 : 10;
}

function _loadSingleImage(imageUrl, loadedImages, pendingLoads) {
    if (loadedImages[imageUrl] || pendingLoads.has(imageUrl)) {
        return;
    }
    pendingLoads.add(imageUrl);
    const img = new Image();
    try {
        img.decoding = 'async';
    } catch (error) {
        logger.warn('Image plugin processing failed:', error);
    }
    img.onload = () => {
        loadedImages[imageUrl] = img;
        pendingLoads.delete(imageUrl);
    };
    img.onerror = () => {
        pendingLoads.delete(imageUrl);
    };
    img.src = imageUrl;
}

function _preloadImages(images, loadedImages, pendingLoads) {
    try {
        const preloadLimit = _getPreloadLimit();
        for (let i = 0; i < Math.min(images.length, preloadLimit); i++) {
            const info = images[i];
            const imageUrl = info && info.src;
            if (!imageUrl) {
                continue;
            }
            _loadSingleImage(imageUrl, loadedImages, pendingLoads);
        }
    } catch (error) {
        logger.warn('Image plugin processing failed:', error);
    }
}

function _calculateMagneticOffset(cursor, arc) {
    if (!cursor) {
        return null;
    }
    const MAGNETIC_RADIUS = 80;
    const MAGNETIC_STRENGTH = 0.35;
    const sliceAngle = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;
    const midR = arc.innerRadius + (arc.outerRadius - arc.innerRadius) / 2;
    const logoX = arc.x + Math.cos(sliceAngle) * midR;
    const logoY = arc.y + Math.sin(sliceAngle) * midR;
    const dx = cursor.x - logoX;
    const dy = cursor.y - logoY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MAGNETIC_RADIUS && dist > 0) {
        const t = 1 - dist / MAGNETIC_RADIUS;
        const pull = t * t * MAGNETIC_STRENGTH;
        return { dx: dx * pull, dy: dy * pull };
    }
    return null;
}

function _drawOrLoadImage(chart, ctx, arc, index, hoveredSliceIndex, logoInfo, loadedImages) {
    if (!logoInfo || !logoInfo.src) {
        return;
    }
    const imageUrl = logoInfo.src;
    const magneticOffset = _calculateMagneticOffset(chart._cursorPos, arc);

    if (loadedImages[imageUrl]) {
        const isHovered = index === hoveredSliceIndex;
        drawImage(ctx, arc, loadedImages[imageUrl], logoInfo, magneticOffset, isHovered);
    } else {
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            loadedImages[imageUrl] = img;
            chart.draw();
        };
    }
}

function _initializeCaches(chart) {
    if (!chart.imagePlugin_loadedImages) {
        chart.imagePlugin_loadedImages = {};
    }
    if (!chart.imagePlugin_pendingLoads) {
        chart.imagePlugin_pendingLoads = new Set();
    }
}

function _drawLogosForDataset(chart, meta, images, showLogos, hoveredSliceIndex, loadedImages) {
    for (let index = 0; index < meta.data.length; index++) {
        const arc = meta.data[index];
        if (showLogos || index === hoveredSliceIndex) {
            _drawOrLoadImage(
                chart,
                chart.ctx,
                arc,
                index,
                hoveredSliceIndex,
                images[index],
                loadedImages
            );
        }
    }
}

export const imagePlugin = {
    id: 'imagePlugin',
    afterDatasetsDraw(chart) {
        const dataset = chart.data.datasets[0];
        const images = dataset.images;

        if (!images || images.length === 0) {
            return;
        }

        const showLogos = chart.showLogos || false;
        const hoveredSliceIndex = chart.hoveredSliceIndex;

        _initializeCaches(chart);
        const loadedImages = chart.imagePlugin_loadedImages;
        const pendingLoads = chart.imagePlugin_pendingLoads;

        const meta = chart.getDatasetMeta(0);
        if (meta.data.length > 0 && !showLogos && hoveredSliceIndex === undefined) {
            _preloadImages(images, loadedImages, pendingLoads);
            return;
        }

        if (meta.data.length > 0) {
            _drawLogosForDataset(chart, meta, images, showLogos, hoveredSliceIndex, loadedImages);
        }
    },
};

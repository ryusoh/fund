export function drawImage(ctx, arc, img, logoInfo) {
    const { x, y, outerRadius, innerRadius, startAngle, endAngle } = arc;
    const sliceAngle = endAngle - startAngle;

    // Only draw if the slice is large enough
    const minAngle = Math.PI / 18; // 10 degrees
    if (sliceAngle < minAngle) {
        return;
    }

    const angle = startAngle + sliceAngle / 2;
    const radius = innerRadius + (outerRadius - innerRadius) / 2;

    // Determine the bounding box for the logo
    const sliceThickness = outerRadius - innerRadius;
    const arcLengthAtCenterRadius = radius * sliceAngle;

    const scale = logoInfo.scale || 1.0;
    const maxLogoWidth = arcLengthAtCenterRadius * 0.7 * scale;
    const maxLogoHeight = sliceThickness * 0.7 * scale;

    // Preserve aspect ratio
    let logoWidth = img.width;
    let logoHeight = img.height;
    const aspectRatio = logoWidth / logoHeight;

    if (logoWidth > maxLogoWidth) {
        logoWidth = maxLogoWidth;
        logoHeight = logoWidth / aspectRatio;
    }

    if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * aspectRatio;
    }

    ctx.save();

    // Set opacity
    ctx.globalAlpha = logoInfo.opacity || 1.0;

    // --- Corrected Clipping and Subtle Rotation ---

    // 1. Define the clipping path for the donut slice
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, startAngle, endAngle);
    ctx.arc(x, y, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.clip();

    // 2. Translate to the drawing position
    const imgX = x + Math.cos(angle) * radius;
    const imgY = y + Math.sin(angle) * radius;
    ctx.translate(imgX, imgY);

    // 3. Apply rotation
    let rotation = 0;
    if (logoInfo.rotation !== undefined && logoInfo.rotation !== false) {
        // Use the user-defined rotation (in degrees)
        rotation = logoInfo.rotation * Math.PI / 180;
    } else if (logoInfo.rotation !== false) {
        // Apply the default subtle rotation
        let defaultRotation = angle + Math.PI / 2;
        if (defaultRotation > Math.PI / 2) {
            defaultRotation -= Math.PI;
        }
        if (defaultRotation < -Math.PI / 2) {
            defaultRotation += Math.PI;
        }
        const maxRotation = Math.PI / 6; // 30 degrees
        if (Math.abs(defaultRotation) > maxRotation) {
            defaultRotation = defaultRotation > 0 ? maxRotation : -maxRotation;
        }
        rotation = defaultRotation;
    }

    ctx.rotate(rotation);

    // 4. Draw the image
    if (logoInfo.renderAsWhite) {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        // Scale the canvas for high-DPI displays
        offscreenCanvas.width = logoWidth * devicePixelRatio;
        offscreenCanvas.height = logoHeight * devicePixelRatio;
        offscreenCtx.scale(devicePixelRatio, devicePixelRatio);

        // Draw the original image
        offscreenCtx.drawImage(img, 0, 0, logoWidth, logoHeight);

        // Use source-in to colorize the logo
        offscreenCtx.globalCompositeOperation = 'source-in';
        offscreenCtx.fillStyle = 'white';
        offscreenCtx.fillRect(0, 0, logoWidth, logoHeight);

        // Draw the modified image onto the main canvas
        ctx.drawImage(offscreenCanvas, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);

    } else {
        // Draw the original image
        ctx.drawImage(img, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
    }

    ctx.restore();
}

// Generates AVIF + WebP tiers for the large page-background JPEGs that CSS
// serves via image-set() (css/base.css, css/main_index.css, css/calendar.css,
// css/terminal/*.css, css/layout.css). Run via `make images`.
//
// The JPEGs stay on disk as the image-set() fallback (and, for mobile_bg.jpg,
// as the <video> poster / service-worker precache entry). sharp strips all
// metadata from its outputs; the source JPEGs carry camera serial numbers, so
// exiftool (when installed) also scrubs GPS/serial EXIF from the originals.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import sharp from 'sharp';

const IMAGE_FILES = [
    ...fs
        .readdirSync(path.join('assets', 'backgrounds'))
        .filter((f) => /\.jpe?g$/i.test(f))
        .map((f) => path.join('assets', 'backgrounds', f)),
    path.join('assets', 'mobile_bg.jpg'),
];

function sanitizeImageMetadata(filePath) {
    try {
        execFileSync(
            'exiftool',
            [
                '-m',
                '-overwrite_original',
                '-gps:all=',
                '-serialnumber=',
                '-bodyserialnumber=',
                '-lensserialnumber=',
                filePath,
            ],
            { stdio: 'ignore' }
        );
        return true;
    } catch {
        return false;
    }
}

async function processImages() {
    const exiftoolAvailable = sanitizeImageMetadata(IMAGE_FILES[0]);
    if (exiftoolAvailable) {
        for (const file of IMAGE_FILES.slice(1)) {
            sanitizeImageMetadata(file);
        }
    } else {
        console.log('exiftool not found; skipping EXIF scrub of source JPEGs');
    }

    let totalOriginalBytes = 0;
    let totalAvifBytes = 0;
    let totalWebpBytes = 0;
    let count = 0;

    for (const inputPath of IMAGE_FILES) {
        const ext = path.extname(inputPath);
        const basePath = inputPath.slice(0, -ext.length);
        const avifPath = `${basePath}.avif`;
        const webpPath = `${basePath}.webp`;

        const origStat = fs.statSync(inputPath);
        totalOriginalBytes += origStat.size;

        await sharp(inputPath)
            .avif({ quality: 65, effort: 6, chromaSubsampling: '4:2:0' })
            .toFile(avifPath);
        await sharp(inputPath).webp({ quality: 75, effort: 6 }).toFile(webpPath);

        const avifSize = fs.statSync(avifPath).size;
        const webpSize = fs.statSync(webpPath).size;
        totalAvifBytes += avifSize;
        totalWebpBytes += webpSize;
        count++;

        console.log(
            `[${count}/${IMAGE_FILES.length}] ${inputPath}: jpg ${(origStat.size / 1024).toFixed(1)}KB -> avif ${(avifSize / 1024).toFixed(1)}KB, webp ${(webpSize / 1024).toFixed(1)}KB`
        );
    }

    const pct = (bytes) => ((1 - bytes / totalOriginalBytes) * 100).toFixed(1);
    console.log('\n=== Image Generation Summary ===');
    console.log(`Processed ${count} images.`);
    console.log(`Original JPEG total: ${(totalOriginalBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(
        `AVIF total:          ${(totalAvifBytes / (1024 * 1024)).toFixed(2)} MB (${pct(totalAvifBytes)}% reduction)`
    );
    console.log(
        `WebP total:          ${(totalWebpBytes / (1024 * 1024)).toFixed(2)} MB (${pct(totalWebpBytes)}% reduction)`
    );
}

processImages().catch((err) => {
    console.error(err);
    process.exit(1);
});

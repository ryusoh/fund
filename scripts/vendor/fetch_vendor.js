// Fetch and store vendor JS assets locally to avoid runtime CDN dependencies.
// This script downloads ESM (d3, cal-heatmap) and UMD (Chart.js, chartjs-plugin-datalabels)
// into js/vendor/ for use by the app and tests.

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const vendorJsDir = path.join(__dirname, '..', '..', 'js', 'vendor');
const vendorCssDir = path.join(__dirname, '..', '..', 'assets', 'vendor', 'css');
const vendorFontsDir = path.join(__dirname, '..', '..', 'assets', 'vendor', 'fonts');

const assets = [
    // ESM modules
    {
        url: 'https://cdn.jsdelivr.net/npm/d3@7/+esm',
        out: path.join(vendorJsDir, 'd3.v7.mjs'),
    },
    // UMD scripts
    {
        url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
        out: path.join(vendorJsDir, 'chart.umd.min.js'),
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-datalabels/2.2.0/chartjs-plugin-datalabels.min.js',
        out: path.join(vendorJsDir, 'chartjs-plugin-datalabels.min.js'),
    },
    // CSS assets
    {
        url: 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css',
        out: path.join(vendorCssDir, 'font-awesome-4.7.0.min.css'),
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/cal-heatmap@4.2.4/dist/cal-heatmap.css',
        out: path.join(vendorCssDir, 'cal-heatmap-4.2.4.css'),
    },
    // Font Awesome 4.7.0 fonts
    {
        url: 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.woff2?v=4.7.0',
        out: path.join(vendorFontsDir, 'fontawesome-webfont.woff2'),
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.woff?v=4.7.0',
        out: path.join(vendorFontsDir, 'fontawesome-webfont.woff'),
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.ttf?v=4.7.0',
        out: path.join(vendorFontsDir, 'fontawesome-webfont.ttf'),
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.eot?v=4.7.0',
        out: path.join(vendorFontsDir, 'fontawesome-webfont.eot'),
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/fonts/fontawesome-webfont.svg?v=4.7.0',
        out: path.join(vendorFontsDir, 'fontawesome-webfont.svg'),
    },
];

function fetchToFile(url, outPath) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
                    res.resume();
                    return;
                }
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                const file = fs.createWriteStream(outPath);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
            })
            .on('error', reject);
    });
}

(async () => {
    try {
        const manifest = [];
        for (const asset of assets) {
            await fetchToFile(asset.url, asset.out);
            const buf = fs.readFileSync(asset.out);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            manifest.push({
                url: asset.url,
                file: path.relative(path.join(__dirname, '..', '..'), asset.out),
                sha256,
            });

            console.log(`Fetched: ${asset.url} -> ${asset.out}`);
        }
        const manifestDir = path.join(__dirname, '..', '..', 'assets', 'vendor');
        fs.mkdirSync(manifestDir, { recursive: true });
        fs.writeFileSync(
            path.join(manifestDir, 'manifest.json'),
            JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2)
        );
    } catch (e) {
        console.error('Vendor fetch failed:', e);
        process.exit(1);
    }
})();

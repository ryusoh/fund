const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const req = [
    'js/vendor/d3.v7.mjs',
    'js/vendor/cal-heatmap-4.2.4.mjs',
    'js/vendor/chart.umd.min.js',
    'js/vendor/chartjs-plugin-datalabels.min.js',
    'assets/vendor/css/font-awesome-4.7.0.min.css',
    'assets/vendor/css/cal-heatmap-4.2.4.css',
    'assets/vendor/fonts/fontawesome-webfont.woff2',
    'assets/vendor/fonts/fontawesome-webfont.woff',
    'assets/vendor/fonts/fontawesome-webfont.ttf',
    'assets/vendor/fonts/fontawesome-webfont.eot',
    'assets/vendor/fonts/fontawesome-webfont.svg',
];

const missing = [];
for (const rel of req) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) {
        missing.push(rel);
    }
}

if (missing.length) {
    console.error('Missing vendor files:', missing.join(', '));
    console.error('Run: npm run vendor:fetch');
    process.exit(1);
}

const manifestPath = path.join(root, 'assets', 'vendor', 'manifest.json');
if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const mismatches = [];
    for (const entry of manifest.files) {
        const p = path.join(root, entry.file);
        if (!fs.existsSync(p)) {
            mismatches.push(entry.file + ' (missing)');
            continue;
        }
        const hash = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
        if (hash !== entry.sha256) {
            mismatches.push(`${entry.file} (sha256 mismatch)`);
        }
    }
    if (mismatches.length) {
        console.error('Vendor checksum mismatches:', mismatches.join(', '));
        process.exit(1);
    }
}

console.log('All vendor assets present');

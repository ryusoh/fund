const fs = require('fs');
const path = require('path');

function rmIfExists(p) {
    if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
            fs.rmSync(p, { recursive: true, force: true });
        } else {
            fs.unlinkSync(p);
        }
        console.log('Removed', p);
    }
}

const oldPaths = [
    path.join(__dirname, '..', '..', 'js', 'fonts'),
    path.join(__dirname, '..', '..', 'js', 'vendor', 'font-awesome-4.7.0.min.css'),
    path.join(__dirname, '..', '..', 'js', 'vendor', 'cal-heatmap-4.2.4.css'),
];

for (const p of oldPaths) {
    rmIfExists(p);
}

console.log('Vendor clean complete');

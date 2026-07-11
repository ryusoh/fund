const esbuild = require('esbuild');

// Default writes the shipped bundle; set CALHEATMAP_OUT to build elsewhere
// (e.g. a temp file for a CI "does the source still compile?" check that must
// not touch/overwrite the committed bundle).
const OUTFILE = process.env.CALHEATMAP_OUT || 'js/vendor/cal-heatmap.js';

const d3GlobalsPlugin = {
    name: 'd3-globals',
    setup(build) {
        build.onResolve({ filter: /^d3(-.*)?$/ }, (args) => ({
            path: args.path,
            namespace: 'd3-globals',
        }));
        build.onLoad({ filter: /.*/, namespace: 'd3-globals' }, () => {
            // Map all d3 modules to the global window.d3 object
            return {
                contents: 'module.exports = window.d3;',
            };
        });
    },
};

const ignoreObservableHqPlugin = {
    name: 'ignore-observablehq',
    setup(build) {
        build.onResolve({ filter: /^@observablehq\/plot$/ }, (args) => ({
            path: args.path,
            namespace: 'ignore-observablehq',
        }));
        build.onLoad({ filter: /.*/, namespace: 'ignore-observablehq' }, () => ({
            contents: 'module.exports = { legend: () => {}, scale: () => {} };',
        }));
    },
};

const ignoreSCSSPlugin = {
    name: 'ignore-scss',
    setup(build) {
        build.onResolve({ filter: /\.scss$/ }, (args) => ({
            path: args.path,
            namespace: 'ignore-scss',
        }));
        build.onLoad({ filter: /.*/, namespace: 'ignore-scss' }, () => ({
            contents: '',
        }));
    },
};

esbuild
    .build({
        entryPoints: ['js/ui/cal-heatmap-src/CalHeatmap.ts'],
        bundle: true,
        outfile: OUTFILE,
        format: 'iife',
        globalName: 'CalHeatmap',
        plugins: [d3GlobalsPlugin, ignoreSCSSPlugin, ignoreObservableHqPlugin],
        target: ['es2022'],
        minify: true, // we can keep it minified, but it's ours now!
    })
    .then(() => {
        const fs = require('fs');
        const path = OUTFILE;
        let content = fs.readFileSync(path, 'utf8');
        content = content.replace(/Function\("return this"\)\(\)/g, 'globalThis');
        content = content.replace(/Function\('return this'\)\(\)/g, 'globalThis');
        content += '\nCalHeatmap = CalHeatmap.default || CalHeatmap;\n';
        fs.writeFileSync(path, content, 'utf8');
        console.log('✅ cal-heatmap.js built successfully');
    })
    .catch(() => process.exit(1));

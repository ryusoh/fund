const esbuild = require('esbuild');

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
        outfile: 'js/vendor/cal-heatmap.js',
        format: 'iife',
        globalName: 'CalHeatmap',
        plugins: [d3GlobalsPlugin, ignoreSCSSPlugin],
        target: ['es2022'],
        minify: true, // we can keep it minified, but it's ours now!
    })
    .then(() => {
        const fs = require('fs');
        const path = 'js/vendor/cal-heatmap.js';
        let content = fs.readFileSync(path, 'utf8');
        content = content.replace(/Function\("return this"\)\(\)/g, 'globalThis');
        content = content.replace(/Function\('return this'\)\(\)/g, 'globalThis');
        content += '\nCalHeatmap = CalHeatmap.default || CalHeatmap;\n';
        fs.writeFileSync(path, content, 'utf8');
        console.log('✅ cal-heatmap.js built successfully');
    })
    .catch(() => process.exit(1));

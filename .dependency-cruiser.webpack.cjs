// Webpack-config stub for dependency-cruiser (.dependency-cruiser.cjs) only —
// NOT a real build config; this repo has no bundler. It exists because
// dependency-cruiser resolves import-map aliases (@js/, @ui/, …) through
// either options.tsConfig or a webpack resolve.alias, and the tsConfig route
// makes it look for a typescript <7 compiler (repo has v7) and print a
// spurious "missing-typescript-transpiler" warning on every run. Keep the
// aliases below in sync with the import maps in */index.html and the paths in
// jsconfig.json.
const path = require('path');

const r = (p) => path.resolve(__dirname, p);

module.exports = {
    resolve: {
        alias: {
            '@js': r('js'),
            '@pages': r('js/pages'),
            '@services': r('js/services'),
            '@charts': r('js/charts'),
            '@plugins': r('js/plugins'),
            '@ui': r('js/ui'),
            '@utils': r('js/utils'),
        },
    },
};

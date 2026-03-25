const { execSync } = require('child_process');

console.log(execSync('pnpm test tests/js/transactions/terminal_marketcap.test.js -- --coverage --collectCoverageFrom="js/transactions/chart/renderers/marketcap.js"').toString());
console.log(execSync('pnpm test tests/js/transactions/terminal_sectors.test.js -- --coverage --collectCoverageFrom="js/transactions/chart/renderers/sectors.js"').toString());

const fs = require('fs');
const path = 'tests/js/transactions/dataLoader.test.js';
let content = fs.readFileSync(path, 'utf8');

// I put the new describe blocks outside of the "describe('dataLoader basic history loaders', () => {"
// Wait, no I didn't, I replaced loadContributionSeries = mod.loadContributionSeries;} but let's check.
// I will just git reset tests/js/transactions/dataLoader.test.js and re-apply correctly.

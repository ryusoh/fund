const fs = require('fs');
const path = 'tests/js/transactions/utils.test.js';
let content = fs.readFileSync(path, 'utf8');

// Fix the syntax error from my bad replace
content = content.replace("import { transactionState } from '@js/transactions/state.js'; from '@js/transactions/utils.js';", "import { transactionState } from '@js/transactions/state.js';");
fs.writeFileSync(path, content);

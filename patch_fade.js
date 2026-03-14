const fs = require('fs');
let code = fs.readFileSync('tests/js/transactions/fade.test.js', 'utf8');

// Fix global.window.innerWidth mocking
code = code.replace(/global\.window\.innerWidth = 500;/g, "Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });");
code = code.replace(/global\.window\.innerWidth = 1024;/g, "Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });");

// Fix dynamic imports not awaited
code = code.replace(/import\('@js\/transactions\/fade\.js'\)\.then\(\(\{ initFade \}\) => \{/g, "return import('@js/transactions/fade.js').then(({ initFade }) => {");

fs.writeFileSync('tests/js/transactions/fade.test.js', code);

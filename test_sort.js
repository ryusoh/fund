const fs = require('fs');
const data = [];
for (let i = 0; i < 10000; i++) {
    const year = 2000 + Math.floor(Math.random() * 24);
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
    const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
    data.push({ date: `${year}-${month}-${day}` });
}

console.time('new Date sort');
[...data].sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    return da - db;
});
console.timeEnd('new Date sort');

console.time('string sort');
[...data].sort((a, b) => {
    const da = a.date;
    const db = b.date;
    return da < db ? -1 : (da > db ? 1 : 0);
});
console.timeEnd('string sort');

const lots = Array.from({ length: 1000 }, () => ({ qty: 10, price: 50 }));

console.time('reduce sum');
for (let i = 0; i < 10000; i++) {
    const sum = lots.reduce((acc, l) => acc + l.qty, 0);
}
console.timeEnd('reduce sum');

console.time('for loop sum');
for (let i = 0; i < 10000; i++) {
    let sum = 0;
    for (let j = 0; j < lots.length; j++) {
        sum += lots[j].qty;
    }
}
console.timeEnd('for loop sum');

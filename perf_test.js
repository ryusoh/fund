const lots = Array.from({ length: 1000 }, () => ({ qty: 10, price: 50 }));

console.time('map spread');
for (let i = 0; i < 10000; i++) {
    const newLots = lots.map((l) => ({ ...l }));
}
console.timeEnd('map spread');

console.time('for loop push object');
for (let i = 0; i < 10000; i++) {
    const newLots = [];
    for (let j = 0; j < lots.length; j++) {
        newLots.push({ qty: lots[j].qty, price: lots[j].price });
    }
}
console.timeEnd('for loop push object');

import { applyTransactionFIFO } from './js/transactions/calculations.js';

const lots = [];
for (let i = 0; i < 10000; i++) {
    lots.push({ qty: 1, price: 100 });
}

console.time('FIFO');
for (let i = 0; i < 1000; i++) {
    applyTransactionFIFO(lots, { quantity: "1", price: "100", orderType: "buy", tradeDate: "2020-01-01", security: "AAPL" }, []);
}
console.timeEnd('FIFO');

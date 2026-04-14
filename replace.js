import { applyTransactionFIFO } from './js/transactions/calculations.js';
console.log(applyTransactionFIFO([{qty: 10, price: 50}], {quantity: "5", price: "100", orderType: "buy", tradeDate: "2020-01-01", security: "AAPL"}, []));

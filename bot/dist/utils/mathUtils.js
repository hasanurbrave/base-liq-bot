"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUSD = exports.safeDiv = exports.safeMul = void 0;
const WAD = 10n ** 18n;
const safeMul = (a, b) => (a * b) / WAD;
exports.safeMul = safeMul;
const safeDiv = (a, b) => {
    if (b === 0n)
        throw new Error("Division by zero");
    return (a * WAD) / b;
};
exports.safeDiv = safeDiv;
const toUSD = (amount, price, priceDecimals = 8) => (amount * price) / WAD;
exports.toUSD = toUSD;

const WAD = 10n ** 18n;
export const safeMul = (a: bigint, b: bigint): bigint => (a * b) / WAD;
export const safeDiv = (a: bigint, b: bigint): bigint => {
  if (b === 0n) throw new Error("Division by zero");
  return (a * WAD) / b;
};
export const toUSD = (amount: bigint, price: bigint, priceDecimals: number = 8): bigint => (amount * price) / WAD;

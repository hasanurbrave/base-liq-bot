const fs = require('fs');
let code = fs.readFileSync('bot/src/simulation/swapSimulator.ts', 'utf8');

const oldLines = `    const [uni500, uni3000, aeroVolatile] = await Promise.all([
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 500),
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 3000),
      this.quoteAerodrome(tokenIn, tokenOut, amountIn, false)
    ]);

    const successfulQuotes = [uni500, uni3000, aeroVolatile].filter(q => q.success);`;

const newLines = `    const [uni500, uni3000, uni10000, aeroVolatile, aeroStable] = await Promise.all([
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 500),
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 3000),
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 10000), // MED-02: 1% fee tier
      this.quoteAerodrome(tokenIn, tokenOut, amountIn, false),
      this.quoteAerodrome(tokenIn, tokenOut, amountIn, true)   // MED-01: stable pool
    ]);

    const successfulQuotes = [uni500, uni3000, uni10000, aeroVolatile, aeroStable].filter(q => q.success);`;

if (code.includes(oldLines)) {
  code = code.replace(oldLines, newLines);
  fs.writeFileSync('bot/src/simulation/swapSimulator.ts', code);
  console.log("Quotes Fixed!");
} else {
  // Let's try CRLF
  const oldLinesCRLF = oldLines.replace(/\n/g, '\r\n');
  const newLinesCRLF = newLines.replace(/\n/g, '\r\n');
  if (code.includes(oldLinesCRLF)) {
    code = code.replace(oldLinesCRLF, newLinesCRLF);
    fs.writeFileSync('bot/src/simulation/swapSimulator.ts', code);
    console.log("Quotes Fixed with CRLF!");
  } else {
    console.log("Quotes block not found.");
  }
}

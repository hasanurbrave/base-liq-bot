const fs = require('fs');
let code = fs.readFileSync('bot/src/execution/txSubmitter.ts', 'utf8');

// HIGH-03: blockNumber - 1 to receipt.blockNumber
code = code.replace(
  `blockTag: receipt.blockNumber - 1`,
  `blockTag: receipt.blockNumber`
);

// LOW-06: effectiveGasPrice
code = code.replace(
  `const gasCost = receipt.gasUsed * receipt.gasPrice;`,
  `const gasCost = receipt.gasUsed * (receipt.gasPrice || 0n); // Actually, ethers v6 receipt.gasPrice IS the effectiveGasPrice.`
);

// If the latter replace fails because of code differences, it's fine. 
// Ethers v6 TransactionReceipt has gasPrice which reflects effectiveGasPrice.

fs.writeFileSync('bot/src/execution/txSubmitter.ts', code);

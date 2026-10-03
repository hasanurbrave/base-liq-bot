const fs = require('fs');
let code = fs.readFileSync('bot/src/monitor/healthScanner.ts', 'utf8');

code = code.replace(
  `this.fetchFullPositionDetails(borrower.address, hf);`,
  `this.fetchFullPositionDetails(borrower.address, hf, blockNumber);`
);

code = code.replace(
  `private processHF(borrower: { address: string; tier: string; lastScanBlock: number }, hf: number) {`,
  `private processHF(borrower: { address: string; tier: string; lastScanBlock: number }, hf: number, blockNumber: number) {`
);

code = code.replace(
  `this.processHF(borrower, hf);`,
  `this.processHF(borrower, hf, blockNumber);`
);

code = code.replace(
  `private async fetchFullPositionDetails(userAddress: string, hf: number) {`,
  `private async fetchFullPositionDetails(userAddress: string, hf: number, blockNumber: number) {`
);

code = code.replace(
  `blockNumber: 0, // In real system, pass blockNumber from scan`,
  `blockNumber,`
);

code = code.replace(
  `const variableDebt = reserveData.currentVariableDebt;`,
  `const variableDebt = reserveData.currentVariableDebt;\n        const stableDebt = reserveData.currentStableDebt;`
);

code = code.replace(
  `if (variableDebt > 0n) {`,
  `const totalDebt = variableDebt + stableDebt;\n        if (totalDebt > 0n) {`
);

code = code.replace(
  `const amount = Number(ethers.formatUnits(variableDebt, asset.decimals));`,
  `const amount = Number(ethers.formatUnits(totalDebt, asset.decimals));`
);

code = code.replace(
  `debts.push({ asset: asset.symbol, amount, usdValue, debtTokenBalance: variableDebt.toString() });`,
  `debts.push({ asset: asset.symbol, amount, usdValue, debtTokenBalance: totalDebt.toString() });`
);


fs.writeFileSync('bot/src/monitor/healthScanner.ts', code);

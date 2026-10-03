const fs = require('fs');
let code = fs.readFileSync('bot/src/monitor/healthScanner.ts', 'utf8');

code = code.replace(
  `this.processHF(borrowers[i], hfValue, totalDebtBase);`,
  `this.processHF(borrowers[i], hfValue, totalDebtBase, blockNumber);`
);

code = code.replace(
  `private processHF(borrower: BorrowerMetadata, hf: number, totalDebtBase: bigint) {`,
  `private processHF(borrower: BorrowerMetadata, hf: number, totalDebtBase: bigint, blockNumber: number) {`
);

code = code.replace(
  `this.fetchFullPositionDetails(borrower.address, hf, blockNumber);`,
  `this.fetchFullPositionDetails(borrower.address, hf, blockNumber);`
);

fs.writeFileSync('bot/src/monitor/healthScanner.ts', code);

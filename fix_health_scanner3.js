const fs = require('fs');
let code = fs.readFileSync('bot/src/monitor/healthScanner.ts', 'utf8');

code = code.replace(
  `await this.executeBatch(chunk);`,
  `await this.executeBatch(chunk, blockNumber);`
);

code = code.replace(
  `private async executeBatch(borrowers: BorrowerMetadata[]) {`,
  `private async executeBatch(borrowers: BorrowerMetadata[], blockNumber: number) {`
);

fs.writeFileSync('bot/src/monitor/healthScanner.ts', code);

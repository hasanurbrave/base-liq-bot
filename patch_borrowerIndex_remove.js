const fs = require('fs');
const file = 'bot/src/monitor/borrowerIndex.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `  public getStats() {`;
const insert = `  public removeBorrower(address: string) {
    if (this.activeBorrowers.has(address)) {
      this.activeBorrowers.delete(address);
    }
  }

  public getStats() {`;

code = code.replace(target, insert);
fs.writeFileSync(file, code);

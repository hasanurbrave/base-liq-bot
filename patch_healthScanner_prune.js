const fs = require('fs');
const file = 'bot/src/monitor/healthScanner.ts';
let code = fs.readFileSync(file, 'utf8');

const oldCheck = `    // Phase 5 Polish: Complete dust filter for accounts with < $10 debt (Base currency has 8 decimals)
    if (totalDebtBase <= 1000000000n) {
       return; 
    }`;

const newCheck = `    // Phase 5 Polish: Complete dust filter for accounts with < $10 debt (Base currency has 8 decimals)
    if (totalDebtBase <= 1000000000n) {
       // H-06 Fix: Prune borrowers with 0 or dust debt
       if (totalDebtBase == 0n) {
          this.emit('cleanBorrower', borrower.address);
       }
       return; 
    }`;

code = code.replace(oldCheck, newCheck);
fs.writeFileSync(file, code);

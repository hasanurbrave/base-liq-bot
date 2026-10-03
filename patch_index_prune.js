const fs = require('fs');
const file = 'bot/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const oldListener = `  healthScanner.on('liquidationOpportunity', (alert: AlertData) => {`;
const newListener = `  healthScanner.on('cleanBorrower', (address: string) => {
    borrowerIndex.removeBorrower(address);
  });

  healthScanner.on('liquidationOpportunity', (alert: AlertData) => {`;

code = code.replace(oldListener, newListener);
fs.writeFileSync(file, code);

const fs = require('fs');
const file = 'bot/src/monitor/healthScanner.ts';
let code = fs.readFileSync(file, 'utf8');

const oldDebounce = `    if (hf < 1.0) {
      const count = (this.lowHFCount.get(borrower.address) || 0) + 1;
      this.lowHFCount.set(borrower.address, count);
      
      if (count >= 2) {
        logger.warn('HealthScanner', \`LIQUIDATABLE: Borrower \${borrower.address} has confirmed HF < 1.0 (\${hf.toFixed(4)})\`);
        this.emit('liquidatable', borrower.address, hf);
        this.fetchFullPositionDetails(borrower.address, hf);
        this.lowHFCount.delete(borrower.address); 
      }
    } else {
      if (this.lowHFCount.has(borrower.address)) {
        this.lowHFCount.delete(borrower.address);
      }
    }`;

const newDebounce = `    if (hf < 1.0) {
      logger.warn('HealthScanner', \`LIQUIDATABLE: Borrower \${borrower.address} has HF < 1.0 (\${hf.toFixed(4)})\`);
      this.emit('liquidatable', borrower.address, hf);
      this.fetchFullPositionDetails(borrower.address, hf);
    }`;

code = code.replace(oldDebounce, newDebounce);
fs.writeFileSync(file, code);

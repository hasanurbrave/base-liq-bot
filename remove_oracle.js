const fs = require('fs');
const file = 'bot/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

// Remove OracleWatcher import
code = code.replace(/import { OracleWatcher } from '.\/monitor\/oracleWatcher';\n/, '');

// Remove instantiation
code = code.replace(/  const oracleWatcher = new OracleWatcher\(\);\n/, '');

// Remove start
code = code.replace(/  await oracleWatcher.start\(\);\n/, '');

// Remove listener
const listenerStr = `  // --- Listeners ---
  oracleWatcher.on('priceUpdated', async (data) => {
    if (initialized && !isShuttingDown) {
      const allBorrowers = borrowerIndex.getAllBorrowers();
      await healthScanner.scan(allBorrowers, 0, true);
    }
  });`;

code = code.replace(listenerStr, '  // --- Listeners ---');

fs.writeFileSync(file, code);

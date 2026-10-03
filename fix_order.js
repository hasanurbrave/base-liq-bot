const fs = require('fs');
let code = fs.readFileSync('bot/src/index.ts', 'utf8');

const cbBlock = `  // 3. Monitor Layer
  const circuitBreaker = new CircuitBreaker({
    maxConsecutiveReverts: 5,
    maxDailyLossUSD: 50.00,
    minWalletBalanceETH: 0.005
  }, provider, wallet.address);
  circuitBreaker.start();

  circuitBreaker.on('halt', (reason) => {
    logger.error('System', \`HALTING BOT: \${reason}\`);
    shutdown();
  });

`;

code = code.replace(cbBlock, '  // 3. Monitor Layer\n');
const insertPoint = `  // 1. Execution Layer`;
code = code.replace(insertPoint, cbBlock + insertPoint);

fs.writeFileSync('bot/src/index.ts', code);

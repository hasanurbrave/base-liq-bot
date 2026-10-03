const fs = require('fs');
let code = fs.readFileSync('bot/src/index.ts', 'utf8');

const cbHalt = `  circuitBreaker.on('halt', (reason) => {
    logger.error('System', \`HALTING BOT: \${reason}\`);
    shutdown();
  });\n\n`;

code = code.replace(cbHalt, '');

const afterShutdown = `  process.on('SIGTERM', shutdown);`;
code = code.replace(afterShutdown, afterShutdown + '\n\n' + cbHalt);

fs.writeFileSync('bot/src/index.ts', code);

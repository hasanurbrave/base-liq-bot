const fs = require('fs');
let code = fs.readFileSync('bot/src/monitor/circuitBreaker.ts', 'utf8');
code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');
code = code.replace(/\\\${/g, '${');
fs.writeFileSync('bot/src/monitor/circuitBreaker.ts', code);

// Same for index.ts if I messed it up?
let ix = fs.readFileSync('bot/src/index.ts', 'utf8');
ix = ix.replace(/\\`/g, '`');
ix = ix.replace(/\\\$/g, '$');
ix = ix.replace(/\\\${/g, '${');
fs.writeFileSync('bot/src/index.ts', ix);

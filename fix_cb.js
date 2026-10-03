const fs = require('fs');
let code = fs.readFileSync('bot/src/monitor/circuitBreaker.ts', 'utf8');

code = code.replace(
  `this.killSwitchPath = path.resolve(__dirname, '../../../../kill.switch');`,
  `this.killSwitchPath = path.resolve(process.cwd(), 'kill.switch');`
);

fs.writeFileSync('bot/src/monitor/circuitBreaker.ts', code);

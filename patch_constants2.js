const fs = require('fs');
const file = 'bot/src/config/constants.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/  isFrozen: boolean;\n\}/, '  isFrozen: boolean;\n  usageAsCollateralEnabled?: boolean;\n}');
fs.writeFileSync(file, code);

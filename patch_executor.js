const fs = require('fs');
const file = 'contracts/src/LiquidationExecutor.sol';
let code = fs.readFileSync(file, 'utf8');

const oldCheck = `        if (currentBalance < amountToRepay) {
            revert InsufficientProfit(amountToRepay, currentBalance);
        }`;

const newCheck = `        if (currentBalance < amountToRepay + liqParams.minProfit) {
            revert InsufficientProfit(amountToRepay + liqParams.minProfit, currentBalance);
        }`;

code = code.replace(oldCheck, newCheck);
fs.writeFileSync(file, code);

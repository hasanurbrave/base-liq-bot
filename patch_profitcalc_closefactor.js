const fs = require('fs');
const file = 'bot/src/simulation/profitCalculator.ts';
let code = fs.readFileSync(file, 'utf8');

// Add health factor to evaluatePair definition
code = code.replace(/private async evaluatePair\(/, `private async evaluatePair(\n    hf: number,`);

// Add health factor to evaluatePair call
code = code.replace(/const decision = await this.evaluatePair\(alert.borrower, collateral, debt, cAsset, dAsset\);/, `const decision = await this.evaluatePair(alert.healthFactor, alert.borrower, collateral, debt, cAsset, dAsset);`);

// Update closeFactor logic
const oldCloseFactor = `    // Aave V3 Close Factor is 50%
    const closeFactor = 0.5;
    let debtToCoverUSD = debt.usdValue * closeFactor;`;

const newCloseFactor = `    // H-09 Fix: Aave V3 Close Factor is 100% if HF < 0.95, else 50%
    const closeFactor = hf < 0.95 ? 1.0 : 0.5;
    let debtToCoverUSD = debt.usdValue * closeFactor;
    
    // Cap debtToCover by the actual collateral available (bonus adjusted)
    // If they have $1000 collateral, and bonus is 5%, max debt we can cover is $1000 / 1.05 = $952.38
    const maxDebtCoverable = collateral.usdValue / (cAsset.liquidationBonus / 10000);
    if (debtToCoverUSD > maxDebtCoverable) {
       debtToCoverUSD = maxDebtCoverable;
    }`;

code = code.replace(oldCloseFactor, newCloseFactor);
fs.writeFileSync(file, code);

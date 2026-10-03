const fs = require('fs');
const file = 'bot/src/simulation/profitCalculator.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `        if (cAsset.isFrozen || dAsset.isFrozen) {
           logger.debug('ProfitCalc', \`Skipping pair \${cAsset.symbol}/\${dAsset.symbol}: ASSET_FROZEN\`);
           continue;
        }`;

const insert = `        if (cAsset.isFrozen || dAsset.isFrozen) {
           logger.debug('ProfitCalc', \`Skipping pair \${collateral.asset}/\${debt.asset}: ASSET_FROZEN\`);
           continue;
        }
        if (cAsset.usageAsCollateralEnabled === false) {
           continue;
        }`;

code = code.replace(target, insert);
fs.writeFileSync(file, code);

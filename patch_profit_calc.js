const fs = require('fs');
const file = 'bot/src/simulation/profitCalculator.ts';
let code = fs.readFileSync(file, 'utf8');

const importReplacement = `import { ASSETS, POOL, POOL_ABI, AssetMetadata, LIQUIDATION_EXECUTOR, OWNER_ADDRESS } from '../config/constants';`;
code = code.replace(/import { ASSETS, POOL, POOL_ABI, AssetMetadata } from '\.\.\/config\/constants';/, importReplacement);

const oldGasEst = `    // Gas Estimation
    const tx = {
      to: POOL,
      data: this.poolInterface.encodeFunctionData('liquidationCall', [
        cAsset.address,
        dAsset.address,
        borrower,
        debtToCoverBigInt,
        false // receive underlying
      ]),
      from: "0x0000000000000000000000000000000000000001" // dummy sender
    };`;

const newGasEst = `    // Gas Estimation
    const EXECUTOR_ABI = [
      "function executeLiquidation(tuple(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, tuple(uint8 dex, uint24 fee, bool stable, address factory, uint256 minOut) swap) params) external"
    ];
    const executorIface = new ethers.Interface(EXECUTOR_ABI);
    
    const liquidationParams = {
        collateralAsset: cAsset.address,
        debtAsset: dAsset.address,
        user: borrower,
        debtToCover: debtToCoverBigInt,
        receiveAToken: false,
        swap: {
            dex: dex === 'aerodrome' ? 1 : 0,
            fee: 3000,
            stable: false,
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
            minOut: minSwapOutput
        }
    };
    
    const calldata = executorIface.encodeFunctionData("executeLiquidation", [liquidationParams]);

    const tx = {
      to: LIQUIDATION_EXECUTOR,
      data: calldata,
      from: OWNER_ADDRESS // real wallet address, not dummy!
    };`;

code = code.replace(oldGasEst, newGasEst);
fs.writeFileSync(file, code);

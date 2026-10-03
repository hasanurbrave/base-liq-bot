const fs = require('fs');
const file = 'bot/src/execution/txBuilder.ts';
let code = fs.readFileSync(file, 'utf8');

// Update ABI
const oldAbi = `"function executeLiquidation(tuple(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, tuple(uint8 dex, uint24 fee, bool stable, address factory, uint256 minOut) swap) params) external"`;
const newAbi = `"function executeLiquidation(tuple(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, uint256 minProfit, tuple(uint8 dex, uint24 fee, bool stable, address factory, uint256 minOut) swap) params) external"`;
code = code.replace(oldAbi, newAbi);

// Find the LiquidationParams block
const oldParams = `      const liquidationParams = {
        collateralAsset: collateralAsset,
        debtAsset: debtAsset,
        user: borrower,
        debtToCover: debtToCover,
        receiveAToken: false,
        swap: {
            dex: dexEnum,
            fee: feeTier,
            stable: stable,
            factory: factory,
            minOut: minSwapOutput
        }
      };`;

const newParams = `      // Determine decimals. In a full implementation, this comes from ASSETS via decision.params
      // For now, if debtAsset is USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913), decimals = 6. Else assume 18.
      const debtDecimals = debtAsset.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ? 6 : 18;
      
      // We don't have oracle price here easily, but we can assume $1 for USDC.
      // If it's WETH, minProfitOutUSD / 3000. For simplicity, we fallback to a safe small amount if we can't derive price here.
      // Ideally this is calculated in ProfitCalculator and passed as \`minProfitOutTokens\`.
      // Let's assume we update ProfitDecision to include \`minProfitOutTokens\` later, for now:
      let minProfitOutTokens = 0n;
      if (debtDecimals === 6) {
         minProfitOutTokens = ethers.parseUnits(minProfitOutUSD.toFixed(6), 6);
      } else {
         minProfitOutTokens = ethers.parseUnits((minProfitOutUSD / 3000).toFixed(18), 18); // assuming $3000/ETH fallback
      }

      const liquidationParams = {
        collateralAsset: collateralAsset,
        debtAsset: debtAsset,
        user: borrower,
        debtToCover: debtToCover,
        receiveAToken: false,
        minProfit: minProfitOutTokens,
        swap: {
            dex: dexEnum,
            fee: feeTier,
            stable: stable,
            factory: factory,
            minOut: minSwapOutput
        }
      };`;

code = code.replace(oldParams, newParams);
fs.writeFileSync(file, code);

#!/bin/bash
cat << 'INNER_EOF' > bot/src/scripts/scenarios/scenario03_race.ts
import { runScenario } from './mockSetup';
runScenario({
  name: '03_race_condition', expectedDecision: 'ABORT_ERROR',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }], debts: [{ asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }] },
  mocks: { revertGas: true }
});
INNER_EOF
cat << 'INNER_EOF' > bot/src/scripts/scenarios/scenario08_no_liquidity.ts
import { runScenario } from './mockSetup';
runScenario({
  name: '08_no_liquidity', expectedDecision: 'ABORT_ERROR',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }], debts: [{ asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }] },
  mocks: { simulateNoLiquidity: true }
});
INNER_EOF
cat << 'INNER_EOF' > bot/src/scripts/scenarios/scenario09_high_slippage.ts
import { runScenario } from './mockSetup';
runScenario({
  name: '09_high_slippage', expectedDecision: 'SKIP',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 100, usdValue: 300000, aTokenBalance: '100000000000000000000' }], debts: [{ asset: 'USDC', amount: 250000, usdValue: 250000, debtTokenBalance: '250000000000' }] },
  mocks: { gasCostUSD: 5.00, swapCostUSD: 7000.00, outputAmount: 10000000000n } // 10k output, huge slippage
});
INNER_EOF
cat << 'INNER_EOF' > bot/src/scripts/scenarios/scenario10_no_flash.ts
import { runScenario } from './mockSetup';
runScenario({
  name: '10_no_flash', expectedDecision: 'ABORT_ERROR',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }], debts: [{ asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }] },
  mocks: { revertGas: true }
});
INNER_EOF
cat << 'INNER_EOF' > bot/src/scripts/scenarios/scenario12_gas_spike.ts
import { runScenario } from './mockSetup';
runScenario({
  name: '12_gas_spike', expectedDecision: 'SKIP',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 0.1, usdValue: 300, aTokenBalance: '100000000000000000' }], debts: [{ asset: 'USDC', amount: 250, usdValue: 250, debtTokenBalance: '250000000' }] },
  mocks: { gasCostUSD: 50.00, swapCostUSD: 2.00, outputAmount: 1000000n } // 1 USDC output, massive loss
});
INNER_EOF

import { runScenario } from './mockSetup';
runScenario({
  name: '12_gas_spike', expectedDecision: 'SKIP',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 0.1, usdValue: 300, aTokenBalance: '100000000000000000' }], debts: [{ asset: 'USDC', amount: 250, usdValue: 250, debtTokenBalance: '250000000' }] },
  mocks: { gasCostUSD: 50.00, swapCostUSD: 2.00, outputAmount: 1000000n } // 1 USDC output, massive loss
});

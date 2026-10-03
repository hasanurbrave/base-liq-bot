import { runScenario } from './mockSetup';
runScenario({
  name: '02_tiny_unprofitable', expectedDecision: 'SKIP',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 0.002, usdValue: 6, aTokenBalance: '2000000000000000' }], debts: [{ asset: 'USDC', amount: 5, usdValue: 5, debtTokenBalance: '5000000' }] },
  mocks: { gasCostUSD: 2.50, swapCostUSD: 1.00, outputAmount: 5100000n }
});

import { runScenario } from './mockSetup';
runScenario({
  name: '01_simple_liquidation', expectedDecision: 'EXECUTE',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }], debts: [{ asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }] },
  mocks: { gasCostUSD: 2.50, swapCostUSD: 10.00, outputAmount: 2600000000n }
});

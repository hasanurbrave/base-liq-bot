import { runScenario } from './mockSetup';
runScenario({
  name: '06_close_factor', expectedDecision: 'EXECUTE',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 10, usdValue: 30000, aTokenBalance: '10000000000000000000' }], debts: [{ asset: 'USDC', amount: 20000, usdValue: 20000, debtTokenBalance: '20000000000' }] },
  mocks: { gasCostUSD: 5.00, swapCostUSD: 20.00, outputAmount: 10500000000n }
});

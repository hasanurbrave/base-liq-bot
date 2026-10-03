import { runScenario } from './mockSetup';
runScenario({
  name: '07_sequential_liquidation', expectedDecision: 'EXECUTE',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.98, collaterals: [{ asset: 'WETH', amount: 5, usdValue: 15000, aTokenBalance: '5000000000000000000' }], debts: [{ asset: 'USDC', amount: 10000, usdValue: 10000, debtTokenBalance: '10000000000' }] },
  mocks: { gasCostUSD: 5.00, swapCostUSD: 20.00, outputAmount: 5250000000n }
});

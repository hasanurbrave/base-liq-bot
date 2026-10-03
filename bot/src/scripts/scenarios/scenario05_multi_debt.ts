import { runScenario } from './mockSetup';
runScenario({
  name: '05_multi_debt', expectedDecision: 'EXECUTE',
  alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 2, usdValue: 6000, aTokenBalance: '2000000000000000000' }], debts: [{ asset: 'cbETH', amount: 0.001, usdValue: 3, debtTokenBalance: '1000000000000000' }, { asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }] },
  mocks: { gasCostUSD: 2.50, swapCostUSD: 10.00, outputAmount: 2600000000n }
});

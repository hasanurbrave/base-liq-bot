"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '09_high_slippage', expectedDecision: 'SKIP',
    alert: { type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95, collaterals: [{ asset: 'WETH', amount: 100, usdValue: 300000, aTokenBalance: '100000000000000000000' }], debts: [{ asset: 'USDC', amount: 250000, usdValue: 250000, debtTokenBalance: '250000000000' }] },
    mocks: { gasCostUSD: 5.00, swapCostUSD: 7000.00, outputAmount: 10000000000n } // 10k output, huge slippage
});

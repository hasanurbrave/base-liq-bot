"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '09_high_slippage',
    expectedDecision: 'SKIP',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: 100, usdValue: 300000, aTokenBalance: '100000000000000000000' }],
        debts: [{ asset: 'USDC', amount: 250000, usdValue: 250000, debtTokenBalance: '250000000000' }]
    },
    // Gross revenue 5% of 125,000 = $6,250. Slippage/swap cost = $7000. Loss!
    mocks: { gasCostUSD: 5.00, swapCostUSD: 7000.00 }
});

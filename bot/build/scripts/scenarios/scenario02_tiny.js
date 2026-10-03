"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '02_tiny_unprofitable',
    expectedDecision: 'SKIP',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: 0.002, usdValue: 6, aTokenBalance: '2000000000000000' }],
        debts: [{ asset: 'USDC', amount: 5, usdValue: 5, debtTokenBalance: '5000000' }]
    },
    mocks: { gasCostUSD: 2.50, swapCostUSD: 1.00 } // Revenue is ~0.25 (5% bonus on $5), Gas is 2.50 -> Unprofitable
});

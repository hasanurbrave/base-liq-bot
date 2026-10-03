"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '08_no_liquidity',
    expectedDecision: 'SKIP',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [{ asset: 'cbETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }],
        debts: [{ asset: 'USDbC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }]
    },
    // If swap cost is > gross revenue or simulation fails
    mocks: { gasCostUSD: 2.50, swapCostUSD: 5000.00 }
});

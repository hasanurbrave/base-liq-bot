"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '07_sequential_liquidation',
    expectedDecision: 'EXECUTE',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.98, // Still < 1 after first liq
        collaterals: [{ asset: 'WETH', amount: 5, usdValue: 15000, aTokenBalance: '5000000000000000000' }],
        debts: [{ asset: 'USDC', amount: 10000, usdValue: 10000, debtTokenBalance: '10000000000' }]
    },
    mocks: { gasCostUSD: 5.00, swapCostUSD: 20.00 }
});

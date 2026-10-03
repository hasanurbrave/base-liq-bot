"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '05_multi_debt',
    expectedDecision: 'EXECUTE',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: 2, usdValue: 6000, aTokenBalance: '2000000000000000000' }],
        debts: [
            { asset: 'USDbC', amount: 10, usdValue: 10, debtTokenBalance: '10000000' },
            { asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }
        ]
    },
    mocks: { gasCostUSD: 2.50, swapCostUSD: 10.00 } // Should pick USDC to maximize debtToCover
});

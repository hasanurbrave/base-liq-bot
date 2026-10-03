"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '04_multi_collateral',
    expectedDecision: 'EXECUTE',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [
            { asset: 'USDbC', amount: 10, usdValue: 10, aTokenBalance: '10000000' },
            { asset: 'WETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }
        ],
        debts: [{ asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }]
    },
    mocks: { gasCostUSD: 2.50, swapCostUSD: 10.00 } // Should pick WETH to maximize debtToCover
});

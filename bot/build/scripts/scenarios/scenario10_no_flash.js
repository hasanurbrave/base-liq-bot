"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '10_no_flash',
    expectedDecision: 'SKIP',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }],
        debts: [{ asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }]
    },
    // We can simulate lack of flash loan by a gas revert
    mocks: { revertGas: true }
});

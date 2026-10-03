"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '06_close_factor',
    expectedDecision: 'EXECUTE',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: 10, usdValue: 30000, aTokenBalance: '10000000000000000000' }],
        debts: [{ asset: 'USDC', amount: 20000, usdValue: 20000, debtTokenBalance: '20000000000' }]
    },
    mocks: { gasCostUSD: 5.00, swapCostUSD: 20.00 } // DebtToCover should be capped at 10000 (50%)
});

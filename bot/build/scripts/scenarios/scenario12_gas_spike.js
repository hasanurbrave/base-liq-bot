"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '12_gas_spike',
    expectedDecision: 'SKIP',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0xTest", healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: 0.1, usdValue: 300, aTokenBalance: '100000000000000000' }],
        debts: [{ asset: 'USDC', amount: 250, usdValue: 250, debtTokenBalance: '250000000' }]
    },
    // Revenue = ~6.25. Gas cost = 25.00 -> Unprofitable
    mocks: { gasCostUSD: 25.00, swapCostUSD: 2.00 }
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockSetup_1 = require("./mockSetup");
(0, mockSetup_1.runScenario)({
    name: '11_rpc_failure',
    expectedDecision: 'ERROR',
    alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: "0x0000000000000000000000000000000000000001", healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: 1, usdValue: 3000, aTokenBalance: '1000000000000000000' }],
        debts: [{ asset: 'USDC', amount: 2500, usdValue: 2500, debtTokenBalance: '2500000000' }]
    },
    mocks: { throwRpcError: true }
}).catch(() => { });

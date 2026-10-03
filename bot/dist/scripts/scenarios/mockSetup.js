"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockProvider = void 0;
exports.runScenario = runScenario;
const ethers_1 = require("ethers");
const profitCalculator_1 = require("../../simulation/profitCalculator");
const gasEstimator_1 = require("../../simulation/gasEstimator");
const swapSimulator_1 = require("../../simulation/swapSimulator");
// Provide Jest mocks manually if running in ts-node
if (typeof global.jest === 'undefined') {
    global.jest = {
        fn: () => {
            let mockImpl = (async () => { });
            const fn = (...args) => mockImpl(...args);
            fn.mockResolvedValue = (val) => { mockImpl = async () => val; return fn; };
            fn.mockRejectedValue = (err) => { mockImpl = async () => { throw err; }; return fn; };
            return fn;
        }
    };
}
exports.mockProvider = new ethers_1.ethers.JsonRpcProvider("http://localhost:8545");
async function runScenario(config) {
    console.log(`\n=============================================================`);
    console.log(`🚀 RUNNING SCENARIO: ${config.name}`);
    console.log(`=============================================================`);
    // Stub GasEstimator
    const gasEstimator = new gasEstimator_1.GasEstimator(exports.mockProvider);
    if (config.mocks?.throwRpcError) {
        gasEstimator.estimate = global.jest.fn().mockRejectedValue(new Error("RPC Timeout"));
    }
    else {
        gasEstimator.estimate = global.jest.fn().mockResolvedValue(config.mocks?.revertGas ? { success: false, reason: "execution reverted" } : { success: true, totalCostUSD: config.mocks?.gasCostUSD || 2.50 });
    }
    // Stub SwapSimulator
    const swapSimulator = new swapSimulator_1.SwapSimulator(exports.mockProvider);
    swapSimulator.getBestQuote = global.jest.fn().mockResolvedValue(config.mocks?.simulateNoLiquidity ?
        { success: false, reason: "NO_POOL" } :
        {
            success: true,
            dex: "UNISWAP_V3",
            route: "0x",
            outputAmount: config.mocks?.outputAmount !== undefined ? config.mocks.outputAmount : 3000000000n,
            estimatedGas: 100000n,
            calldata: "0x",
            swapCostUSD: config.mocks?.swapCostUSD !== undefined ? config.mocks.swapCostUSD : 10.00
        });
    const profitCalculator = new profitCalculator_1.ProfitCalculator(gasEstimator, swapSimulator);
    let actualDecision = "EXECUTE";
    let reason = "";
    try {
        const result = await profitCalculator.evaluateAllPairs(config.alert);
        actualDecision = result.decision;
        reason = result.reason || "";
        if (result.decision === "EXECUTE") {
            console.log(`✅ EVALUATION: EXECUTE`);
            console.log(`   Gross Revenue: $${result.breakdown?.grossRevenueUSD.toFixed(2)}`);
            console.log(`   Gas Cost:      $${result.breakdown?.gasCostUSD.toFixed(2)}`);
            console.log(`   Net Profit:    $${result.breakdown?.netProfitUSD.toFixed(2)}`);
        }
        else {
            console.log(`🚫 EVALUATION: SKIP (${actualDecision} - ${reason})`);
        }
    }
    catch (e) {
        actualDecision = "ERROR";
        reason = e.message;
        console.log(`❌ ERROR: ${e.message}`);
    }
    const pass = (actualDecision === config.expectedDecision) || (actualDecision.includes('SKIP') && config.expectedDecision.includes('SKIP'));
    console.log(`-------------------------------------------------------------`);
    console.log(`RESULT: ${pass ? '✅ PASS' : '❌ FAIL'} (Expected: ${config.expectedDecision}, Got: ${actualDecision})`);
    console.log(`=============================================================\n`);
    return pass;
}

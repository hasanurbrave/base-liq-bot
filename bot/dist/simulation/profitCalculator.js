"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfitCalculator = exports.THRESHOLDS = void 0;
const ethers_1 = require("ethers");
const constants_1 = require("../config/constants");
const logger_1 = require("../utils/logger");
exports.THRESHOLDS = {
    MIN_PROFIT_USD: 1.00,
    MAX_SLIPPAGE_BPS: 50, // 0.5%
    GAS_BUFFER_MULTIPLIER: 1.20,
    MAX_POSITION_SIZE_USD: 10000,
};
class ProfitCalculator {
    gasEstimator;
    swapSimulator;
    poolInterface;
    constructor(gasEstimator, swapSimulator) {
        this.gasEstimator = gasEstimator;
        this.swapSimulator = swapSimulator;
        this.poolInterface = new ethers_1.ethers.Interface(constants_1.POOL_ABI);
    }
    async evaluateAllPairs(alert) {
        const start = performance.now();
        if (alert.collaterals.length === 0 || alert.debts.length === 0) {
            return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: "NO_ASSETS_FOUND" };
        }
        let bestDecision = null;
        for (const collateral of alert.collaterals) {
            for (const debt of alert.debts) {
                const cAsset = constants_1.ASSETS[collateral.asset];
                const dAsset = constants_1.ASSETS[debt.asset];
                if (!cAsset || !dAsset)
                    continue;
                if (cAsset.isFrozen || dAsset.isFrozen) {
                    logger_1.logger.debug('ProfitCalc', `Skipping pair ${cAsset.symbol}/${dAsset.symbol}: ASSET_FROZEN`);
                    continue;
                }
                const decision = await this.evaluatePair(alert.borrower, collateral, debt, cAsset, dAsset);
                if (!bestDecision || decision.breakdown.netProfitUSD > bestDecision.breakdown.netProfitUSD) {
                    bestDecision = decision;
                }
            }
        }
        const latency = performance.now() - start;
        if (bestDecision) {
            logger_1.logger.info('ProfitCalc', `Evaluated all pairs in ${latency.toFixed(2)}ms. Best decision: ${bestDecision.decision} (${bestDecision.reason})`);
            return bestDecision;
        }
        return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: "NO_VALID_PAIRS_EVALUATED" };
    }
    async evaluatePair(borrower, collateral, debt, cAsset, dAsset) {
        // Check Dust
        if (debt.usdValue < 1.0) {
            return { decision: "SKIP_UNPROFITABLE", breakdown: this.emptyBreakdown(), reason: "DUST_POSITION" };
        }
        // Aave V3 Close Factor is 50%
        const closeFactor = 0.5;
        let debtToCoverUSD = debt.usdValue * closeFactor;
        if (debtToCoverUSD > exports.THRESHOLDS.MAX_POSITION_SIZE_USD) {
            debtToCoverUSD = exports.THRESHOLDS.MAX_POSITION_SIZE_USD;
        }
        const priceOfDebtAsset = debt.usdValue / debt.amount;
        const debtToCoverTokens = debtToCoverUSD / priceOfDebtAsset;
        const debtToCoverBigInt = ethers_1.ethers.parseUnits(debtToCoverTokens.toFixed(dAsset.decimals), dAsset.decimals);
        const bonus = cAsset.liquidationBonus / 10000; // e.g. 10500 / 10000 = 1.05 -> 5% bonus
        const grossRevenueUSD = debtToCoverUSD * (bonus - 1.0);
        // Flash loan fee (Aave is 0.05%)
        const flashLoanFeeUSD = debtToCoverUSD * 0.0005;
        // We will receive collateral: roughly (debtToCoverUSD * bonus) in collateral tokens
        const priceOfCollateralAsset = collateral.usdValue / collateral.amount;
        const expectedCollateralTokens = (debtToCoverUSD * bonus) / priceOfCollateralAsset;
        const expectedCollateralBigInt = ethers_1.ethers.parseUnits(expectedCollateralTokens.toFixed(cAsset.decimals), cAsset.decimals);
        // Swap simulator: We swap expectedCollateral back to Debt asset to repay flash loan
        // Or we swap to USDC. Assuming flash loan was in Debt Asset, we must swap Collateral -> Debt
        let swapCostUSD = 0;
        let swapRoute = [];
        let dex = "";
        let minSwapOutput = 0n;
        if (cAsset.address !== dAsset.address) {
            const quote = await this.swapSimulator.getBestQuote(cAsset.address, dAsset.address, expectedCollateralBigInt);
            if (!quote.success) {
                return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: quote.reason === 'NO_POOL' ? "NO_SWAP_ROUTE" : quote.reason || "SWAP_QUOTE_FAILED" };
            }
            const expectedOutWithoutSlippage = debtToCoverTokens * bonus;
            const actualOutTokens = Number(ethers_1.ethers.formatUnits(quote.outputAmount, dAsset.decimals));
            swapCostUSD = (expectedOutWithoutSlippage - actualOutTokens) * priceOfDebtAsset;
            swapRoute = quote.route;
            dex = quote.dex;
            minSwapOutput = (quote.outputAmount * 995n) / 1000n; // 0.5% max slippage applied to quote
        }
        else {
            // Same asset (e.g. USDC debt, USDC collateral). No swap needed.
            minSwapOutput = expectedCollateralBigInt;
        }
        // Gas Estimation
        const EXECUTOR_ABI = [
            "function executeLiquidation(tuple(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, tuple(uint8 dex, uint24 fee, bool stable, address factory, uint256 minOut) swap) params) external"
        ];
        const executorIface = new ethers_1.ethers.Interface(EXECUTOR_ABI);
        const liquidationParams = {
            collateralAsset: cAsset.address,
            debtAsset: dAsset.address,
            user: borrower,
            debtToCover: debtToCoverBigInt,
            receiveAToken: false,
            swap: {
                dex: dex === 'aerodrome' ? 1 : 0,
                fee: 3000,
                stable: false,
                factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
                minOut: minSwapOutput
            }
        };
        const calldata = executorIface.encodeFunctionData("executeLiquidation", [liquidationParams]);
        const tx = {
            to: constants_1.LIQUIDATION_EXECUTOR,
            data: calldata,
            from: constants_1.OWNER_ADDRESS // real wallet address, not dummy!
        };
        const gasEst = await this.gasEstimator.estimate(tx);
        let gasCostUSD = 0;
        if (gasEst.success) {
            gasCostUSD = gasEst.totalCostUSD || 0;
        }
        else {
            return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: `GAS_ESTIMATE_FAILED: ${gasEst.reason}` };
        }
        // Net Profit
        const netProfitUSD = grossRevenueUSD - flashLoanFeeUSD - swapCostUSD - gasCostUSD;
        const profitMarginPercent = (netProfitUSD / debtToCoverUSD) * 100;
        const breakdown = {
            grossRevenueUSD,
            flashLoanFeeUSD,
            swapCostUSD,
            gasCostUSD,
            netProfitUSD,
            profitMarginPercent
        };
        let decision = "ABORT_ERROR";
        let reason = "";
        if (netProfitUSD > exports.THRESHOLDS.MIN_PROFIT_USD) {
            decision = "EXECUTE";
            reason = `Profitable: $${netProfitUSD.toFixed(2)}`;
        }
        else if (netProfitUSD > 0) {
            decision = "SKIP_MARGINAL";
            reason = `Marginal Profit: $${netProfitUSD.toFixed(2)} (< $${exports.THRESHOLDS.MIN_PROFIT_USD})`;
        }
        else {
            decision = "SKIP_UNPROFITABLE";
            reason = `Unprofitable: $${netProfitUSD.toFixed(2)}`;
        }
        return {
            decision,
            breakdown,
            params: decision === "EXECUTE" ? {
                collateralAsset: cAsset.address,
                debtAsset: dAsset.address,
                borrower,
                debtToCover: debtToCoverBigInt,
                flashLoanAsset: dAsset.address,
                flashLoanAmount: debtToCoverBigInt,
                swapRoute,
                dex,
                minSwapOutput,
                minProfitOutUSD: exports.THRESHOLDS.MIN_PROFIT_USD
            } : undefined,
            reason
        };
    }
    emptyBreakdown() {
        return {
            grossRevenueUSD: 0,
            flashLoanFeeUSD: 0,
            swapCostUSD: 0,
            gasCostUSD: 0,
            netProfitUSD: 0,
            profitMarginPercent: 0
        };
    }
}
exports.ProfitCalculator = ProfitCalculator;

"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfitCalculator = exports.THRESHOLDS = void 0;
var ethers_1 = require("ethers");
var constants_1 = require("../config/constants");
var logger_1 = require("../utils/logger");
exports.THRESHOLDS = {
    MIN_PROFIT_USD: 1.00,
    MAX_SLIPPAGE_BPS: 50, // 0.5%
    GAS_BUFFER_MULTIPLIER: 1.20,
    MAX_POSITION_SIZE_USD: 10000,
};
var ProfitCalculator = /** @class */ (function () {
    function ProfitCalculator(gasEstimator, swapSimulator) {
        this.gasEstimator = gasEstimator;
        this.swapSimulator = swapSimulator;
        this.poolInterface = new ethers_1.ethers.Interface(constants_1.POOL_ABI);
    }
    ProfitCalculator.prototype.evaluateAllPairs = function (alert) {
        return __awaiter(this, void 0, void 0, function () {
            var start, bestDecision, _i, _a, collateral, _b, _c, debt, cAsset, dAsset, decision, latency;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        start = performance.now();
                        if (alert.collaterals.length === 0 || alert.debts.length === 0) {
                            return [2 /*return*/, { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: "NO_ASSETS_FOUND" }];
                        }
                        bestDecision = null;
                        _i = 0, _a = alert.collaterals;
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        collateral = _a[_i];
                        _b = 0, _c = alert.debts;
                        _d.label = 2;
                    case 2:
                        if (!(_b < _c.length)) return [3 /*break*/, 5];
                        debt = _c[_b];
                        cAsset = constants_1.ASSETS[collateral.asset];
                        dAsset = constants_1.ASSETS[debt.asset];
                        if (!cAsset || !dAsset)
                            return [3 /*break*/, 4];
                        if (cAsset.isFrozen || dAsset.isFrozen) {
                            logger_1.logger.debug('ProfitCalc', "Skipping pair ".concat(cAsset.symbol, "/").concat(dAsset.symbol, ": ASSET_FROZEN"));
                            return [3 /*break*/, 4];
                        }
                        return [4 /*yield*/, this.evaluatePair(alert.borrower, collateral, debt, cAsset, dAsset)];
                    case 3:
                        decision = _d.sent();
                        if (!bestDecision || decision.breakdown.netProfitUSD > bestDecision.breakdown.netProfitUSD) {
                            bestDecision = decision;
                        }
                        _d.label = 4;
                    case 4:
                        _b++;
                        return [3 /*break*/, 2];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        latency = performance.now() - start;
                        if (bestDecision) {
                            logger_1.logger.info('ProfitCalc', "Evaluated all pairs in ".concat(latency.toFixed(2), "ms. Best decision: ").concat(bestDecision.decision, " (").concat(bestDecision.reason, ")"));
                            return [2 /*return*/, bestDecision];
                        }
                        return [2 /*return*/, { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: "NO_VALID_PAIRS_EVALUATED" }];
                }
            });
        });
    };
    ProfitCalculator.prototype.evaluatePair = function (borrower, collateral, debt, cAsset, dAsset) {
        return __awaiter(this, void 0, void 0, function () {
            var closeFactor, debtToCoverUSD, priceOfDebtAsset, debtToCoverTokens, debtToCoverBigInt, bonus, grossRevenueUSD, flashLoanFeeUSD, priceOfCollateralAsset, expectedCollateralTokens, expectedCollateralBigInt, swapCostUSD, swapRoute, dex, minSwapOutput, quote, expectedOutWithoutSlippage, actualOutTokens, tx, gasEst, gasCostUSD, netProfitUSD, profitMarginPercent, breakdown, decision, reason;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Check Dust
                        if (debt.usdValue < 1.0) {
                            return [2 /*return*/, { decision: "SKIP_UNPROFITABLE", breakdown: this.emptyBreakdown(), reason: "DUST_POSITION" }];
                        }
                        closeFactor = 0.5;
                        debtToCoverUSD = debt.usdValue * closeFactor;
                        if (debtToCoverUSD > exports.THRESHOLDS.MAX_POSITION_SIZE_USD) {
                            debtToCoverUSD = exports.THRESHOLDS.MAX_POSITION_SIZE_USD;
                        }
                        priceOfDebtAsset = debt.usdValue / debt.amount;
                        debtToCoverTokens = debtToCoverUSD / priceOfDebtAsset;
                        debtToCoverBigInt = ethers_1.ethers.parseUnits(debtToCoverTokens.toFixed(dAsset.decimals), dAsset.decimals);
                        bonus = cAsset.liquidationBonus / 10000;
                        grossRevenueUSD = debtToCoverUSD * (bonus - 1.0);
                        flashLoanFeeUSD = debtToCoverUSD * 0.0005;
                        priceOfCollateralAsset = collateral.usdValue / collateral.amount;
                        expectedCollateralTokens = (debtToCoverUSD * bonus) / priceOfCollateralAsset;
                        expectedCollateralBigInt = ethers_1.ethers.parseUnits(expectedCollateralTokens.toFixed(cAsset.decimals), cAsset.decimals);
                        swapCostUSD = 0;
                        swapRoute = [];
                        dex = "";
                        minSwapOutput = 0n;
                        if (!(cAsset.address !== dAsset.address)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.swapSimulator.getBestQuote(cAsset.address, dAsset.address, expectedCollateralBigInt)];
                    case 1:
                        quote = _a.sent();
                        if (!quote.success) {
                            return [2 /*return*/, { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: quote.reason === 'NO_POOL' ? "NO_SWAP_ROUTE" : quote.reason || "SWAP_QUOTE_FAILED" }];
                        }
                        expectedOutWithoutSlippage = debtToCoverTokens * bonus;
                        actualOutTokens = Number(ethers_1.ethers.formatUnits(quote.outputAmount, dAsset.decimals));
                        swapCostUSD = (expectedOutWithoutSlippage - actualOutTokens) * priceOfDebtAsset;
                        swapRoute = quote.route;
                        dex = quote.dex;
                        minSwapOutput = (quote.outputAmount * 995n) / 1000n; // 0.5% max slippage applied to quote
                        return [3 /*break*/, 3];
                    case 2:
                        // Same asset (e.g. USDC debt, USDC collateral). No swap needed.
                        minSwapOutput = expectedCollateralBigInt;
                        _a.label = 3;
                    case 3:
                        tx = {
                            to: constants_1.POOL,
                            data: this.poolInterface.encodeFunctionData('liquidationCall', [
                                cAsset.address,
                                dAsset.address,
                                borrower,
                                debtToCoverBigInt,
                                false // receive underlying
                            ]),
                            from: "0x0000000000000000000000000000000000000001" // dummy sender
                        };
                        return [4 /*yield*/, this.gasEstimator.estimate(tx)];
                    case 4:
                        gasEst = _a.sent();
                        gasCostUSD = 0;
                        if (gasEst.success) {
                            gasCostUSD = gasEst.totalCostUSD || 0;
                        }
                        else {
                            return [2 /*return*/, { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: "GAS_ESTIMATE_FAILED: ".concat(gasEst.reason) }];
                        }
                        netProfitUSD = grossRevenueUSD - flashLoanFeeUSD - swapCostUSD - gasCostUSD;
                        profitMarginPercent = (netProfitUSD / debtToCoverUSD) * 100;
                        breakdown = {
                            grossRevenueUSD: grossRevenueUSD,
                            flashLoanFeeUSD: flashLoanFeeUSD,
                            swapCostUSD: swapCostUSD,
                            gasCostUSD: gasCostUSD,
                            netProfitUSD: netProfitUSD,
                            profitMarginPercent: profitMarginPercent
                        };
                        decision = "ABORT_ERROR";
                        reason = "";
                        if (netProfitUSD > exports.THRESHOLDS.MIN_PROFIT_USD) {
                            decision = "EXECUTE";
                            reason = "Profitable: $".concat(netProfitUSD.toFixed(2));
                        }
                        else if (netProfitUSD > 0) {
                            decision = "SKIP_MARGINAL";
                            reason = "Marginal Profit: $".concat(netProfitUSD.toFixed(2), " (< $").concat(exports.THRESHOLDS.MIN_PROFIT_USD, ")");
                        }
                        else {
                            decision = "SKIP_UNPROFITABLE";
                            reason = "Unprofitable: $".concat(netProfitUSD.toFixed(2));
                        }
                        return [2 /*return*/, {
                                decision: decision,
                                breakdown: breakdown,
                                params: decision === "EXECUTE" ? {
                                    collateralAsset: cAsset.address,
                                    debtAsset: dAsset.address,
                                    borrower: borrower,
                                    debtToCover: debtToCoverBigInt,
                                    flashLoanAsset: dAsset.address,
                                    flashLoanAmount: debtToCoverBigInt,
                                    swapRoute: swapRoute,
                                    dex: dex,
                                    minSwapOutput: minSwapOutput,
                                    minProfitOutUSD: exports.THRESHOLDS.MIN_PROFIT_USD
                                } : undefined,
                                reason: reason
                            }];
                }
            });
        });
    };
    ProfitCalculator.prototype.emptyBreakdown = function () {
        return {
            grossRevenueUSD: 0,
            flashLoanFeeUSD: 0,
            swapCostUSD: 0,
            gasCostUSD: 0,
            netProfitUSD: 0,
            profitMarginPercent: 0
        };
    };
    return ProfitCalculator;
}());
exports.ProfitCalculator = ProfitCalculator;

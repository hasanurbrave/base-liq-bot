"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.HealthScanner = void 0;
var ethers_1 = require("ethers");
var events_1 = require("events");
var env_1 = require("../config/env");
var constants_1 = require("../config/constants");
var logger_1 = require("../utils/logger");
var MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
var MULTICALL3_ABI = [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)"
];
var HealthScanner = /** @class */ (function (_super) {
    __extends(HealthScanner, _super);
    function HealthScanner() {
        var _this = _super.call(this) || this;
        // Track consecutive scans where HF < 1.0
        _this.lowHFCount = new Map();
        // HTTP provider is generally better for large static calls (Multicall)
        _this.provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
        _this.multicall = new ethers_1.ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, _this.provider);
        _this.poolInterface = new ethers_1.ethers.Interface(constants_1.POOL_ABI);
        return _this;
    }
    HealthScanner.prototype.scan = function (borrowers_1, blockNumber_1) {
        return __awaiter(this, arguments, void 0, function (borrowers, blockNumber, forceRescan) {
            var toScan, _i, borrowers_2, b, mod, start, CHUNK_SIZE, i, chunk, duration;
            if (forceRescan === void 0) { forceRescan = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        toScan = [];
                        // Determine which borrowers to scan this block based on tier frequencies
                        for (_i = 0, borrowers_2 = borrowers; _i < borrowers_2.length; _i++) {
                            b = borrowers_2[_i];
                            if (forceRescan && (b.tier === 'Critical' || b.tier === 'Warning')) {
                                toScan.push(b);
                                continue;
                            }
                            mod = blockNumber % 150;
                            if (b.tier === 'Critical' || b.tier === 'Unknown') {
                                toScan.push(b); // Every block
                            }
                            else if (b.tier === 'Warning' && blockNumber % 5 === 0) {
                                toScan.push(b);
                            }
                            else if (b.tier === 'Watch' && blockNumber % 30 === 0) {
                                toScan.push(b);
                            }
                            else if (b.tier === 'Safe' && blockNumber % 150 === 0) {
                                toScan.push(b);
                            }
                        }
                        if (toScan.length === 0)
                            return [2 /*return*/];
                        start = performance.now();
                        CHUNK_SIZE = 200;
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < toScan.length)) return [3 /*break*/, 4];
                        chunk = toScan.slice(i, i + CHUNK_SIZE);
                        return [4 /*yield*/, this.executeBatch(chunk)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        i += CHUNK_SIZE;
                        return [3 /*break*/, 1];
                    case 4:
                        duration = performance.now() - start;
                        if (forceRescan) {
                            logger_1.logger.info('HealthScanner', "Force re-scanned ".concat(toScan.length, " at-risk accounts in ").concat(duration.toFixed(2), "ms"));
                        }
                        else if (toScan.length > 50 || duration > 100) {
                            logger_1.logger.info('HealthScanner', "Scanned ".concat(toScan.length, " accounts in ").concat(duration.toFixed(2), "ms (Block ").concat(blockNumber, ")"));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    HealthScanner.prototype.executeBatch = function (borrowers) {
        return __awaiter(this, void 0, void 0, function () {
            var calls, results, i, decoded, hfBigInt, MAX_HF, actualHf, hfValue, totalDebtBase, e_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        calls = borrowers.map(function (b) { return ({
                            target: constants_1.POOL,
                            allowFailure: true,
                            callData: _this.poolInterface.encodeFunctionData('getUserAccountData', [b.address])
                        }); });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.multicall.aggregate3.staticCall(calls)];
                    case 2:
                        results = _a.sent();
                        for (i = 0; i < results.length; i++) {
                            if (!results[i].success)
                                continue;
                            decoded = this.poolInterface.decodeFunctionResult('getUserAccountData', results[i].returnData);
                            hfBigInt = decoded.healthFactor;
                            MAX_HF = ethers_1.ethers.parseUnits("100", 18);
                            actualHf = hfBigInt > MAX_HF ? MAX_HF : hfBigInt;
                            hfValue = Number(ethers_1.ethers.formatUnits(actualHf, 18));
                            totalDebtBase = decoded.totalDebtBase;
                            this.processHF(borrowers[i], hfValue, totalDebtBase);
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _a.sent();
                        logger_1.logger.error('HealthScanner', "Multicall batch failed: ".concat(e_1.message));
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    HealthScanner.prototype.processHF = function (borrower, hf, totalDebtBase) {
        var oldTier = borrower.tier;
        borrower.estimatedHF = hf;
        // Tier classification
        if (hf < 1.05)
            borrower.tier = 'Critical';
        else if (hf < 1.15)
            borrower.tier = 'Warning';
        else if (hf < 1.30)
            borrower.tier = 'Watch';
        else
            borrower.tier = 'Safe';
        // Transition logging
        if (oldTier !== 'Unknown' && oldTier !== borrower.tier) {
            if ((oldTier === 'Safe' && borrower.tier !== 'Safe') ||
                (oldTier === 'Watch' && (borrower.tier === 'Warning' || borrower.tier === 'Critical')) ||
                (oldTier === 'Warning' && borrower.tier === 'Critical')) {
                logger_1.logger.warn('HealthScanner', "ESCALATION: Borrower ".concat(borrower.address, " moved from ").concat(oldTier, " to ").concat(borrower.tier, " (HF: ").concat(hf.toFixed(4), ")"));
            }
        }
        // Liquidation debounce logic
        // Dust filter: Require at least $10 of debt (8 decimals = 1_000_000_000n)
        if (hf < 1.0 && totalDebtBase > 1000000000n) {
            var count = (this.lowHFCount.get(borrower.address) || 0) + 1;
            this.lowHFCount.set(borrower.address, count);
            if (count >= 2) {
                logger_1.logger.warn('HealthScanner', "LIQUIDATABLE: Borrower ".concat(borrower.address, " has confirmed HF < 1.0 (").concat(hf.toFixed(4), ")"));
                this.emit('liquidatable', borrower.address, hf);
                this.fetchFullPositionDetails(borrower.address, hf);
                this.lowHFCount.delete(borrower.address);
            }
        }
        else {
            if (this.lowHFCount.has(borrower.address)) {
                this.lowHFCount.delete(borrower.address);
            }
        }
    };
    HealthScanner.prototype.fetchFullPositionDetails = function (userAddress, hf) {
        return __awaiter(this, void 0, void 0, function () {
            var dataProvider, oracle, calls, _i, SUPPORTED_ASSETS_1, asset, results, collaterals, debts, totalCollateralUsd, totalDebtUsd, i, asset, reserveDataRes, priceRes, reserveData, priceData, priceBase, aTokenBalance, variableDebt, amount, usdValue, amount, usdValue, size, urgency, alert_1, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        dataProvider = new ethers_1.ethers.Interface(constants_1.POOL_DATA_PROVIDER_ABI);
                        oracle = new ethers_1.ethers.Interface(constants_1.ORACLE_ABI);
                        calls = [];
                        // Build multicall for all assets
                        for (_i = 0, SUPPORTED_ASSETS_1 = constants_1.SUPPORTED_ASSETS; _i < SUPPORTED_ASSETS_1.length; _i++) {
                            asset = SUPPORTED_ASSETS_1[_i];
                            calls.push({
                                target: constants_1.POOL_DATA_PROVIDER,
                                allowFailure: true,
                                callData: dataProvider.encodeFunctionData('getUserReserveData', [asset.address, userAddress])
                            });
                            calls.push({
                                target: constants_1.ORACLE,
                                allowFailure: true,
                                callData: oracle.encodeFunctionData('getAssetPrice', [asset.address])
                            });
                        }
                        return [4 /*yield*/, this.multicall.aggregate3.staticCall(calls)];
                    case 1:
                        results = _a.sent();
                        collaterals = [];
                        debts = [];
                        totalCollateralUsd = 0;
                        totalDebtUsd = 0;
                        for (i = 0; i < constants_1.SUPPORTED_ASSETS.length; i++) {
                            asset = constants_1.SUPPORTED_ASSETS[i];
                            reserveDataRes = results[i * 2];
                            priceRes = results[i * 2 + 1];
                            if (!reserveDataRes.success || !priceRes.success)
                                continue;
                            reserveData = dataProvider.decodeFunctionResult('getUserReserveData', reserveDataRes.returnData);
                            priceData = oracle.decodeFunctionResult('getAssetPrice', priceRes.returnData);
                            priceBase = Number(ethers_1.ethers.formatUnits(priceData[0], 8));
                            aTokenBalance = reserveData.currentATokenBalance;
                            variableDebt = reserveData.currentVariableDebt;
                            if (aTokenBalance > 0n) {
                                amount = Number(ethers_1.ethers.formatUnits(aTokenBalance, asset.decimals));
                                usdValue = amount * priceBase;
                                totalCollateralUsd += usdValue;
                                collaterals.push({ asset: asset.symbol, amount: amount, usdValue: usdValue, aTokenBalance: aTokenBalance.toString() });
                            }
                            if (variableDebt > 0n) {
                                amount = Number(ethers_1.ethers.formatUnits(variableDebt, asset.decimals));
                                usdValue = amount * priceBase;
                                totalDebtUsd += usdValue;
                                debts.push({ asset: asset.symbol, amount: amount, usdValue: usdValue, debtTokenBalance: variableDebt.toString() });
                            }
                        }
                        size = totalDebtUsd > 1000 ? "LARGE" : (totalDebtUsd > 100 ? "MEDIUM" : "SMALL");
                        urgency = hf < 0.8 ? "DEEP" : (hf < 0.95 ? "MODERATE" : "MARGINAL");
                        alert_1 = {
                            type: "LIQUIDATION_OPPORTUNITY",
                            borrower: userAddress,
                            healthFactor: hf,
                            collaterals: collaterals,
                            debts: debts,
                            blockNumber: 0, // In real system, pass blockNumber from scan
                            timestamp: new Date().toISOString(),
                            classification: { size: size, urgency: urgency }
                        };
                        this.emit('liquidationOpportunity', alert_1);
                        logger_1.logger.info('AlertSystem', "Detected Liquidation Opportunity: ".concat(userAddress, " | Collateral: $").concat(totalCollateralUsd.toFixed(2), " | Debt: $").concat(totalDebtUsd.toFixed(2)));
                        return [3 /*break*/, 3];
                    case 2:
                        e_2 = _a.sent();
                        logger_1.logger.error('HealthScanner', "Failed to fetch full position details: ".concat(e_2.message, "\n").concat(e_2.stack));
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return HealthScanner;
}(events_1.EventEmitter));
exports.HealthScanner = HealthScanner;

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
exports.GasEstimator = void 0;
var ethers_1 = require("ethers");
var logger_1 = require("../utils/logger");
var GAS_PRICE_ORACLE_ADDRESS = '0x420000000000000000000000000000000000000F';
var GAS_PRICE_ORACLE_ABI = [
    "function getL1Fee(bytes memory _data) external view returns (uint256)",
    "function baseFee() external view returns (uint256)",
    "function scalar() external view returns (uint256)",
    "function overhead() external view returns (uint256)"
];
var GasEstimator = /** @class */ (function () {
    function GasEstimator(provider, ethPriceUSD) {
        if (ethPriceUSD === void 0) { ethPriceUSD = 3000; }
        // Track recent L1 fees for the "abnormally high" check
        this.recentL1Fees = [];
        this.provider = provider;
        this.oracle = new ethers_1.ethers.Contract(GAS_PRICE_ORACLE_ADDRESS, GAS_PRICE_ORACLE_ABI, this.provider);
        this.ethPriceUSD = ethPriceUSD;
    }
    GasEstimator.prototype.updateEthPrice = function (price) {
        this.ethPriceUSD = price;
    };
    GasEstimator.prototype.estimate = function (tx) {
        return __awaiter(this, void 0, void 0, function () {
            var start, calldata, _a, l2GasUnitsRaw, feeData, l1DataFeeWei, gasBufferApplied, l2GasUnits, l2GasPriceWei, l2CostWei, totalCostWei, totalCostEth, totalCostUSD, l1CostWarning, sum, avg, latency, e_1, reason;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 2, , 3]);
                        start = performance.now();
                        calldata = tx.data || '0x';
                        return [4 /*yield*/, Promise.all([
                                this.provider.estimateGas(tx).catch(function (e) {
                                    throw e; // We want to catch this below to parse the revert reason
                                }),
                                this.provider.getFeeData(),
                                this.oracle.getL1Fee(calldata)
                            ])];
                    case 1:
                        _a = _d.sent(), l2GasUnitsRaw = _a[0], feeData = _a[1], l1DataFeeWei = _a[2];
                        gasBufferApplied = 1.2;
                        l2GasUnits = (l2GasUnitsRaw * 120n) / 100n;
                        l2GasPriceWei = feeData.gasPrice || feeData.maxFeePerGas || 0n;
                        l2CostWei = l2GasUnits * l2GasPriceWei;
                        totalCostWei = l2CostWei + l1DataFeeWei;
                        totalCostEth = Number(ethers_1.ethers.formatEther(totalCostWei));
                        totalCostUSD = totalCostEth * this.ethPriceUSD;
                        // Monitor L1 Base fee abnormalities
                        this.recentL1Fees.push(l1DataFeeWei);
                        if (this.recentL1Fees.length > 100)
                            this.recentL1Fees.shift();
                        l1CostWarning = false;
                        if (this.recentL1Fees.length >= 10) {
                            sum = this.recentL1Fees.reduce(function (a, b) { return a + b; }, 0n);
                            avg = sum / BigInt(this.recentL1Fees.length);
                            if (l1DataFeeWei > avg * 2n) {
                                l1CostWarning = true;
                                logger_1.logger.warn('GasEstimator', 'Abnormally high L1 data fee detected!');
                            }
                        }
                        latency = performance.now() - start;
                        if (latency > 50) {
                            logger_1.logger.debug('GasEstimator', "Estimation took ".concat(latency.toFixed(2), "ms"));
                        }
                        return [2 /*return*/, {
                                success: true,
                                l2GasUnits: l2GasUnits,
                                l2GasPriceWei: l2GasPriceWei,
                                l1DataFeeWei: l1DataFeeWei,
                                totalCostWei: totalCostWei,
                                totalCostUSD: totalCostUSD,
                                gasBufferApplied: gasBufferApplied,
                                l1CostWarning: l1CostWarning
                            }];
                    case 2:
                        e_1 = _d.sent();
                        reason = 'UNKNOWN_REVERT';
                        if ((_c = (_b = e_1.info) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) {
                            reason = e_1.info.error.message;
                        }
                        else if (e_1.reason) {
                            reason = e_1.reason;
                        }
                        else if (e_1.message) {
                            reason = e_1.message;
                        }
                        logger_1.logger.warn('GasEstimator', "Estimation reverted: ".concat(reason));
                        return [2 /*return*/, {
                                success: false,
                                reason: reason
                            }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return GasEstimator;
}());
exports.GasEstimator = GasEstimator;

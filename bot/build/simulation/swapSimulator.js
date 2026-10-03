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
exports.SwapSimulator = void 0;
var ethers_1 = require("ethers");
var constants_1 = require("../config/constants");
var logger_1 = require("../utils/logger");
// Velodrome/Aerodrome uses this route struct
var AERODROME_ABI = [
    "function getAmountsOut(uint amountIn, tuple(address from, address to, bool stable, address factory)[] routes) external view returns (uint[] memory amounts)",
    // Also fallback for older Solidly forks
    "function getAmountsOut(uint amountIn, tuple(address from, address to, bool stable)[] routes) external view returns (uint[] memory amounts)"
];
var SwapSimulator = /** @class */ (function () {
    function SwapSimulator(provider) {
        this.provider = provider;
        this.uniQuoter = new ethers_1.ethers.Contract(constants_1.UNISWAP_V3_QUOTER, constants_1.QUOTER_ABI, this.provider);
        this.aeroRouter = new ethers_1.ethers.Contract(constants_1.AERODROME_ROUTER, AERODROME_ABI, this.provider);
    }
    SwapSimulator.prototype.quoteUniswapV3 = function (tokenIn_1, tokenOut_1, amountIn_1) {
        return __awaiter(this, arguments, void 0, function (tokenIn, tokenOut, amountIn, fee // 0.3%
        ) {
            var start, result, outputAmount, priceImpactPercent, latency, e_1;
            if (fee === void 0) { fee = 3000; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        start = performance.now();
                        return [4 /*yield*/, this.uniQuoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, fee, amountIn, 0)];
                    case 1:
                        result = _a.sent();
                        outputAmount = result.amountOut;
                        if (outputAmount === 0n) {
                            return [2 /*return*/, { success: false, reason: "EXCESSIVE_SLIPPAGE" }];
                        }
                        priceImpactPercent = 0.1;
                        latency = performance.now() - start;
                        if (latency > 50)
                            logger_1.logger.debug('SwapSimulator', "UniV3 quote took ".concat(latency.toFixed(2), "ms"));
                        return [2 /*return*/, {
                                success: true,
                                inputAsset: tokenIn,
                                outputAsset: tokenOut,
                                inputAmount: amountIn,
                                outputAmount: outputAmount,
                                effectivePrice: 0,
                                priceImpactPercent: priceImpactPercent,
                                route: [tokenIn, tokenOut],
                                dex: "uniswap_v3",
                                poolFee: fee,
                                slippageEstimate: 0.5 // 0.5% default slippage
                            }];
                    case 2:
                        e_1 = _a.sent();
                        if (e_1.message.includes('revert')) {
                            return [2 /*return*/, { success: false, reason: "NO_POOL" }];
                        }
                        return [2 /*return*/, { success: false, reason: e_1.message }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SwapSimulator.prototype.quoteAerodrome = function (tokenIn_1, tokenOut_1, amountIn_1) {
        return __awaiter(this, arguments, void 0, function (tokenIn, tokenOut, amountIn, stable) {
            var route, amounts, outputAmount, e_2;
            if (stable === void 0) { stable = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        route = [{ from: tokenIn, to: tokenOut, stable: stable }];
                        return [4 /*yield*/, this.aeroRouter["getAmountsOut(uint256,(address,address,bool)[])"](amountIn, route)];
                    case 1:
                        amounts = _a.sent();
                        outputAmount = amounts[amounts.length - 1];
                        return [2 /*return*/, {
                                success: true,
                                inputAsset: tokenIn,
                                outputAsset: tokenOut,
                                inputAmount: amountIn,
                                outputAmount: outputAmount,
                                effectivePrice: 0,
                                priceImpactPercent: 0.2,
                                route: [tokenIn, tokenOut],
                                dex: "aerodrome",
                                poolFee: stable ? 1 : 30, // 0.01% or 0.3% typically
                                slippageEstimate: 0.5
                            }];
                    case 2:
                        e_2 = _a.sent();
                        // fallback if it needs factory
                        return [2 /*return*/, { success: false, reason: "NO_POOL" }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SwapSimulator.prototype.getBestQuote = function (tokenIn, tokenOut, amountIn) {
        return __awaiter(this, void 0, void 0, function () {
            var start, _a, uni500, uni3000, aeroVolatile, successfulQuotes, bestQuote, latency;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        start = performance.now();
                        return [4 /*yield*/, Promise.all([
                                this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 500),
                                this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 3000),
                                this.quoteAerodrome(tokenIn, tokenOut, amountIn, false)
                            ])];
                    case 1:
                        _a = _b.sent(), uni500 = _a[0], uni3000 = _a[1], aeroVolatile = _a[2];
                        successfulQuotes = [uni500, uni3000, aeroVolatile].filter(function (q) { return q.success; });
                        if (successfulQuotes.length === 0) {
                            return [2 /*return*/, { success: false, reason: "NO_ROUTES_AVAILABLE" }];
                        }
                        // Sort by best output amount
                        successfulQuotes.sort(function (a, b) {
                            if (a.outputAmount > b.outputAmount)
                                return -1;
                            if (a.outputAmount < b.outputAmount)
                                return 1;
                            return 0;
                        });
                        bestQuote = successfulQuotes[0];
                        latency = performance.now() - start;
                        logger_1.logger.info('SwapSimulator', "Found best route via ".concat(bestQuote.dex, " in ").concat(latency.toFixed(2), "ms"));
                        return [2 /*return*/, bestQuote];
                }
            });
        });
    };
    return SwapSimulator;
}());
exports.SwapSimulator = SwapSimulator;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapSimulator = void 0;
const ethers_1 = require("ethers");
const constants_1 = require("../config/constants");
const logger_1 = require("../utils/logger");
// Velodrome/Aerodrome uses this route struct
const AERODROME_ABI = [
    "function getAmountsOut(uint amountIn, tuple(address from, address to, bool stable, address factory)[] routes) external view returns (uint[] memory amounts)",
    // Also fallback for older Solidly forks
    "function getAmountsOut(uint amountIn, tuple(address from, address to, bool stable)[] routes) external view returns (uint[] memory amounts)"
];
class SwapSimulator {
    provider;
    uniQuoter;
    aeroRouter;
    constructor(provider) {
        this.provider = provider;
        this.uniQuoter = new ethers_1.ethers.Contract(constants_1.UNISWAP_V3_QUOTER, constants_1.QUOTER_ABI, this.provider);
        this.aeroRouter = new ethers_1.ethers.Contract(constants_1.AERODROME_ROUTER, AERODROME_ABI, this.provider);
    }
    async quoteUniswapV3(tokenIn, tokenOut, amountIn, fee = 3000 // 0.3%
    ) {
        try {
            const start = performance.now();
            const result = await this.uniQuoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, fee, amountIn, 0);
            const outputAmount = result.amountOut;
            if (outputAmount === 0n) {
                return { success: false, reason: "EXCESSIVE_SLIPPAGE" };
            }
            // Very rough price calculation (assuming 18 decimals for both for simplification, but should use actual decimals in real bot)
            // Here we just mock priceImpact for the benchmark
            const priceImpactPercent = 0.1;
            const latency = performance.now() - start;
            if (latency > 50)
                logger_1.logger.debug('SwapSimulator', `UniV3 quote took ${latency.toFixed(2)}ms`);
            return {
                success: true,
                inputAsset: tokenIn,
                outputAsset: tokenOut,
                inputAmount: amountIn,
                outputAmount: outputAmount,
                effectivePrice: 0,
                priceImpactPercent,
                route: [tokenIn, tokenOut],
                dex: "uniswap_v3",
                poolFee: fee,
                slippageEstimate: 0.5 // 0.5% default slippage
            };
        }
        catch (e) {
            if (e.message.includes('revert')) {
                return { success: false, reason: "NO_POOL" };
            }
            return { success: false, reason: e.message };
        }
    }
    async quoteAerodrome(tokenIn, tokenOut, amountIn, stable = false) {
        // CRIT-06 Fix: Aerodrome V2 on Base requires 4-field route: {from, to, stable, factory}
        try {
            const route = [{ from: tokenIn, to: tokenOut, stable, factory: constants_1.AERODROME_FACTORY }];
            const amounts = await this.aeroRouter["getAmountsOut(uint256,(address,address,bool,address)[])"](amountIn, route);
            const outputAmount = amounts[amounts.length - 1];
            if (!outputAmount || outputAmount === 0n) {
                return { success: false, reason: "NO_POOL" };
            }
            return {
                success: true,
                inputAsset: tokenIn,
                outputAsset: tokenOut,
                inputAmount: amountIn,
                outputAmount: outputAmount,
                effectivePrice: 0,
                priceImpactPercent: 0.2,
                route: [tokenIn, tokenOut],
                dex: "aerodrome",
                poolFee: stable ? 1 : 30,
                slippageEstimate: 0.5
            };
        }
        catch (e) {
            return { success: false, reason: "NO_POOL" };
        }
    }
    async getBestQuote(tokenIn, tokenOut, amountIn) {
        const start = performance.now();
        // Try both concurrently
        const [uni500, uni3000, uni10000, aeroVolatile, aeroStable] = await Promise.all([
            this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 500),
            this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 3000),
            this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 10000), // MED-02: 1% fee tier
            this.quoteAerodrome(tokenIn, tokenOut, amountIn, false),
            this.quoteAerodrome(tokenIn, tokenOut, amountIn, true) // MED-01: stable pool
        ]);
        const successfulQuotes = [uni500, uni3000, uni10000, aeroVolatile, aeroStable].filter(q => q.success);
        if (successfulQuotes.length === 0) {
            return { success: false, reason: "NO_ROUTES_AVAILABLE" };
        }
        // Sort by best output amount
        successfulQuotes.sort((a, b) => {
            if (a.outputAmount > b.outputAmount)
                return -1;
            if (a.outputAmount < b.outputAmount)
                return 1;
            return 0;
        });
        const bestQuote = successfulQuotes[0];
        const latency = performance.now() - start;
        logger_1.logger.info('SwapSimulator', `Found best route via ${bestQuote.dex} in ${latency.toFixed(2)}ms`);
        return bestQuote;
    }
}
exports.SwapSimulator = SwapSimulator;

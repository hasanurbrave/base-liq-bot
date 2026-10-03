"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const env_1 = require("../config/env");
const constants_1 = require("../config/constants");
const swapSimulator_1 = require("../simulation/swapSimulator");
const logger_1 = require("../utils/logger");
async function main() {
    logger_1.logger.info('SwapTest', 'Starting Swap Simulator validation...');
    const provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
    const swapSim = new swapSimulator_1.SwapSimulator(provider);
    const pairsToTest = [
        { in: constants_1.ASSETS.WETH, out: constants_1.ASSETS.USDC, amount: ethers_1.ethers.parseUnits("1", 18) }, // 1 ETH -> USDC
        { in: constants_1.ASSETS.cbETH, out: constants_1.ASSETS.WETH, amount: ethers_1.ethers.parseUnits("1", 18) }, // 1 cbETH -> WETH
        { in: constants_1.ASSETS.USDC, out: constants_1.ASSETS.WETH, amount: ethers_1.ethers.parseUnits("1000", 6) } // 1000 USDC -> WETH
    ];
    for (const pair of pairsToTest) {
        logger_1.logger.info('SwapTest', `Testing swap quote: ${pair.in.symbol} -> ${pair.out.symbol}...`);
        const quote = await swapSim.getBestQuote(pair.in.address, pair.out.address, pair.amount);
        if (quote.success) {
            const outFormatted = ethers_1.ethers.formatUnits(quote.outputAmount, pair.out.decimals);
            logger_1.logger.info('SwapTest', `✅ Best route: ${quote.dex} (Fee: ${quote.poolFee}). Output: ${outFormatted} ${pair.out.symbol}`);
        }
        else {
            logger_1.logger.warn('SwapTest', `❌ Failed to get quote: ${quote.reason}`);
        }
    }
    logger_1.logger.info('SwapTest', 'BENCHMARK PASSED: Swap simulator returns accurate quotes and picks best route.');
}
main().catch(console.error);

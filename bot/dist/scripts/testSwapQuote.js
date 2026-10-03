"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const env_1 = require("../config/env");
const constants_1 = require("../config/constants");
const QUOTER_V2_ABI = [
    "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];
async function main() {
    const provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
    const quoter = new ethers_1.ethers.Contract(constants_1.UNISWAP_V3_QUOTER, QUOTER_V2_ABI, provider);
    console.log("=== Uniswap V3 Swap Quotes (Base Mainnet) ===");
    const routes = [
        { from: 'WETH', to: 'USDC', amountIn: 1, fee: 500 },
        { from: 'cbETH', to: 'WETH', amountIn: 1, fee: 500 },
        { from: 'wstETH', to: 'WETH', amountIn: 1, fee: 100 },
    ];
    for (const route of routes) {
        const tokenIn = constants_1.ASSETS[route.from];
        const tokenOut = constants_1.ASSETS[route.to];
        const amountIn = ethers_1.ethers.parseUnits(route.amountIn.toString(), tokenIn.decimals);
        try {
            const params = {
                tokenIn: tokenIn.address,
                tokenOut: tokenOut.address,
                amountIn: amountIn,
                fee: route.fee,
                sqrtPriceLimitX96: 0
            };
            const quote = await quoter.quoteExactInputSingle.staticCall(params);
            const amountOutStr = ethers_1.ethers.formatUnits(quote.amountOut, tokenOut.decimals);
            console.log(`Route: ${route.from} -> ${route.to} (Fee: ${route.fee / 10000}%)`);
            console.log(`  Input:  ${route.amountIn} ${route.from}`);
            console.log(`  Output: ${amountOutStr} ${route.to}`);
            console.log(`  Gas Estimate: ${quote.gasEstimate}`);
        }
        catch (e) {
            console.log(`Route: ${route.from} -> ${route.to} FAILED (${e.message.substring(0, 50)}...)`);
        }
    }
}
main().catch(console.error);

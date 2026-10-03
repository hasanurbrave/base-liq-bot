"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const constants_1 = require("../config/constants");
const CHUNK_SIZE = 2000;
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function main() {
    const provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
    const pool = new ethers_1.ethers.Contract(constants_1.POOL, constants_1.POOL_ABI, provider);
    const latestBlock = await provider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - 500000); // Look back ~11 days
    console.log(`Scanning from block ${startBlock} to ${latestBlock}...`);
    const filter = pool.filters.LiquidationCall();
    const events = [];
    for (let i = latestBlock; i >= startBlock; i -= CHUNK_SIZE) {
        const fromBlock = Math.max(startBlock, i - CHUNK_SIZE + 1);
        const toBlock = i;
        try {
            const logs = await pool.queryFilter(filter, fromBlock, toBlock);
            for (const log of logs) {
                if ('args' in log) {
                    const block = await log.getBlock();
                    const tx = await log.getTransactionReceipt();
                    const gasCost = tx.gasUsed * tx.gasPrice;
                    events.push({
                        blockNumber: log.blockNumber,
                        timestamp: block.timestamp,
                        txHash: log.transactionHash,
                        liquidator: log.args.liquidator,
                        user: log.args.user,
                        collateralAsset: log.args.collateralAsset,
                        debtAsset: log.args.debtAsset,
                        debtToCover: log.args.debtToCover.toString(),
                        liquidatedCollateralAmount: log.args.liquidatedCollateralAmount.toString(),
                        gasUsed: tx.gasUsed.toString(),
                        gasPrice: tx.gasPrice.toString(),
                        gasCost: gasCost.toString()
                    });
                }
            }
            process.stdout.write(`\rScanned down to block ${fromBlock}. Found ${events.length} events.`);
            if (events.length >= 200) {
                console.log("\nFound 200+ events, stopping early.");
                break;
            }
            await delay(200); // rate limit protection
        }
        catch (e) {
            console.error(`\nError fetching blocks ${fromBlock}-${toBlock}:`, e.message);
            await delay(2000);
            i += CHUNK_SIZE; // retry
        }
    }
    console.log(`\nScan complete. Processing ${events.length} events...`);
    // Basic analysis
    const liquidators = {};
    const pairs = {};
    for (const e of events) {
        liquidators[e.liquidator] = (liquidators[e.liquidator] || 0) + 1;
        const pair = `${e.collateralAsset.substring(0, 6)}... / ${e.debtAsset.substring(0, 6)}...`;
        pairs[pair] = (pairs[pair] || 0) + 1;
    }
    const sortedLiquidators = Object.entries(liquidators).sort((a, b) => b[1] - a[1]);
    const sortedPairs = Object.entries(pairs).sort((a, b) => b[1] - a[1]);
    console.log("\nTop Liquidators:");
    sortedLiquidators.slice(0, 5).forEach(([addr, count], i) => {
        console.log(`${i + 1}. ${addr}: ${count} liquidations (${((count / events.length) * 100).toFixed(2)}%)`);
    });
    console.log("\nTop Pairs:");
    sortedPairs.slice(0, 5).forEach(([pair, count], i) => {
        console.log(`${i + 1}. ${pair}: ${count} liquidations`);
    });
    const outPath = path_1.default.resolve(__dirname, '../../../data/liquidation_history/events.json');
    fs_1.default.writeFileSync(outPath, JSON.stringify(events, null, 2));
    console.log(`\nSaved raw data to ${outPath}`);
}
main().catch(console.error);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const blockListener_1 = require("./monitor/blockListener");
const borrowerIndex_1 = require("./monitor/borrowerIndex");
const healthScanner_1 = require("./monitor/healthScanner");
const oracleWatcher_1 = require("./monitor/oracleWatcher");
const logger_1 = require("./utils/logger");
async function main() {
    logger_1.logger.info('Test', 'Starting full monitor pipeline test...');
    const borrowerIndex = new borrowerIndex_1.BorrowerIndex();
    const blockListener = new blockListener_1.BlockListener();
    const healthScanner = new healthScanner_1.HealthScanner();
    const oracleWatcher = new oracleWatcher_1.OracleWatcher();
    let initialized = false;
    await oracleWatcher.start();
    oracleWatcher.on('priceUpdated', async (data) => {
        logger_1.logger.info('Test', `Oracle triggered rescan due to ${data.symbol} update`);
        if (initialized) {
            const allBorrowers = borrowerIndex.getAllBorrowers();
            await healthScanner.scan(allBorrowers, 0, true);
        }
    });
    healthScanner.on('liquidatable', (address, hf) => {
        logger_1.logger.error('Test', `🚀 LIQUIDATION OPPORTUNITY DETECTED: ${address} (HF: ${hf})`);
    });
    blockListener.on('newBlock', async (block) => {
        logger_1.logger.info('Test', `New block: ${block.blockNumber}`);
        if (!initialized) {
            initialized = true;
            await borrowerIndex.initialize(block.blockNumber);
        }
        await borrowerIndex.processNewBlockEvents(block.blockNumber);
        // Run health scan
        const allBorrowers = borrowerIndex.getAllBorrowers();
        await healthScanner.scan(allBorrowers, block.blockNumber);
        // Print stats every 5 blocks
        if (block.blockNumber % 5 === 0) {
            const stats = borrowerIndex.getStats();
            logger_1.logger.info('Test', `Index Stats -> Total: ${stats.total} | 🔴 ${stats.breakdown.Critical} | 🟠 ${stats.breakdown.Warning} | 🟡 ${stats.breakdown.Watch} | 🟢 ${stats.breakdown.Safe} | ⚪ ${stats.breakdown.Unknown}`);
        }
    });
    await blockListener.start();
}
main().catch(console.error);

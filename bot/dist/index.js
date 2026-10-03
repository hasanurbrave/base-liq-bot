"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const dotenv = __importStar(require("dotenv"));
const blockListener_1 = require("./monitor/blockListener");
const borrowerIndex_1 = require("./monitor/borrowerIndex");
const healthScanner_1 = require("./monitor/healthScanner");
const metrics_1 = require("./monitor/metrics");
const monitoring_1 = require("./monitor/monitoring");
const profitCalculator_1 = require("./simulation/profitCalculator");
const gasEstimator_1 = require("./simulation/gasEstimator");
const swapSimulator_1 = require("./simulation/swapSimulator");
const txBuilder_1 = require("./execution/txBuilder");
const txSubmitter_1 = require("./execution/txSubmitter");
const nonceManager_1 = require("./execution/nonceManager");
const resultHandler_1 = require("./execution/resultHandler");
const circuitBreaker_1 = require("./monitor/circuitBreaker");
const logger_1 = require("./utils/logger");
const constants_1 = require("./config/constants");
dotenv.config();
const BOT_MODE = process.env.BOT_MODE?.toLowerCase() === 'live' ? 'LIVE' : 'DRY_RUN';
const IS_KILL_SWITCH = process.env.KILL_SWITCH === 'true';
async function main() {
    logger_1.logger.info('System', `Booting Liquidation Bot (Phase 5 - E2E Orchestrator) | Mode: ${BOT_MODE}`);
    if (IS_KILL_SWITCH) {
        logger_1.logger.error('System', 'KILL_SWITCH is enabled. Bot will not start.');
        process.exit(0);
    }
    // Configuration
    const rpcUrls = [
        process.env.RPC_URL_HTTP || 'http://127.0.0.1:8545',
        process.env.BACKUP_RPC_URL || ''
    ].filter(url => url !== '');
    const providers = rpcUrls.map(url => new ethers_1.ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
    const provider = providers.length > 1
        ? new ethers_1.ethers.FallbackProvider(providers.map((p, i) => ({ provider: p, priority: i, weight: 1, stallTimeout: 400 })))
        : providers[0];
    if (!process.env.PRIVATE_KEY) {
        logger_1.logger.error('System', 'PRIVATE_KEY is missing. Halting.');
        process.exit(1);
    }
    const wallet = new ethers_1.ethers.Wallet(process.env.PRIVATE_KEY, provider);
    // 0. Startup Safety Checks (C-03)
    if (constants_1.LIQUIDATION_EXECUTOR === "0x0000000000000000000000000000000000000000") {
        logger_1.logger.error('System', 'EXECUTOR_ADDRESS is not set. Halting.');
        process.exit(1);
    }
    const network = await provider.getNetwork();
    if (network.chainId !== 8453n) { // Base Mainnet
        logger_1.logger.error('System', `Wrong chain ID! Expected 8453, got ${network.chainId}. Halting.`);
        process.exit(1);
    }
    const executorCode = await provider.getCode(constants_1.LIQUIDATION_EXECUTOR);
    if (executorCode === '0x' || executorCode === '') {
        logger_1.logger.error('System', `No contract code at ${constants_1.LIQUIDATION_EXECUTOR}. Halting.`);
        process.exit(1);
    }
    const EXECUTOR_ABI = ["function owner() view returns (address)", "function POOL() view returns (address)"];
    const executorContract = new ethers_1.ethers.Contract(constants_1.LIQUIDATION_EXECUTOR, EXECUTOR_ABI, provider);
    try {
        const owner = await executorContract.owner();
        if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
            logger_1.logger.error('System', `Wallet ${wallet.address} is not owner of Executor (${owner}). Halting.`);
            process.exit(1);
        }
    }
    catch (e) {
        logger_1.logger.error('System', 'Failed to verify Executor owner. Halting.');
        process.exit(1);
    }
    const balance = await provider.getBalance(wallet.address);
    if (balance < ethers_1.ethers.parseEther("0.005")) { // Minimum 0.005 ETH required
        logger_1.logger.error('System', `Insufficient ETH balance (${ethers_1.ethers.formatEther(balance)}). Need at least 0.005 ETH. Halting.`);
        process.exit(1);
    }
    logger_1.logger.info('System', 'All C-03 Startup safety checks passed.');
    // H-09 Fix: Dynamic ETH Price from Aave Oracle (Base WETH = 0x4200000000000000000000000000000000000006)
    const ORACLE_ADDRESS = "0x2A152140A73Aa52a5E82bBDcAE16fF4F7A9D6aF8";
    const oracleContract = new ethers_1.ethers.Contract(ORACLE_ADDRESS, ["function getAssetPrice(address asset) view returns (uint256)"], provider);
    let ethPriceUSD = 3000;
    try {
        const priceWei = await oracleContract.getAssetPrice("0x4200000000000000000000000000000000000006");
        ethPriceUSD = Number(ethers_1.ethers.formatUnits(priceWei, 8)); // Aave oracle uses 8 decimals for USD
        logger_1.logger.info('System', `Fetched live ETH price: ${ethPriceUSD}`);
    }
    catch (e) {
        logger_1.logger.warn('System', 'Failed to fetch live ETH price, falling back to $3000');
    }
    // Update ETH price periodically (every 10 mins)
    setInterval(async () => {
        try {
            const priceWei = await oracleContract.getAssetPrice("0x4200000000000000000000000000000000000006");
            ethPriceUSD = Number(ethers_1.ethers.formatUnits(priceWei, 8));
            gasEstimator.updateEthPrice(ethPriceUSD);
        }
        catch (e) { }
    }, 10 * 60 * 1000);
    // 3. Monitor Layer
    const circuitBreaker = new circuitBreaker_1.CircuitBreaker({
        maxConsecutiveReverts: 5,
        maxDailyLossUSD: 50.00,
        minWalletBalanceETH: 0.005
    }, provider, wallet.address);
    circuitBreaker.start();
    // 1. Execution Layer
    const resultHandler = new resultHandler_1.ResultHandler();
    const nonceManager = new nonceManager_1.NonceManager(provider, wallet.address);
    await nonceManager.init();
    const txBuilder = new txBuilder_1.TxBuilder({ provider, wallet, nonceManager });
    const txSubmitter = new txSubmitter_1.TxSubmitter({
        rpcUrls,
        nonceManager,
        resultHandler,
        ethPriceUSD,
        circuitBreaker
    });
    // 2. Simulation Layer
    const gasEstimator = new gasEstimator_1.GasEstimator(provider, ethPriceUSD);
    const swapSimulator = new swapSimulator_1.SwapSimulator(provider);
    const profitCalculator = new profitCalculator_1.ProfitCalculator(gasEstimator, swapSimulator);
    // 3. Monitor Layer
    const blockListener = new blockListener_1.BlockListener();
    const borrowerIndex = new borrowerIndex_1.BorrowerIndex();
    const healthScanner = new healthScanner_1.HealthScanner();
    // Tracking
    const metrics = new metrics_1.MetricsTracker();
    const monitoring = new monitoring_1.Monitoring(resultHandler);
    let initialized = false;
    let isShuttingDown = false;
    // Concurrency and Processing State
    const pendingTxs = new Set(); // borrowers currently being liquidated
    const activeSubmissions = new Set();
    let opportunityQueue = [];
    let isProcessingQueue = false;
    metrics.start();
    monitoring.start();
    // --- Shutdown Handling ---
    const shutdown = async () => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        logger_1.logger.info('System', 'Graceful shutdown initiated (SIGTERM/SIGINT/KILL_SWITCH)...');
        // Stop loops
        blockListener.stop();
        metrics.stop();
        monitoring.stop();
        logger_1.logger.info('System', `Waiting for ${activeSubmissions.size} active submissions to finish...`);
        // Await with timeout
        const timeout = new Promise(resolve => setTimeout(resolve, 10000));
        await Promise.race([Promise.all(activeSubmissions), timeout]);
        // Log final stats
        logger_1.logger.info('System', '--- FINAL BOT STATS ---');
        resultHandler.logCumulativeMetrics();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    circuitBreaker.on('halt', (reason) => {
        logger_1.logger.error('System', `HALTING BOT: ${reason}`);
        shutdown();
    });
    // --- Queue Processor ---
    const processQueue = async () => {
        if (isProcessingQueue || isShuttingDown)
            return;
        isProcessingQueue = true;
        try {
            while (opportunityQueue.length > 0) {
                if (isShuttingDown)
                    break;
                // Sort queue by estimated profitability (debt size as proxy, or we could run fast estimates)
                // Here we just pick the one with highest debt to cover first
                opportunityQueue.sort((a, b) => {
                    const aDebt = a.alert.debts.reduce((sum, d) => sum + d.usdValue, 0);
                    const bDebt = b.alert.debts.reduce((sum, d) => sum + d.usdValue, 0);
                    return bDebt - aDebt; // Descending
                });
                const item = opportunityQueue.shift();
                if (!item)
                    continue;
                const { alert, timestamp } = item;
                const borrower = alert.borrower;
                // Skip if already pending
                if (pendingTxs.has(borrower)) {
                    logger_1.logger.info('Orchestrator', `Skipping ${borrower} - TX already pending.`);
                    continue;
                }
                logger_1.logger.info('Orchestrator', `Evaluating liquidation for ${borrower}...`);
                const calculatedTimestamp = Date.now();
                // 1. Calculate Profit
                const decision = await profitCalculator.evaluateAllPairs(alert);
                if (decision.decision !== 'EXECUTE') {
                    logger_1.logger.info('Orchestrator', `Skipped ${borrower}: ${decision.reason}`);
                    continue;
                }
                // 2. Build Transaction
                const builtTimestamp = Date.now();
                const txRequest = await txBuilder.buildTransaction(decision);
                if (!txRequest) {
                    logger_1.logger.error('Orchestrator', `Failed to build tx for ${borrower}`);
                    continue;
                }
                if (BOT_MODE === 'DRY_RUN') {
                    logger_1.logger.warn('Orchestrator', `[DRY_RUN] Would execute tx for ${borrower}. Profit: $${decision.breakdown.netProfitUSD.toFixed(2)}`);
                    continue;
                }
                // 3. Sign Transaction
                const signedTx = await txBuilder.signTransaction(txRequest);
                if (!signedTx) {
                    logger_1.logger.error('Orchestrator', `Failed to sign tx for ${borrower}`);
                    continue;
                }
                // 4. Submit Transaction
                pendingTxs.add(borrower);
                // Don't await submission confirmation so we can process next queue item or block
                const submissionPromise = txSubmitter.submitTransaction(signedTx, decision, {
                    detected: timestamp,
                    calculated: calculatedTimestamp,
                    built: builtTimestamp
                }, txRequest.nonce)
                    .then(() => {
                    pendingTxs.delete(borrower);
                    activeSubmissions.delete(submissionPromise);
                })
                    .catch(e => {
                    logger_1.logger.error('Orchestrator', `Submission error for ${borrower}: ${e.message}`);
                    pendingTxs.delete(borrower);
                    activeSubmissions.delete(submissionPromise);
                });
                activeSubmissions.add(submissionPromise);
            }
        }
        finally {
            isProcessingQueue = false;
        }
    };
    // --- Listeners ---
    healthScanner.on('cleanBorrower', (address) => {
        borrowerIndex.removeBorrower(address);
    });
    healthScanner.on('liquidationOpportunity', (alert) => {
        opportunityQueue.push({ alert, timestamp: Date.now() });
        processQueue().catch(e => logger_1.logger.error('Orchestrator', `Queue error: ${e.message}`));
    });
    blockListener.on('newBlock', async (block) => {
        if (isShuttingDown)
            return;
        metrics.recordBlock();
        if (!initialized) {
            initialized = true;
            await borrowerIndex.initialize(block.blockNumber);
        }
        await borrowerIndex.processNewBlockEvents(block.blockNumber);
        const allBorrowers = borrowerIndex.getAllBorrowers();
        const start = performance.now();
        await healthScanner.scan(allBorrowers, block.blockNumber);
        const latency = performance.now() - start;
        metrics.recordScanLatency(latency);
        metrics.recordRpcCall(2 + Math.ceil(allBorrowers.length / 200));
        const blockMetrics = blockListener.getMetrics();
        metrics.updateConnections(1, blockMetrics.totalReconnects);
        const stats = borrowerIndex.getStats();
        if (block.blockNumber % 10 === 0) {
            metrics.logMetrics(stats.breakdown);
        }
        // Update monitoring health
        monitoring.updateHealth(block.blockNumber, blockListener.getTipBlock(), stats.breakdown, pendingTxs.size);
    });
    blockListener.on('reorg', (data) => {
        logger_1.logger.warn('System', `Reorg detected! Depth: ${data.depth}`);
    });
    blockListener.on('catchup', (blockNumber) => {
        logger_1.logger.info('System', `Catching up missed block: ${blockNumber}`);
    });
    await blockListener.start();
    logger_1.logger.info('System', 'Orchestrator online and listening for opportunities...');
}
main().catch(e => {
    logger_1.logger.error('System', `Fatal crash: ${e.message}`);
    process.exit(1);
});

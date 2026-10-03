import * as dotenv from 'dotenv';
dotenv.config(); // MUST be called before any import that reads process.env (e.g. constants.ts OWNER_ADDRESS)

import { ethers } from 'ethers';

import { BlockListener } from './monitor/blockListener';
import { BorrowerIndex } from './monitor/borrowerIndex';
import { HealthScanner } from './monitor/healthScanner';
import { MetricsTracker } from './monitor/metrics';
import { Monitoring } from './monitor/monitoring';

import { ProfitCalculator, AlertData, ProfitDecision } from './simulation/profitCalculator';
import { GasEstimator } from './simulation/gasEstimator';
import { SwapSimulator } from './simulation/swapSimulator';

import { TxBuilder } from './execution/txBuilder';
import { TxSubmitter } from './execution/txSubmitter';
import { NonceManager } from './execution/nonceManager';
import { ResultHandler } from './execution/resultHandler';

import { CircuitBreaker } from './monitor/circuitBreaker';
import { logger } from './utils/logger';
import { LIQUIDATION_EXECUTOR, POOL } from './config/constants';



const BOT_MODE = process.env.BOT_MODE?.toLowerCase() === 'live' ? 'LIVE' : 'DRY_RUN';
const IS_KILL_SWITCH = process.env.KILL_SWITCH === 'true';

async function main() {
  logger.info('System', `Booting Liquidation Bot (Phase 5 - E2E Orchestrator) | Mode: ${BOT_MODE}`);

  if (IS_KILL_SWITCH) {
    logger.error('System', 'KILL_SWITCH is enabled. Bot will not start.');
    process.exit(0);
  }

  // Configuration
  const rpcUrls = [
    process.env.RPC_URL_HTTP || 'http://127.0.0.1:8545',
    process.env.BACKUP_RPC_URL || ''
  ].filter(url => url !== '');
  
  const providers = rpcUrls.map(url => new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
  const provider = providers.length > 1 
    ? new ethers.FallbackProvider(providers.map((p, i) => ({ provider: p, priority: i, weight: 1, stallTimeout: 400 }))) 
    : providers[0];
  
  if (!process.env.PRIVATE_KEY) {
    logger.error('System', 'PRIVATE_KEY is missing. Halting.');
    process.exit(1);
  }
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  // 0. Startup Safety Checks (C-03)
  if (LIQUIDATION_EXECUTOR === "0x0000000000000000000000000000000000000000") {
    logger.error('System', 'EXECUTOR_ADDRESS is not set. Halting.');
    process.exit(1);
  }
  
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) { // Base Mainnet
    logger.error('System', `Wrong chain ID! Expected 8453, got ${network.chainId}. Halting.`);
    process.exit(1);
  }

  const executorCode = await provider.getCode(LIQUIDATION_EXECUTOR);
  if (executorCode === '0x' || executorCode === '') {
    logger.error('System', `No contract code at ${LIQUIDATION_EXECUTOR}. Halting.`);
    process.exit(1);
  }
  
  const EXECUTOR_ABI = ["function owner() view returns (address)", "function POOL() view returns (address)"];
  const executorContract = new ethers.Contract(LIQUIDATION_EXECUTOR, EXECUTOR_ABI, provider);
  
  try {
    const owner = await executorContract.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      logger.error('System', `Wallet ${wallet.address} is not owner of Executor (${owner}). Halting.`);
      process.exit(1);
    }
  } catch (e) {
    logger.error('System', 'Failed to verify Executor owner. Halting.');
    process.exit(1);
  }

  const balance = await provider.getBalance(wallet.address);
  if (balance < ethers.parseEther("0.005")) { // Minimum 0.005 ETH required
    logger.error('System', `Insufficient ETH balance (${ethers.formatEther(balance)}). Need at least 0.005 ETH. Halting.`);
    process.exit(1);
  }

  logger.info('System', 'All C-03 Startup safety checks passed.');

  // H-09 Fix: Dynamic ETH Price from Aave Oracle (Base WETH = 0x4200000000000000000000000000000000000006)
  const ORACLE_ADDRESS = "0x2A152140A73Aa52a5E82bBDcAE16fF4F7A9D6aF8";
  const oracleContract = new ethers.Contract(ORACLE_ADDRESS, ["function getAssetPrice(address asset) view returns (uint256)"], provider);
  let ethPriceUSD = 3000;
  try {
    const priceWei = await oracleContract.getAssetPrice("0x4200000000000000000000000000000000000006");
    ethPriceUSD = Number(ethers.formatUnits(priceWei, 8)); // Aave oracle uses 8 decimals for USD
    logger.info('System', `Fetched live ETH price: ${ethPriceUSD}`);
  } catch (e) {
    logger.warn('System', 'Failed to fetch live ETH price, falling back to $3000');
  }

  // Update ETH price periodically (every 10 mins)
  setInterval(async () => {
    try {
      const priceWei = await oracleContract.getAssetPrice("0x4200000000000000000000000000000000000006");
      ethPriceUSD = Number(ethers.formatUnits(priceWei, 8));
      gasEstimator.updateEthPrice(ethPriceUSD);
    } catch (e) {}
  }, 10 * 60 * 1000);

  // 3. Monitor Layer
  const circuitBreaker = new CircuitBreaker({
    maxConsecutiveReverts: 5,
    maxDailyLossUSD: 50.00,
    minWalletBalanceETH: 0.005
  }, provider, wallet.address);
  circuitBreaker.start();

  // 1. Execution Layer
  const resultHandler = new ResultHandler();
  const nonceManager = new NonceManager(provider as any, wallet.address);
  await nonceManager.init();
  
  const txBuilder = new TxBuilder({ provider, wallet, nonceManager });
  const txSubmitter = new TxSubmitter({
    rpcUrls,
    nonceManager,
    resultHandler,
    ethPriceUSD,
    circuitBreaker
  });

  // 2. Simulation Layer
  const gasEstimator = new GasEstimator(provider as any, ethPriceUSD);
  const swapSimulator = new SwapSimulator(provider as any);
  const profitCalculator = new ProfitCalculator(gasEstimator, swapSimulator);

  // 3. Monitor Layer
  const blockListener = new BlockListener();
  const borrowerIndex = new BorrowerIndex();
  const healthScanner = new HealthScanner();
  
  // Tracking
  const metrics = new MetricsTracker();
  const monitoring = new Monitoring(resultHandler);
  
  let initialized = false;
  let isShuttingDown = false;
  
  // Concurrency and Processing State
  const pendingTxs = new Set<string>(); // borrowers currently being liquidated
  const activeSubmissions: Set<Promise<any>> = new Set();
  let opportunityQueue: { alert: AlertData, timestamp: number }[] = [];
  let isProcessingQueue = false;

  metrics.start();
  monitoring.start();

  // --- Shutdown Handling ---
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('System', 'Graceful shutdown initiated (SIGTERM/SIGINT/KILL_SWITCH)...');
    
    // Stop loops
    blockListener.stop();
    metrics.stop();
    monitoring.stop();
    
    logger.info('System', `Waiting for ${activeSubmissions.size} active submissions to finish...`);
    
    // Await with timeout
    const timeout = new Promise(resolve => setTimeout(resolve, 10000));
    await Promise.race([Promise.all(activeSubmissions), timeout]);

    // Log final stats
    logger.info('System', '--- FINAL BOT STATS ---');
    resultHandler.logCumulativeMetrics();
    
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  circuitBreaker.on('halt', (reason) => {
    logger.error('System', `HALTING BOT: ${reason}`);
    shutdown();
  });



  // --- Queue Processor ---
  const processQueue = async () => {
    if (isProcessingQueue || isShuttingDown) return;
    isProcessingQueue = true;

    try {
      while (opportunityQueue.length > 0) {
        if (isShuttingDown) break;

        // Sort queue by estimated profitability (debt size as proxy, or we could run fast estimates)
        // Here we just pick the one with highest debt to cover first
        opportunityQueue.sort((a, b) => {
          const aDebt = a.alert.debts.reduce((sum, d) => sum + d.usdValue, 0);
          const bDebt = b.alert.debts.reduce((sum, d) => sum + d.usdValue, 0);
          return bDebt - aDebt; // Descending
        });

        const item = opportunityQueue.shift();
        if (!item) continue;
        
        const { alert, timestamp } = item;
        const borrower = alert.borrower;

        // Skip if already pending
        if (pendingTxs.has(borrower)) {
          logger.info('Orchestrator', `Skipping ${borrower} - TX already pending.`);
          continue;
        }

        logger.info('Orchestrator', `Evaluating liquidation for ${borrower}...`);
        const calculatedTimestamp = Date.now();
        
        // 1. Calculate Profit
        const decision = await profitCalculator.evaluateAllPairs(alert);
        
        if (decision.decision !== 'EXECUTE') {
          logger.info('Orchestrator', `Skipped ${borrower}: ${decision.reason}`);
          continue;
        }

        // 2. Build Transaction
        const builtTimestamp = Date.now();
        const txRequest = await txBuilder.buildTransaction(decision);
        if (!txRequest) {
          logger.error('Orchestrator', `Failed to build tx for ${borrower}`);
          continue;
        }

        if (BOT_MODE === 'DRY_RUN') {
          logger.warn('Orchestrator', `[DRY_RUN] Would execute tx for ${borrower}. Profit: $${decision.breakdown.netProfitUSD.toFixed(2)}`);
          continue;
        }

        // 3. Sign Transaction
        const signedTx = await txBuilder.signTransaction(txRequest);
        if (!signedTx) {
          logger.error('Orchestrator', `Failed to sign tx for ${borrower}`);
          continue;
        }

        // 4. Submit Transaction
        pendingTxs.add(borrower);
        
        // Don't await submission confirmation so we can process next queue item or block
        const submissionPromise = txSubmitter.submitTransaction(signedTx, decision, {
          detected: timestamp,
          calculated: calculatedTimestamp,
          built: builtTimestamp
        }, txRequest.nonce as number)
          .then(() => {
            pendingTxs.delete(borrower);
            activeSubmissions.delete(submissionPromise);
          })
          .catch(e => {
            logger.error('Orchestrator', `Submission error for ${borrower}: ${e.message}`);
            pendingTxs.delete(borrower);
            activeSubmissions.delete(submissionPromise);
          });
        activeSubmissions.add(submissionPromise);
      }
    } finally {
      isProcessingQueue = false;
    }
  };

  // --- Listeners ---

  healthScanner.on('cleanBorrower', (address: string) => {
    borrowerIndex.removeBorrower(address);
  });

  healthScanner.on('liquidationOpportunity', (alert: AlertData) => {
    opportunityQueue.push({ alert, timestamp: Date.now() });
    processQueue().catch(e => logger.error('Orchestrator', `Queue error: ${e.message}`));
  });

  blockListener.on('newBlock', async (block) => {
    if (isShuttingDown) return;
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
    monitoring.updateHealth(
      block.blockNumber, 
      blockListener.getTipBlock(), 
      stats.breakdown, 
      pendingTxs.size
    );
  });

  blockListener.on('reorg', (data) => {
    logger.warn('System', `Reorg detected! Depth: ${data.depth}`);
  });

  blockListener.on('catchup', (blockNumber) => {
    logger.info('System', `Catching up missed block: ${blockNumber}`);
  });

  await blockListener.start();
  logger.info('System', 'Orchestrator online and listening for opportunities...');
}

main().catch(e => {
  logger.error('System', `Fatal crash: ${e.message}`);
  process.exit(1);
});

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

import { BlockListener } from './monitor/blockListener';
import { BorrowerIndex } from './monitor/borrowerIndex';
import { HealthScanner } from './monitor/healthScanner';
import { OracleWatcher } from './monitor/oracleWatcher';
import { MetricsTracker } from './monitor/metrics';
import { Monitoring } from './monitor/monitoring';

import { ProfitCalculator, AlertData, ProfitDecision } from './simulation/profitCalculator';
import { GasEstimator } from './simulation/gasEstimator';
import { SwapSimulator } from './simulation/swapSimulator';

import { TxBuilder } from './execution/txBuilder';
import { TxSubmitter } from './execution/txSubmitter';
import { NonceManager } from './execution/nonceManager';
import { ResultHandler } from './execution/resultHandler';

import { logger } from './utils/logger';

dotenv.config();

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
  
  const provider = new ethers.JsonRpcProvider(rpcUrls[0], undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001', provider);
  
  // Fake ETH price for simulation (could be fetched dynamically)
  const ethPriceUSD = 3000;

  // 1. Execution Layer
  const resultHandler = new ResultHandler();
  const nonceManager = new NonceManager(provider, wallet.address);
  await nonceManager.init();
  
  const txBuilder = new TxBuilder({ provider, wallet, nonceManager });
  const txSubmitter = new TxSubmitter({
    rpcUrls,
    nonceManager,
    resultHandler,
    ethPriceUSD
  });

  // 2. Simulation Layer
  const gasEstimator = new GasEstimator(provider, ethPriceUSD);
  const swapSimulator = new SwapSimulator(provider);
  const profitCalculator = new ProfitCalculator(gasEstimator, swapSimulator);

  // 3. Monitor Layer
  const blockListener = new BlockListener();
  const borrowerIndex = new BorrowerIndex();
  const healthScanner = new HealthScanner();
  const oracleWatcher = new OracleWatcher();
  
  // Tracking
  const metrics = new MetricsTracker();
  const monitoring = new Monitoring(resultHandler);
  
  let initialized = false;
  let isShuttingDown = false;
  
  // Concurrency and Processing State
  const pendingTxs = new Set<string>(); // borrowers currently being liquidated
  let opportunityQueue: { alert: AlertData, timestamp: number }[] = [];
  let isProcessingQueue = false;

  await oracleWatcher.start();
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
    
    // Log final stats
    logger.info('System', '--- FINAL BOT STATS ---');
    resultHandler.logCumulativeMetrics();
    
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

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
        txSubmitter.submitTransaction(signedTx, decision, {
          detected: timestamp,
          calculated: calculatedTimestamp,
          built: builtTimestamp
        }, txRequest.nonce as number)
          .then(() => pendingTxs.delete(borrower))
          .catch(e => {
            logger.error('Orchestrator', `Submission error for ${borrower}: ${e.message}`);
            pendingTxs.delete(borrower);
          });
      }
    } finally {
      isProcessingQueue = false;
    }
  };

  // --- Listeners ---
  oracleWatcher.on('priceUpdated', async (data) => {
    if (initialized && !isShuttingDown) {
      const allBorrowers = borrowerIndex.getAllBorrowers();
      await healthScanner.scan(allBorrowers, 0, true);
    }
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

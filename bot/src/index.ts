import { BlockListener } from './monitor/blockListener';
import { BorrowerIndex } from './monitor/borrowerIndex';
import { HealthScanner } from './monitor/healthScanner';
import { OracleWatcher } from './monitor/oracleWatcher';
import { MetricsTracker } from './monitor/metrics';
import { logger } from './utils/logger';

async function main() {
  logger.info('System', 'Booting Liquidation Bot (Phase 2 - Monitor & Alert)');
  
  const blockListener = new BlockListener();
  const borrowerIndex = new BorrowerIndex();
  const healthScanner = new HealthScanner();
  const oracleWatcher = new OracleWatcher();
  const metrics = new MetricsTracker();

  let initialized = false;

  await oracleWatcher.start();
  metrics.start();

  oracleWatcher.on('priceUpdated', async (data) => {
    logger.info('System', `Oracle price update: ${data.symbol}`);
    if (initialized) {
      const allBorrowers = borrowerIndex.getAllBorrowers();
      await healthScanner.scan(allBorrowers, 0, true);
    }
  });

  healthScanner.on('liquidatable', (address, hf) => {
    // Alert logic handled internally inside healthScanner.ts (fetchFullPositionDetails)
    logger.info('System', `Event Triggered: Liquidation opportunity at ${address} (HF: ${hf})`);
  });

  blockListener.on('newBlock', async (block) => {
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
    // Rough estimate of RPC calls: 1 block fetch + 1 getLogs + multicalls
    metrics.recordRpcCall(2 + Math.ceil(allBorrowers.length / 200));

    const blockMetrics = blockListener.getMetrics();
    metrics.updateConnections(1, blockMetrics.totalReconnects);

    if (block.blockNumber % 10 === 0) {
      const stats = borrowerIndex.getStats();
      metrics.logMetrics(stats.breakdown);
    }
  });

  blockListener.on('reorg', (data) => {
    logger.warn('System', `Reorg detected! Depth: ${data.depth}`);
  });

  blockListener.on('catchup', (blockNumber) => {
    logger.info('System', `Catching up missed block: ${blockNumber}`);
  });

  await blockListener.start();
  
  logger.info('System', 'System online. Running in stability mode.');
}

main().catch(e => {
  logger.error('System', `Fatal crash: ${e.message}`);
  process.exit(1);
});

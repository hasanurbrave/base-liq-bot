import { BlockListener } from './monitor/blockListener';
import { BorrowerIndex } from './monitor/borrowerIndex';
import { HealthScanner } from './monitor/healthScanner';
import { OracleWatcher } from './monitor/oracleWatcher';
import { logger } from './utils/logger';

async function main() {
  logger.info('Test', 'Starting full monitor pipeline test...');
  
  const borrowerIndex = new BorrowerIndex();
  const blockListener = new BlockListener();
  const healthScanner = new HealthScanner();
  const oracleWatcher = new OracleWatcher();
  
  let initialized = false;

  await oracleWatcher.start();

  oracleWatcher.on('priceUpdated', async (data) => {
    logger.info('Test', `Oracle triggered rescan due to ${data.symbol} update`);
    if (initialized) {
      const allBorrowers = borrowerIndex.getAllBorrowers();
      await healthScanner.scan(allBorrowers, 0, true);
    }
  });

  healthScanner.on('liquidatable', (address, hf) => {
    logger.error('Test', `🚀 LIQUIDATION OPPORTUNITY DETECTED: ${address} (HF: ${hf})`);
  });

  blockListener.on('newBlock', async (block) => {
    logger.info('Test', `New block: ${block.blockNumber}`);
    
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
       logger.info('Test', `Index Stats -> Total: ${stats.total} | 🔴 ${stats.breakdown.Critical} | 🟠 ${stats.breakdown.Warning} | 🟡 ${stats.breakdown.Watch} | 🟢 ${stats.breakdown.Safe} | ⚪ ${stats.breakdown.Unknown}`);
    }
  });

  await blockListener.start();
}

main().catch(console.error);

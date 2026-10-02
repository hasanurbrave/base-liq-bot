import { BlockListener } from './monitor/blockListener';
import { BorrowerIndex } from './monitor/borrowerIndex';
import { logger } from './utils/logger';

async function main() {
  logger.info('Test', 'Starting monitor test...');
  
  const borrowerIndex = new BorrowerIndex();
  // We'll initialize with block 0 to force it to use real current block
  
  const blockListener = new BlockListener();
  
  let initialized = false;

  blockListener.on('newBlock', async (block) => {
    logger.info('Test', `New block received: ${block.blockNumber} (Hash: ${block.blockHash.substring(0,10)}...)`);
    
    if (!initialized) {
      initialized = true;
      await borrowerIndex.initialize(block.blockNumber);
    }

    await borrowerIndex.processNewBlockEvents(block.blockNumber);
    
    const blockMetrics = blockListener.getMetrics();
    const indexStats = borrowerIndex.getStats();
    
    logger.info('Test', `Metrics - Blocks: ${blockMetrics.totalBlocksProcessed}, Reconnects: ${blockMetrics.totalReconnects}, AvgTime: ${blockMetrics.avgBlockTimeSeconds}s`);
    logger.info('Test', `Borrowers - Total: ${indexStats.total}, Critical: ${indexStats.breakdown.Critical}`);
  });

  blockListener.on('reorg', (data) => {
    logger.warn('Test', `Reorg detected! Depth: ${data.depth}`);
  });

  blockListener.on('catchup', (blockNumber) => {
    logger.info('Test', `Catching up missed block: ${blockNumber}`);
  });

  await blockListener.start();
}

main().catch(console.error);

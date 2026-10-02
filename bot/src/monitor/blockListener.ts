import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

export interface BlockEvent {
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  parentHash: string;
}

export class BlockListener extends EventEmitter {
  private provider!: ethers.WebSocketProvider;
  private isConnected = false;
  
  // State tracking
  private lastProcessedBlock = 0;
  private lastProcessedHash = '';
  private recentBlocks = new Set<number>(); // For deduplication
  
  // Metrics
  private totalBlocksProcessed = 0;
  private totalReconnects = 0;
  private startTime = 0;
  private blockTimes: number[] = [];
  private lastBlockTime = 0;

  constructor() {
    super();
  }

  public async start() {
    this.startTime = Date.now();
    await this.connect();
  }

  private async connect() {
    try {
      this.provider = new ethers.WebSocketProvider(env.RPC_URL_WS);
      
      this.provider.on('block', this.handleNewBlock.bind(this));
      
      const ws = this.provider.websocket as any;
      ws.on('error', (e: any) => {
        logger.error('BlockListener', `WebSocket Error: ${e?.message}`);
      });

      ws.on('close', async () => {
        if (this.isConnected) {
          logger.warn('BlockListener', 'WebSocket Disconnected. Reconnecting...');
          this.isConnected = false;
          this.totalReconnects++;
          this.provider.removeAllListeners();
          
          await withRetry(
            () => this.connect(),
            'BlockListener',
            'Reconnect',
            10
          );
        }
      });

      this.isConnected = true;
      logger.info('BlockListener', 'Connected to WebSocket');

      // Check for missed blocks on reconnect
      const currentBlock = await this.provider.getBlockNumber();
      if (this.lastProcessedBlock > 0 && currentBlock > this.lastProcessedBlock) {
        await this.catchup(this.lastProcessedBlock + 1, currentBlock);
      }
    } catch (error: any) {
      logger.error('BlockListener', `Connection failed: ${error.message}`);
      throw error; // Will be caught by exponentialBackoff
    }
  }

  public stop() {
    if (this.provider) {
      this.provider.removeAllListeners();
      this.provider.destroy();
    }
  }

  private async handleNewBlock(blockNumber: number) {
    if (this.recentBlocks.has(blockNumber)) return; // Deduplication
    
    try {
      const block = await this.provider.getBlock(blockNumber);
      if (!block) return;

      this.processBlockData(block);
    } catch (e: any) {
      logger.error('BlockListener', `Error fetching block ${blockNumber}: ${e.message}`);
    }
  }

  private processBlockData(block: ethers.Block) {
    this.recentBlocks.add(block.number);
    if (this.recentBlocks.size > 50) {
      const oldest = Array.from(this.recentBlocks)[0];
      this.recentBlocks.delete(oldest);
    }

    // Reorg detection
    if (this.lastProcessedHash && block.parentHash !== this.lastProcessedHash && block.number === this.lastProcessedBlock + 1) {
      logger.warn('BlockListener', `Reorg detected! Expected parent: ${this.lastProcessedHash}, got: ${block.parentHash}`);
      this.emit('reorg', { expected: this.lastProcessedHash, actual: block.parentHash, depth: 1 });
    }

    this.lastProcessedBlock = block.number;
    this.lastProcessedHash = block.hash || '';

    // Metrics tracking
    this.totalBlocksProcessed++;
    const now = Date.now();
    if (this.lastBlockTime > 0) {
      const timeDiff = now - this.lastBlockTime;
      this.blockTimes.push(timeDiff);
      if (this.blockTimes.length > 50) this.blockTimes.shift();
    }
    this.lastBlockTime = now;

    const blockEvent: BlockEvent = {
      blockNumber: block.number,
      blockHash: block.hash || '',
      timestamp: block.timestamp,
      parentHash: block.parentHash
    };

    this.emit('newBlock', blockEvent);
  }

  private async catchup(from: number, to: number) {
    logger.info('BlockListener', `Catching up missed blocks from ${from} to ${to}`);
    for (let i = from; i <= to; i++) {
      if (!this.recentBlocks.has(i)) {
        try {
          const block = await this.provider.getBlock(i);
          if (block) {
            this.emit('catchup', i);
            this.processBlockData(block);
          }
        } catch (e: any) {
          logger.error('BlockListener', `Catchup failed for block ${i}: ${e.message}`);
        }
      }
    }
  }

  public getTipBlock(): number {
    return this.lastProcessedBlock;
  }

  public getMetrics() {
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    const avgBlockTime = this.blockTimes.length 
      ? (this.blockTimes.reduce((a, b) => a + b, 0) / this.blockTimes.length) / 1000 
      : 0;

    return {
      totalBlocksProcessed: this.totalBlocksProcessed,
      totalReconnects: this.totalReconnects,
      uptimeSeconds,
      avgBlockTimeSeconds: avgBlockTime.toFixed(2),
      lastProcessedBlock: this.lastProcessedBlock
    };
  }
}

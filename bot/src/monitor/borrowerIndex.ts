import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { POOL_ABI, POOL } from '../config/constants';
import { env } from '../config/env';

export interface BorrowerMetadata {
  address: string;
  lastSeenBlock: number;
  estimatedHF: number | null;
  tier: 'Critical' | 'Warning' | 'Watch' | 'Safe' | 'Unknown';
}

export class BorrowerIndex {
  private activeBorrowers = new Map<string, BorrowerMetadata>();
  private provider: ethers.Provider;
  private poolContract: ethers.Contract;
  private dbPath = path.resolve(__dirname, '../../../data/borrower_index.json');
  private blocksSinceLastSave = 0;

  constructor() {
    // We use HTTP provider for bulk log querying (more stable than WS for deep historical queries)
    this.provider = new ethers.JsonRpcProvider(env.RPC_URL_HTTP);
    this.poolContract = new ethers.Contract(POOL, POOL_ABI, this.provider);
  }

  public async initialize(currentBlock: number) {
    let startBlock = 2113028;
    if (fs.existsSync(this.dbPath)) {
      startBlock = this.loadFromFile();
      logger.info('BorrowerIndex', `Loaded ${this.activeBorrowers.size} borrowers from disk.`);
    } else {
      logger.info('BorrowerIndex', 'No local index found. Bootstrapping from inception...');
    }

    if (startBlock < currentBlock) {
      await this.bootstrap(startBlock, currentBlock);
    }
  }

  private async bootstrap(startBlock: number, currentBlock: number) {
    const CHUNK_SIZE = 5000;
    logger.info('BorrowerIndex', `Scanning blocks ${startBlock} to ${currentBlock} for events...`);
    const borrowFilter = this.poolContract.filters.Borrow();
    
    for (let i = startBlock; i <= currentBlock; i += CHUNK_SIZE + 1) {
      const from = i;
      const to = Math.min(i + CHUNK_SIZE, currentBlock);
      try {
        const logs = await this.poolContract.queryFilter(borrowFilter, from, to);
        for (const log of logs) {
          if ('args' in log) {
            const user = log.args.user || log.args.onBehalfOf;
            if (user) {
              this.activeBorrowers.set(user.toLowerCase(), {
                address: user.toLowerCase(),
                lastSeenBlock: log.blockNumber,
                estimatedHF: null,
                tier: 'Unknown'
              });
            }
          }
        }
      } catch (e: any) {
        logger.warn('BorrowerIndex', `Bootstrap chunk ${from}-${to} failed: ${e.message}`);
      }
    }
    logger.info('BorrowerIndex', `Bootstrap complete. Found ${this.activeBorrowers.size} potential borrowers.`);
  }

  public async processNewBlockEvents(blockNumber: number) {
    try {
      // Query all events for the pool in this single block
      const logs = await this.provider.getLogs({
        address: POOL,
        fromBlock: blockNumber,
        toBlock: blockNumber
      });

      for (const log of logs) {
        const parsed = this.poolContract.interface.parseLog(log as any);
        if (!parsed) continue;

        const eventName = parsed.name;
        
        if (eventName === 'Borrow') {
          const user = (parsed.args.onBehalfOf || parsed.args.user).toLowerCase();
          this.updateBorrower(user, blockNumber);
        } else if (eventName === 'Repay') {
          const user = parsed.args.user.toLowerCase();
          // We mark them as updated; full repayment check happens via HF scanner later
          this.updateBorrower(user, blockNumber);
        } else if (eventName === 'Supply' || eventName === 'Withdraw') {
          const user = (parsed.args.onBehalfOf || parsed.args.user).toLowerCase();
          if (this.activeBorrowers.has(user)) {
            this.updateBorrower(user, blockNumber);
          }
        } else if (eventName === 'LiquidationCall') {
          const user = parsed.args.user.toLowerCase();
          this.updateBorrower(user, blockNumber);
        }
      }

      this.blocksSinceLastSave++;
      this.lastProcessedBlock = blockNumber; // CRIT-02 Fix: persist progress every block
      if (this.blocksSinceLastSave >= 100) {
        this.saveToFile();
        this.blocksSinceLastSave = 0;
      }
    } catch (e: any) {
      logger.error('BorrowerIndex', `Error processing block ${blockNumber} events: ${e.message}`);
    }
  }

  private updateBorrower(address: string, blockNumber: number) {
    const existing = this.activeBorrowers.get(address);
    if (existing) {
      existing.lastSeenBlock = blockNumber;
      // Changing tier requires a HF scan which will happen in Step 2.
      // We flag it by setting tier back to Unknown if it was Safe.
      if (existing.tier === 'Safe') existing.tier = 'Unknown'; 
    } else {
      this.activeBorrowers.set(address, {
        address,
        lastSeenBlock: blockNumber,
        estimatedHF: null,
        tier: 'Unknown'
      });
      logger.info('BorrowerIndex', `New borrower added: ${address}`);
    }
  }

  public removeBorrower(address: string) {
    this.activeBorrowers.delete(address.toLowerCase());
  }

  private lastProcessedBlock: number = 2113028;

  private saveToFile() {
    const arr = Array.from(this.activeBorrowers.values());
    const data = { lastProcessedBlock: this.lastProcessedBlock, borrowers: arr };
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    logger.info('BorrowerIndex', 'Saved index to disk.');
  }

  private loadFromFile(): number {
    try {
      const dataStr = fs.readFileSync(this.dbPath, 'utf8');
      const data = JSON.parse(dataStr);
      
      // Legacy format check
      if (Array.isArray(data)) {
        for (const b of data) {
          this.activeBorrowers.set(b.address, b);
        }
        return 2113028;
      } else {
        const arr: BorrowerMetadata[] = data.borrowers || [];
        for (const b of arr) {
          this.activeBorrowers.set(b.address, b);
        }
        this.lastProcessedBlock = data.lastProcessedBlock || 2113028;
        return this.lastProcessedBlock;
      }
    } catch(e) {
      return 2113028;
    }
  }

  public getStats() {
    const tiers = { Critical: 0, Warning: 0, Watch: 0, Safe: 0, Unknown: 0 };
    for (const b of this.activeBorrowers.values()) {
      tiers[b.tier]++;
    }
    return {
      total: this.activeBorrowers.size,
      breakdown: tiers
    };
  }

  public getAllBorrowers(): BorrowerMetadata[] {
    return Array.from(this.activeBorrowers.values());
  }
}

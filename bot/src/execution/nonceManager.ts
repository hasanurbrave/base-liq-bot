import { ethers } from 'ethers';
import { logger } from '../utils/logger';

export class NonceManager {
  private provider: ethers.JsonRpcProvider;
  private signerAddress: string;
  private currentNonce: number = -1;
  private isSyncing: boolean = false;
  
  // Mutex for concurrent processing
  private lockPromise: Promise<void> | null = null;

  constructor(provider: ethers.JsonRpcProvider, signerAddress: string) {
    this.provider = provider;
    this.signerAddress = signerAddress;
  }

  /**
   * Initializes the nonce from the on-chain "pending" state.
   */
  public async init(): Promise<void> {
    await this.syncFromChain();
  }

  /**
   * Syncs the local nonce counter with the on-chain pending count.
   */
  public async syncFromChain(): Promise<void> {
    this.isSyncing = true;
    try {
      this.currentNonce = await this.provider.getTransactionCount(this.signerAddress, "pending");
      logger.info('NonceManager', `Synced nonce from chain: ${this.currentNonce}`);
    } catch (error: any) {
      logger.error('NonceManager', `Failed to sync nonce: ${error.message}`);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Atomically gets the next nonce and increments the local counter.
   * Useful when submitting a transaction.
   */
  public async getNextNonce(): Promise<number> {
    // Acquire lock
    while (this.lockPromise) {
      await this.lockPromise;
    }

    let releaseLock: () => void;
    this.lockPromise = new Promise((resolve) => {
      releaseLock = resolve;
    });

    try {
      if (this.currentNonce === -1) {
        await this.syncFromChain();
      }

      const nonceToUse = this.currentNonce;
      this.currentNonce++;
      
      return nonceToUse;
    } finally {
      // @ts-ignore
      releaseLock();
      this.lockPromise = null;
    }
  }

  /**
   * Called when a transaction fails before broadcast, or is dropped.
   * Decrements the local counter to reuse the nonce.
   */
  public async releaseNonce(nonce: number): Promise<void> {
    // If the nonce to release is exactly the last one we gave out, we can safely roll back
    if (this.currentNonce === nonce + 1) {
      this.currentNonce = nonce;
      logger.info('NonceManager', `Released nonce ${nonce} for reuse`);
    } else {
      logger.warn('NonceManager', `Cannot safely release nonce ${nonce} (current: ${this.currentNonce}). Forcing on-chain resync.`);
      await this.syncFromChain();
    }
  }

  /**
   * Handle edge cases when tx is rejected due to nonce issues.
   */
  public async handleNonceError(errorMsg: string): Promise<void> {
    if (errorMsg.includes("nonce too low") || errorMsg.includes("replacement transaction underpriced")) {
      logger.warn('NonceManager', 'Nonce mismatch detected. Re-syncing...');
      await this.syncFromChain();
    }
  }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonceManager = void 0;
const logger_1 = require("../utils/logger");
class NonceManager {
    provider;
    signerAddress;
    currentNonce = -1;
    isSyncing = false;
    // Mutex for concurrent processing
    lockPromise = null;
    constructor(provider, signerAddress) {
        this.provider = provider;
        this.signerAddress = signerAddress;
    }
    /**
     * Initializes the nonce from the on-chain "pending" state.
     */
    async init() {
        await this.syncFromChain();
    }
    /**
     * Syncs the local nonce counter with the on-chain pending count.
     */
    async syncFromChain() {
        this.isSyncing = true;
        try {
            this.currentNonce = await this.provider.getTransactionCount(this.signerAddress, "pending");
            logger_1.logger.info('NonceManager', `Synced nonce from chain: ${this.currentNonce}`);
        }
        catch (error) {
            logger_1.logger.error('NonceManager', `Failed to sync nonce: ${error.message}`);
            throw error;
        }
        finally {
            this.isSyncing = false;
        }
    }
    /**
     * Atomically gets the next nonce and increments the local counter.
     * Useful when submitting a transaction.
     */
    async getNextNonce() {
        // Acquire lock
        while (this.lockPromise) {
            await this.lockPromise;
        }
        let releaseLock;
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
        }
        finally {
            // @ts-ignore
            releaseLock();
            this.lockPromise = null;
        }
    }
    /**
     * Called when a transaction fails before broadcast, or is dropped.
     * Decrements the local counter to reuse the nonce.
     */
    async releaseNonce(nonce) {
        // If the nonce to release is exactly the last one we gave out, we can safely roll back
        if (this.currentNonce === nonce + 1) {
            this.currentNonce = nonce;
            logger_1.logger.info('NonceManager', `Released nonce ${nonce} for reuse`);
        }
        else {
            logger_1.logger.warn('NonceManager', `Cannot safely release nonce ${nonce} (current: ${this.currentNonce}). Forcing on-chain resync.`);
            await this.syncFromChain();
        }
    }
    /**
     * Handle edge cases when tx is rejected due to nonce issues.
     */
    async handleNonceError(errorMsg) {
        if (errorMsg.includes("nonce too low") || errorMsg.includes("replacement transaction underpriced")) {
            logger_1.logger.warn('NonceManager', 'Nonce mismatch detected. Re-syncing...');
            await this.syncFromChain();
        }
    }
}
exports.NonceManager = NonceManager;

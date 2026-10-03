"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxSubmitter = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("../utils/logger");
const constants_1 = require("../config/constants");
class TxSubmitter {
    config;
    activeRpcIndex = 0;
    providers = [];
    poolIface;
    constructor(config) {
        this.config = config;
        this.poolIface = new ethers_1.ethers.Interface(constants_1.POOL_ABI);
        // Initialize providers
        for (const url of config.rpcUrls) {
            if (url) {
                this.providers.push(new ethers_1.ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
            }
        }
        if (this.providers.length === 0) {
            throw new Error("No valid RPC URLs provided for TxSubmitter");
        }
        // Periodically test backup RPCs every 60s
        setInterval(() => this.testRpcs(), 60000);
    }
    get activeProvider() {
        return this.providers[this.activeRpcIndex];
    }
    async switchRpc() {
        if (this.providers.length <= 1)
            return;
        const oldIndex = this.activeRpcIndex;
        this.activeRpcIndex = (this.activeRpcIndex + 1) % this.providers.length;
        logger_1.logger.warn('TxSubmitter', `Switched RPC from index ${oldIndex} to ${this.activeRpcIndex}`);
    }
    async testRpcs() {
        for (let i = 0; i < this.providers.length; i++) {
            try {
                const start = performance.now();
                await this.providers[i].getBlockNumber();
                const latency = performance.now() - start;
                if (i !== this.activeRpcIndex && latency < 50) {
                    // Could implement auto-fallback
                }
            }
            catch (err) {
                logger_1.logger.error('TxSubmitter', `RPC index ${i} failed health check`);
                if (i === this.activeRpcIndex) {
                    await this.switchRpc();
                }
            }
        }
    }
    /**
     * Submits a transaction with failover handling
     */
    async submitTransaction(signedTx, decision, timestamps, nonceUsed) {
        const submitStart = performance.now();
        let txHash;
        // 1. Broadcast with failover
        try {
            txHash = await this.broadcastRawTransaction(signedTx);
        }
        catch (err) {
            logger_1.logger.error('TxSubmitter', `Broadcast failed completely: ${err.message}`);
            // Handle nonce issues
            if (err.message && (err.message.includes('nonce') || err.message.includes('replacement transaction underpriced'))) {
                await this.config.nonceManager.handleNonceError(err.message);
            }
            else {
                // Release nonce for reuse if not a nonce error
                await this.config.nonceManager.releaseNonce(nonceUsed);
            }
            return;
        }
        const submitted = Date.now();
        logger_1.logger.info('TxSubmitter', `Tx broadcasted: ${txHash}`);
        // 2. Poll for receipt
        let receipt = null;
        const timeoutMs = 30000;
        const pollInterval = 1000;
        for (let i = 0; i < timeoutMs / pollInterval; i++) {
            try {
                receipt = await this.activeProvider.getTransactionReceipt(txHash);
                if (receipt)
                    break;
            }
            catch (e) {
                // Ignore fetch errors, might be a transient RPC issue
            }
            await new Promise(res => setTimeout(res, pollInterval));
        }
        // 3. Process outcome
        const confirmed = Date.now();
        const result = {
            txHash,
            status: "DROPPED",
            gasUsed: 0n,
            gasCostUSD: 0,
            totalPipelineLatencyMs: confirmed - timestamps.detected,
            timestamps: { ...timestamps, submitted, confirmed }
        };
        if (!receipt) {
            result.status = "DROPPED";
            // We abandon it if it's dropped (stale opportunity)
        }
        else {
            result.blockNumber = receipt.blockNumber;
            result.gasUsed = receipt.gasUsed;
            result.gasCostUSD = Number(ethers_1.ethers.formatEther(receipt.gasUsed * receipt.gasPrice)) * this.config.ethPriceUSD;
            if (receipt.status === 1) {
                result.status = "SUCCESS";
                const grossUSD = decision.breakdown.grossRevenueUSD - decision.breakdown.flashLoanFeeUSD - decision.breakdown.swapCostUSD;
                result.profitUSD = grossUSD - result.gasCostUSD;
            }
            else {
                result.status = "REVERTED";
                // Parse revert reason and check for race loss
                const revertAnalysis = await this.analyzeRevert(txHash, receipt, decision);
                result.revertReason = revertAnalysis.reason;
                result.isRaceLoss = revertAnalysis.isRaceLoss;
                result.raceLossGapMs = revertAnalysis.latencyGapMs;
            }
        }
        // 4. Log and Track
        this.config.resultHandler.handleResult(result);
    }
    async broadcastRawTransaction(signedTx) {
        let attempts = 0;
        while (attempts < this.providers.length) {
            try {
                const hash = await this.activeProvider.send("eth_sendRawTransaction", [signedTx]);
                return hash;
            }
            catch (err) {
                logger_1.logger.warn('TxSubmitter', `Broadcast via RPC ${this.activeRpcIndex} failed: ${err.message}`);
                await this.switchRpc();
                attempts++;
            }
        }
        throw new Error("All RPCs failed to broadcast transaction");
    }
    async analyzeRevert(txHash, receipt, decision) {
        let reason = "UNKNOWN";
        let isRaceLoss = false;
        let latencyGapMs = 0;
        try {
            const tx = await this.activeProvider.getTransaction(txHash);
            if (tx) {
                try {
                    await this.activeProvider.call({
                        to: tx.to,
                        data: tx.data,
                        value: tx.value,
                        from: tx.from,
                        nonce: tx.nonce,
                        maxFeePerGas: tx.maxFeePerGas,
                        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
                        blockTag: receipt.blockNumber - 1
                    });
                }
                catch (callErr) {
                    if (callErr.data) {
                        reason = callErr.data;
                        try {
                            reason = ethers_1.ethers.toUtf8String(callErr.data);
                        }
                        catch { }
                    }
                    else if (callErr.message) {
                        reason = callErr.message;
                    }
                }
            }
            if (reason.includes("42") || reason.includes("HEALTH_FACTOR_NOT_BELOW_THRESHOLD")) {
                isRaceLoss = true;
                reason = "HEALTH_FACTOR_NOT_BELOW_THRESHOLD (Race Loss)";
                latencyGapMs = await this.findWinningTx(receipt.blockNumber, decision.params.borrower);
            }
        }
        catch (e) {
            // Ignore errors in revert analysis
        }
        return { reason, isRaceLoss, latencyGapMs };
    }
    async findWinningTx(blockNumber, borrower) {
        try {
            for (let b = blockNumber; b >= blockNumber - 1; b--) {
                const block = await this.activeProvider.getBlock(b, true);
                if (!block || !block.prefetchedTransactions)
                    continue;
                for (const tx of block.prefetchedTransactions) {
                    if (tx.data.includes(borrower.replace("0x", "").toLowerCase())) {
                        if (b === blockNumber - 1)
                            return 2000;
                        return 500;
                    }
                }
            }
        }
        catch (e) { }
        return 0;
    }
}
exports.TxSubmitter = TxSubmitter;

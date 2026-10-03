"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockListener = void 0;
const ethers_1 = require("ethers");
const events_1 = require("events");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const retry_1 = require("../utils/retry");
class BlockListener extends events_1.EventEmitter {
    provider;
    isConnected = false;
    // State tracking
    lastProcessedBlock = 0;
    lastProcessedHash = '';
    recentBlocks = new Set(); // For deduplication
    // Metrics
    totalBlocksProcessed = 0;
    totalReconnects = 0;
    startTime = 0;
    blockTimes = [];
    lastBlockTime = 0;
    constructor() {
        super();
    }
    async start() {
        this.startTime = Date.now();
        await this.connect();
    }
    async connect() {
        try {
            this.provider = new ethers_1.ethers.WebSocketProvider(env_1.env.RPC_URL_WS);
            this.provider.on('block', this.handleNewBlock.bind(this));
            const ws = this.provider.websocket;
            ws.on('error', (e) => {
                logger_1.logger.error('BlockListener', `WebSocket Error: ${e?.message}`);
            });
            ws.on('close', async () => {
                if (this.isConnected) {
                    logger_1.logger.warn('BlockListener', 'WebSocket Disconnected. Reconnecting...');
                    this.isConnected = false;
                    this.totalReconnects++;
                    this.provider.removeAllListeners();
                    await (0, retry_1.withRetry)(() => this.connect(), 'BlockListener', 'Reconnect', 10);
                }
            });
            this.isConnected = true;
            logger_1.logger.info('BlockListener', 'Connected to WebSocket');
            // Check for missed blocks on reconnect
            const currentBlock = await this.provider.getBlockNumber();
            if (this.lastProcessedBlock > 0 && currentBlock > this.lastProcessedBlock) {
                await this.catchup(this.lastProcessedBlock + 1, currentBlock);
            }
        }
        catch (error) {
            logger_1.logger.error('BlockListener', `Connection failed: ${error.message}`);
            throw error; // Will be caught by exponentialBackoff
        }
    }
    stop() {
        if (this.provider) {
            this.provider.removeAllListeners();
            this.provider.destroy();
        }
    }
    async handleNewBlock(blockNumber) {
        if (this.recentBlocks.has(blockNumber))
            return; // Deduplication
        try {
            const block = await this.provider.getBlock(blockNumber);
            if (!block)
                return;
            this.processBlockData(block);
        }
        catch (e) {
            logger_1.logger.error('BlockListener', `Error fetching block ${blockNumber}: ${e.message}`);
        }
    }
    processBlockData(block) {
        this.recentBlocks.add(block.number);
        if (this.recentBlocks.size > 50) {
            const oldest = Array.from(this.recentBlocks)[0];
            this.recentBlocks.delete(oldest);
        }
        // Reorg detection
        if (this.lastProcessedHash && block.parentHash !== this.lastProcessedHash && block.number === this.lastProcessedBlock + 1) {
            logger_1.logger.warn('BlockListener', `Reorg detected! Expected parent: ${this.lastProcessedHash}, got: ${block.parentHash}`);
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
            if (this.blockTimes.length > 50)
                this.blockTimes.shift();
        }
        this.lastBlockTime = now;
        const blockEvent = {
            blockNumber: block.number,
            blockHash: block.hash || '',
            timestamp: block.timestamp,
            parentHash: block.parentHash
        };
        this.emit('newBlock', blockEvent);
    }
    async catchup(from, to) {
        logger_1.logger.info('BlockListener', `Catching up missed blocks from ${from} to ${to}`);
        for (let i = from; i <= to; i++) {
            if (!this.recentBlocks.has(i)) {
                try {
                    const block = await this.provider.getBlock(i);
                    if (block) {
                        this.emit('catchup', i);
                        this.processBlockData(block);
                    }
                }
                catch (e) {
                    logger_1.logger.error('BlockListener', `Catchup failed for block ${i}: ${e.message}`);
                }
            }
        }
    }
    getTipBlock() {
        return this.lastProcessedBlock;
    }
    getMetrics() {
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
exports.BlockListener = BlockListener;

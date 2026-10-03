"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BorrowerIndex = void 0;
const ethers_1 = require("ethers");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../utils/logger");
const constants_1 = require("../config/constants");
const env_1 = require("../config/env");
class BorrowerIndex {
    activeBorrowers = new Map();
    provider;
    poolContract;
    dbPath = path_1.default.resolve(__dirname, '../../../data/borrower_index.json');
    blocksSinceLastSave = 0;
    constructor() {
        // We use HTTP provider for bulk log querying (more stable than WS for deep historical queries)
        this.provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
        this.poolContract = new ethers_1.ethers.Contract(constants_1.POOL, constants_1.POOL_ABI, this.provider);
    }
    async initialize(currentBlock) {
        let startBlock = 2113028;
        if (fs_1.default.existsSync(this.dbPath)) {
            startBlock = this.loadFromFile();
            logger_1.logger.info('BorrowerIndex', `Loaded ${this.activeBorrowers.size} borrowers from disk.`);
        }
        else {
            logger_1.logger.info('BorrowerIndex', 'No local index found. Bootstrapping from inception...');
        }
        if (startBlock < currentBlock) {
            await this.bootstrap(startBlock, currentBlock);
        }
    }
    async bootstrap(startBlock, currentBlock) {
        const CHUNK_SIZE = 5000;
        logger_1.logger.info('BorrowerIndex', `Scanning blocks ${startBlock} to ${currentBlock} for events...`);
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
            }
            catch (e) {
                logger_1.logger.warn('BorrowerIndex', `Bootstrap chunk ${from}-${to} failed: ${e.message}`);
            }
        }
        logger_1.logger.info('BorrowerIndex', `Bootstrap complete. Found ${this.activeBorrowers.size} potential borrowers.`);
    }
    async processNewBlockEvents(blockNumber) {
        try {
            // Query all events for the pool in this single block
            const logs = await this.provider.getLogs({
                address: constants_1.POOL,
                fromBlock: blockNumber,
                toBlock: blockNumber
            });
            for (const log of logs) {
                const parsed = this.poolContract.interface.parseLog(log);
                if (!parsed)
                    continue;
                const eventName = parsed.name;
                if (eventName === 'Borrow') {
                    const user = (parsed.args.onBehalfOf || parsed.args.user).toLowerCase();
                    this.updateBorrower(user, blockNumber);
                }
                else if (eventName === 'Repay') {
                    const user = parsed.args.user.toLowerCase();
                    // We mark them as updated; full repayment check happens via HF scanner later
                    this.updateBorrower(user, blockNumber);
                }
                else if (eventName === 'Supply' || eventName === 'Withdraw') {
                    const user = (parsed.args.onBehalfOf || parsed.args.user).toLowerCase();
                    if (this.activeBorrowers.has(user)) {
                        this.updateBorrower(user, blockNumber);
                    }
                }
                else if (eventName === 'LiquidationCall') {
                    const user = parsed.args.user.toLowerCase();
                    this.updateBorrower(user, blockNumber);
                }
            }
            this.blocksSinceLastSave++;
            if (this.blocksSinceLastSave >= 100) {
                this.saveToFile();
                this.blocksSinceLastSave = 0;
            }
        }
        catch (e) {
            logger_1.logger.error('BorrowerIndex', `Error processing block ${blockNumber} events: ${e.message}`);
        }
    }
    updateBorrower(address, blockNumber) {
        const existing = this.activeBorrowers.get(address);
        if (existing) {
            existing.lastSeenBlock = blockNumber;
            // Changing tier requires a HF scan which will happen in Step 2.
            // We flag it by setting tier back to Unknown if it was Safe.
            if (existing.tier === 'Safe')
                existing.tier = 'Unknown';
        }
        else {
            this.activeBorrowers.set(address, {
                address,
                lastSeenBlock: blockNumber,
                estimatedHF: null,
                tier: 'Unknown'
            });
            logger_1.logger.info('BorrowerIndex', `New borrower added: ${address}`);
        }
    }
    removeBorrower(address) {
        this.activeBorrowers.delete(address.toLowerCase());
    }
    lastProcessedBlock = 2113028;
    saveToFile() {
        const arr = Array.from(this.activeBorrowers.values());
        const data = { lastProcessedBlock: this.lastProcessedBlock, borrowers: arr };
        fs_1.default.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
        logger_1.logger.info('BorrowerIndex', 'Saved index to disk.');
    }
    loadFromFile() {
        try {
            const dataStr = fs_1.default.readFileSync(this.dbPath, 'utf8');
            const data = JSON.parse(dataStr);
            // Legacy format check
            if (Array.isArray(data)) {
                for (const b of data) {
                    this.activeBorrowers.set(b.address, b);
                }
                return 2113028;
            }
            else {
                const arr = data.borrowers || [];
                for (const b of arr) {
                    this.activeBorrowers.set(b.address, b);
                }
                this.lastProcessedBlock = data.lastProcessedBlock || 2113028;
                return this.lastProcessedBlock;
            }
        }
        catch (e) {
            return 2113028;
        }
    }
    getStats() {
        const tiers = { Critical: 0, Warning: 0, Watch: 0, Safe: 0, Unknown: 0 };
        for (const b of this.activeBorrowers.values()) {
            tiers[b.tier]++;
        }
        return {
            total: this.activeBorrowers.size,
            breakdown: tiers
        };
    }
    getAllBorrowers() {
        return Array.from(this.activeBorrowers.values());
    }
}
exports.BorrowerIndex = BorrowerIndex;

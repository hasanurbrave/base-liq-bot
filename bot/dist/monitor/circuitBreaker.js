"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ethers_1 = require("ethers");
const events_1 = require("events");
const logger_1 = require("../utils/logger");
class CircuitBreaker extends events_1.EventEmitter {
    config;
    consecutiveReverts = 0;
    dailyLossUSD = 0;
    lastLossReset = Date.now();
    killSwitchPath;
    provider;
    walletAddress;
    constructor(config, provider, walletAddress) {
        super();
        this.config = config;
        this.provider = provider;
        this.walletAddress = walletAddress;
        this.killSwitchPath = path_1.default.resolve(process.cwd(), 'kill.switch');
    }
    start() {
        setInterval(() => this.checkRuntimeKillSwitch(), 5000);
        setInterval(() => this.checkWalletBalance(), 60000); // every minute
        setInterval(() => this.resetDailyLoss(), 24 * 60 * 60 * 1000); // every 24h
        logger_1.logger.info('CircuitBreaker', 'Circuit breakers armed and monitoring.');
    }
    recordRevert(gasLossUSD) {
        this.consecutiveReverts++;
        this.dailyLossUSD += gasLossUSD;
        logger_1.logger.warn('CircuitBreaker', `Recorded revert. Consecutive: ${this.consecutiveReverts}, Daily Loss: $${this.dailyLossUSD.toFixed(2)}`);
        this.checkBreakers();
    }
    recordSuccess() {
        if (this.consecutiveReverts > 0) {
            logger_1.logger.info('CircuitBreaker', 'Transaction succeeded. Resetting consecutive reverts.');
            this.consecutiveReverts = 0;
        }
    }
    checkBreakers() {
        if (this.consecutiveReverts >= this.config.maxConsecutiveReverts) {
            this.triggerHalt(`Max consecutive reverts reached (${this.consecutiveReverts})`);
        }
        if (this.dailyLossUSD >= this.config.maxDailyLossUSD) {
            this.triggerHalt(`Max daily loss reached ($${this.dailyLossUSD.toFixed(2)})`);
        }
    }
    checkRuntimeKillSwitch() {
        if (fs_1.default.existsSync(this.killSwitchPath)) {
            this.triggerHalt('Runtime kill.switch file detected.');
        }
    }
    async checkWalletBalance() {
        try {
            const balance = await this.provider.getBalance(this.walletAddress);
            const balanceETH = Number(ethers_1.ethers.formatEther(balance));
            if (balanceETH < this.config.minWalletBalanceETH) {
                this.triggerHalt(`Wallet balance (${balanceETH.toFixed(4)} ETH) below minimum (${this.config.minWalletBalanceETH} ETH)`);
            }
        }
        catch (e) {
            // Ignore transient RPC errors
        }
    }
    resetDailyLoss() {
        this.dailyLossUSD = 0;
        this.lastLossReset = Date.now();
        logger_1.logger.info('CircuitBreaker', 'Reset daily gas loss tracker.');
    }
    triggerHalt(reason) {
        logger_1.logger.error('CircuitBreaker', `!!! CIRCUIT BREAKER TRIPPED !!! Reason: ${reason}`);
        this.emit('halt', reason);
    }
}
exports.CircuitBreaker = CircuitBreaker;

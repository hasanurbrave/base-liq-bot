"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Monitoring = void 0;
const logger_1 = require("../utils/logger");
class Monitoring {
    resultHandler;
    startTime;
    heartbeatInterval = null;
    dailyInterval = null;
    // Health Metrics
    lastBlockProcessed = 0;
    tipBlockNumber = 0;
    tiers = { Critical: 0, Warning: 0, Watch: 0, Safe: 0, Unknown: 0 };
    pendingTransactionsCount = 0;
    constructor(resultHandler) {
        this.resultHandler = resultHandler;
        this.startTime = Date.now();
    }
    start() {
        this.heartbeatInterval = setInterval(() => this.heartbeat(), 30000);
        this.dailyInterval = setInterval(() => this.dailySummary(), 24 * 60 * 60 * 1000);
        logger_1.logger.info('Monitoring', 'Monitoring and Health Checks started');
    }
    stop() {
        if (this.heartbeatInterval)
            clearInterval(this.heartbeatInterval);
        if (this.dailyInterval)
            clearInterval(this.dailyInterval);
    }
    updateHealth(lastBlock, tipBlock, tiers, pendingCount) {
        this.lastBlockProcessed = lastBlock;
        this.tipBlockNumber = tipBlock;
        this.tiers = tiers;
        this.pendingTransactionsCount = pendingCount;
    }
    heartbeat() {
        const lag = this.tipBlockNumber - this.lastBlockProcessed;
        logger_1.logger.info('Monitoring', `[HEARTBEAT] Alive. Last Block: ${this.lastBlockProcessed} (Lag: ${lag}). Pending Txs: ${this.pendingTransactionsCount}`);
        logger_1.logger.info('Monitoring', `[TIERS] Critical: ${this.tiers.Critical} | Warning: ${this.tiers.Warning} | Watch: ${this.tiers.Watch} | Safe: ${this.tiers.Safe}`);
        this.runHealthChecks(lag);
    }
    runHealthChecks(lag) {
        // Check block processing lag
        if (lag > 3) {
            logger_1.logger.error('Monitoring', `[ALERT] Block processing lag is ${lag} blocks behind tip!`);
        }
        // Check memory usage
        const memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;
        if (memoryUsageMB > 500) {
            logger_1.logger.error('Monitoring', `[ALERT] Memory usage high: ${memoryUsageMB.toFixed(2)} MB`);
        }
    }
    dailySummary() {
        const uptimeHours = (Date.now() - this.startTime) / 3600000;
        logger_1.logger.info('Monitoring', `[DAILY SUMMARY] Uptime: ${uptimeHours.toFixed(2)} hours`);
        this.resultHandler.logCumulativeMetrics();
    }
}
exports.Monitoring = Monitoring;

import { logger } from '../utils/logger';
import { ResultHandler } from '../execution/resultHandler';

export class Monitoring {
  private resultHandler: ResultHandler;
  private startTime: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private dailyInterval: NodeJS.Timeout | null = null;
  
  // Health Metrics
  public lastBlockProcessed: number = 0;
  public tipBlockNumber: number = 0;
  public tiers = { Critical: 0, Warning: 0, Watch: 0, Safe: 0, Unknown: 0 };
  public pendingTransactionsCount: number = 0;
  
  constructor(resultHandler: ResultHandler) {
    this.resultHandler = resultHandler;
    this.startTime = Date.now();
  }

  public start() {
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 30000);
    this.dailyInterval = setInterval(() => this.dailySummary(), 24 * 60 * 60 * 1000);
    logger.info('Monitoring', 'Monitoring and Health Checks started');
  }

  public stop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.dailyInterval) clearInterval(this.dailyInterval);
  }

  public updateHealth(lastBlock: number, tipBlock: number, tiers: any, pendingCount: number) {
    this.lastBlockProcessed = lastBlock;
    this.tipBlockNumber = tipBlock;
    this.tiers = tiers;
    this.pendingTransactionsCount = pendingCount;
  }

  private heartbeat() {
    const lag = this.tipBlockNumber - this.lastBlockProcessed;
    
    logger.info('Monitoring', `[HEARTBEAT] Alive. Last Block: ${this.lastBlockProcessed} (Lag: ${lag}). Pending Txs: ${this.pendingTransactionsCount}`);
    logger.info('Monitoring', `[TIERS] Critical: ${this.tiers.Critical} | Warning: ${this.tiers.Warning} | Watch: ${this.tiers.Watch} | Safe: ${this.tiers.Safe}`);
    
    this.runHealthChecks(lag);
  }

  private runHealthChecks(lag: number) {
    // Check block processing lag
    if (lag > 3) {
      logger.error('Monitoring', `[ALERT] Block processing lag is ${lag} blocks behind tip!`);
    }

    // Check memory usage
    const memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memoryUsageMB > 500) {
      logger.error('Monitoring', `[ALERT] Memory usage high: ${memoryUsageMB.toFixed(2)} MB`);
    }
  }

  private dailySummary() {
    const uptimeHours = (Date.now() - this.startTime) / 3600000;
    logger.info('Monitoring', `[DAILY SUMMARY] Uptime: ${uptimeHours.toFixed(2)} hours`);
    this.resultHandler.logCumulativeMetrics();
  }
}

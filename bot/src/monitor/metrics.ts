import { logger } from '../utils/logger';

export class MetricsTracker {
  private blocksProcessed = 0;
  private totalScanLatencyMs = 0;
  private scanCount = 0;
  private rpcCalls = 0;
  private activeConnections = 0;
  private totalReconnects = 0;
  
  private intervalId: NodeJS.Timeout | null = null;

  public start() {
    this.intervalId = setInterval(() => this.logMetrics(), 60000);
  }

  public stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  public recordBlock() {
    this.blocksProcessed++;
  }

  public recordScanLatency(latencyMs: number) {
    this.totalScanLatencyMs += latencyMs;
    this.scanCount++;
  }

  public recordRpcCall(count = 1) {
    this.rpcCalls += count;
  }

  public updateConnections(active: number, reconnects: number) {
    this.activeConnections = active;
    this.totalReconnects = reconnects;
  }

  public logMetrics(tiers?: { Critical: number, Warning: number, Watch: number, Safe: number, Unknown: number }) {
    const avgLatency = this.scanCount > 0 ? (this.totalScanLatencyMs / this.scanCount).toFixed(2) : 0;
    
    const payload = {
      type: "METRICS_REPORT",
      blocksProcessedLast60s: this.blocksProcessed,
      avgScanLatencyMs: Number(avgLatency),
      rpcCallsLast60s: this.rpcCalls,
      activeWebSockets: this.activeConnections,
      totalReconnectsSinceStart: this.totalReconnects,
      tiers: tiers || { Critical: 0, Warning: 0, Watch: 0, Safe: 0, Unknown: 0 },
      timestamp: new Date().toISOString()
    };

    logger.info('MetricsTracker', JSON.stringify(payload));

    // Reset counters for next 60s window
    this.blocksProcessed = 0;
    this.totalScanLatencyMs = 0;
    this.scanCount = 0;
    this.rpcCalls = 0;
  }
}

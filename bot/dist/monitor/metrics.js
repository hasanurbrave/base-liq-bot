"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsTracker = void 0;
const logger_1 = require("../utils/logger");
class MetricsTracker {
    blocksProcessed = 0;
    totalScanLatencyMs = 0;
    scanCount = 0;
    rpcCalls = 0;
    activeConnections = 0;
    totalReconnects = 0;
    intervalId = null;
    start() {
        this.intervalId = setInterval(() => this.logMetrics(), 60000);
    }
    stop() {
        if (this.intervalId)
            clearInterval(this.intervalId);
    }
    recordBlock() {
        this.blocksProcessed++;
    }
    recordScanLatency(latencyMs) {
        this.totalScanLatencyMs += latencyMs;
        this.scanCount++;
    }
    recordRpcCall(count = 1) {
        this.rpcCalls += count;
    }
    updateConnections(active, reconnects) {
        this.activeConnections = active;
        this.totalReconnects = reconnects;
    }
    logMetrics(tiers) {
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
        logger_1.logger.info('MetricsTracker', JSON.stringify(payload));
        // Reset counters for next 60s window
        this.blocksProcessed = 0;
        this.totalScanLatencyMs = 0;
        this.scanCount = 0;
        this.rpcCalls = 0;
    }
}
exports.MetricsTracker = MetricsTracker;

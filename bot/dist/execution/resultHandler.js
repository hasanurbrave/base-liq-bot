"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultHandler = void 0;
const logger_1 = require("../utils/logger");
class ResultHandler {
    metrics = {
        attempts: 0,
        successes: 0,
        reverts: 0,
        drops: 0,
        totalProfitUSD: 0,
        totalGasWastedUSD: 0
    };
    handleResult(result) {
        this.metrics.attempts++;
        switch (result.status) {
            case "SUCCESS":
                this.metrics.successes++;
                this.metrics.totalProfitUSD += (result.profitUSD || 0);
                logger_1.logger.info('ResultHandler', `[SUCCESS] Tx: ${result.txHash} | Profit: $${result.profitUSD?.toFixed(2)} | Latency: ${result.totalPipelineLatencyMs}ms`);
                break;
            case "REVERTED":
                this.metrics.reverts++;
                this.metrics.totalGasWastedUSD += result.gasCostUSD;
                if (result.isRaceLoss) {
                    logger_1.logger.warn('ResultHandler', `[RACE LOSS] Tx: ${result.txHash} | Gap: ${result.raceLossGapMs}ms | Wasted: $${result.gasCostUSD.toFixed(4)}`);
                }
                else {
                    logger_1.logger.error('ResultHandler', `[REVERTED] Tx: ${result.txHash} | Reason: ${result.revertReason} | Wasted: $${result.gasCostUSD.toFixed(4)}`);
                }
                break;
            case "DROPPED":
                this.metrics.drops++;
                logger_1.logger.warn('ResultHandler', `[DROPPED] Tx: ${result.txHash} | No receipt after timeout.`);
                break;
        }
    }
    getMetrics() {
        const winRate = this.metrics.attempts > 0
            ? (this.metrics.successes / this.metrics.attempts) * 100
            : 0;
        const avgProfitPerSuccess = this.metrics.successes > 0
            ? this.metrics.totalProfitUSD / this.metrics.successes
            : 0;
        const avgGasWastedPerRevert = this.metrics.reverts > 0
            ? this.metrics.totalGasWastedUSD / this.metrics.reverts
            : 0;
        return {
            ...this.metrics,
            winRatePercent: parseFloat(winRate.toFixed(2)),
            avgProfitPerSuccessUSD: parseFloat(avgProfitPerSuccess.toFixed(2)),
            avgGasWastedPerRevertUSD: parseFloat(avgGasWastedPerRevert.toFixed(4))
        };
    }
    logCumulativeMetrics() {
        const m = this.getMetrics();
        logger_1.logger.info('ResultHandler', `[METRICS] Attempts: ${m.attempts} | WinRate: ${m.winRatePercent}% | Total Profit: $${m.totalProfitUSD.toFixed(2)} | Gas Wasted: $${m.totalGasWastedUSD.toFixed(2)}`);
    }
}
exports.ResultHandler = ResultHandler;

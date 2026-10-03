import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface CircuitBreakerConfig {
  maxConsecutiveReverts: number;
  maxDailyLossUSD: number;
  minWalletBalanceETH: number;
}

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private consecutiveReverts: number = 0;
  private dailyLossUSD: number = 0;
  private lastLossReset: number = Date.now();
  private killSwitchPath: string;
  private provider: ethers.Provider;
  private walletAddress: string;

  constructor(config: CircuitBreakerConfig, provider: ethers.Provider, walletAddress: string) {
    super();
    this.config = config;
    this.provider = provider;
    this.walletAddress = walletAddress;
    this.killSwitchPath = path.resolve(__dirname, '../../../../kill.switch');
  }

  public start() {
    setInterval(() => this.checkRuntimeKillSwitch(), 5000);
    setInterval(() => this.checkWalletBalance(), 60000); // every minute
    setInterval(() => this.resetDailyLoss(), 24 * 60 * 60 * 1000); // every 24h
    logger.info('CircuitBreaker', 'Circuit breakers armed and monitoring.');
  }

  public recordRevert(gasLossUSD: number) {
    this.consecutiveReverts++;
    this.dailyLossUSD += gasLossUSD;
    logger.warn('CircuitBreaker', `Recorded revert. Consecutive: ${this.consecutiveReverts}, Daily Loss: $${this.dailyLossUSD.toFixed(2)}`);
    this.checkBreakers();
  }

  public recordSuccess() {
    if (this.consecutiveReverts > 0) {
      logger.info('CircuitBreaker', 'Transaction succeeded. Resetting consecutive reverts.');
      this.consecutiveReverts = 0;
    }
  }

  private checkBreakers() {
    if (this.consecutiveReverts >= this.config.maxConsecutiveReverts) {
      this.triggerHalt(`Max consecutive reverts reached (${this.consecutiveReverts})`);
    }
    if (this.dailyLossUSD >= this.config.maxDailyLossUSD) {
      this.triggerHalt(`Max daily loss reached ($${this.dailyLossUSD.toFixed(2)})`);
    }
  }

  private checkRuntimeKillSwitch() {
    if (fs.existsSync(this.killSwitchPath)) {
      this.triggerHalt('Runtime kill.switch file detected.');
    }
  }

  private async checkWalletBalance() {
    try {
      const balance = await this.provider.getBalance(this.walletAddress);
      const balanceETH = Number(ethers.formatEther(balance));
      if (balanceETH < this.config.minWalletBalanceETH) {
        this.triggerHalt(`Wallet balance (${balanceETH.toFixed(4)} ETH) below minimum (${this.config.minWalletBalanceETH} ETH)`);
      }
    } catch (e) {
      // Ignore transient RPC errors
    }
  }

  private resetDailyLoss() {
    this.dailyLossUSD = 0;
    this.lastLossReset = Date.now();
    logger.info('CircuitBreaker', 'Reset daily gas loss tracker.');
  }

  private triggerHalt(reason: string) {
    logger.error('CircuitBreaker', `!!! CIRCUIT BREAKER TRIPPED !!! Reason: ${reason}`);
    this.emit('halt', reason);
  }
}

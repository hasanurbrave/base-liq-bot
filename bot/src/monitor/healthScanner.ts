import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { env } from '../config/env';
import { POOL, POOL_ABI } from '../config/constants';
import { BorrowerIndex, BorrowerMetadata } from './borrowerIndex';
import { logger } from '../utils/logger';

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)"
];

export class HealthScanner extends EventEmitter {
  private provider: ethers.Provider;
  private multicall: ethers.Contract;
  private poolInterface: ethers.Interface;
  
  // Track consecutive scans where HF < 1.0
  private lowHFCount = new Map<string, number>();

  constructor() {
    super();
    // HTTP provider is generally better for large static calls (Multicall)
    this.provider = new ethers.JsonRpcProvider(env.RPC_URL_HTTP);
    this.multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, this.provider);
    this.poolInterface = new ethers.Interface(POOL_ABI);
  }

  public async scan(borrowers: BorrowerMetadata[], blockNumber: number, forceRescan: boolean = false) {
    const toScan: BorrowerMetadata[] = [];
    
    // Determine which borrowers to scan this block based on tier frequencies
    for (const b of borrowers) {
      if (forceRescan && (b.tier === 'Critical' || b.tier === 'Warning')) {
        toScan.push(b);
        continue;
      }
      
      const mod = blockNumber % 150; // max frequency is 150
      
      if (b.tier === 'Critical' || b.tier === 'Unknown') {
        toScan.push(b); // Every block
      } else if (b.tier === 'Warning' && blockNumber % 5 === 0) {
        toScan.push(b);
      } else if (b.tier === 'Watch' && blockNumber % 30 === 0) {
        toScan.push(b);
      } else if (b.tier === 'Safe' && blockNumber % 150 === 0) {
        toScan.push(b);
      }
    }

    if (toScan.length === 0) return;

    const start = performance.now();
    
    // Batch in chunks of 200
    const CHUNK_SIZE = 200;
    for (let i = 0; i < toScan.length; i += CHUNK_SIZE) {
      const chunk = toScan.slice(i, i + CHUNK_SIZE);
      await this.executeBatch(chunk);
    }
    
    const duration = performance.now() - start;
    if (forceRescan) {
      logger.info('HealthScanner', `Force re-scanned ${toScan.length} at-risk accounts in ${duration.toFixed(2)}ms`);
    } else if (toScan.length > 50 || duration > 100) {
      logger.info('HealthScanner', `Scanned ${toScan.length} accounts in ${duration.toFixed(2)}ms (Block ${blockNumber})`);
    }
  }

  private async executeBatch(borrowers: BorrowerMetadata[]) {
    const calls = borrowers.map(b => ({
      target: POOL,
      allowFailure: true,
      callData: this.poolInterface.encodeFunctionData('getUserAccountData', [b.address])
    }));

    try {
      const results = await this.multicall.aggregate3.staticCall(calls);
      
      for (let i = 0; i < results.length; i++) {
        if (!results[i].success) continue;
        
        const decoded = this.poolInterface.decodeFunctionResult('getUserAccountData', results[i].returnData);
        const hfBigInt = decoded.healthFactor;
        
        // HF is 18 decimals, cap it at a reasonable max (e.g. 100) if it's type(uint256).max
        const MAX_HF = ethers.parseUnits("100", 18);
        const actualHf = hfBigInt > MAX_HF ? MAX_HF : hfBigInt;
        const hfValue = Number(ethers.formatUnits(actualHf, 18));
        
        this.processHF(borrowers[i], hfValue);
      }
    } catch (e: any) {
      logger.error('HealthScanner', `Multicall batch failed: ${e.message}`);
    }
  }

  private processHF(borrower: BorrowerMetadata, hf: number) {
    const oldTier = borrower.tier;
    borrower.estimatedHF = hf;
    
    // Tier classification
    if (hf < 1.05) borrower.tier = 'Critical';
    else if (hf < 1.15) borrower.tier = 'Warning';
    else if (hf < 1.30) borrower.tier = 'Watch';
    else borrower.tier = 'Safe';

    // Transition logging
    if (oldTier !== 'Unknown' && oldTier !== borrower.tier) {
      if ((oldTier === 'Safe' && borrower.tier !== 'Safe') || 
          (oldTier === 'Watch' && (borrower.tier === 'Warning' || borrower.tier === 'Critical')) ||
          (oldTier === 'Warning' && borrower.tier === 'Critical')) {
        logger.warn('HealthScanner', `ESCALATION: Borrower ${borrower.address} moved from ${oldTier} to ${borrower.tier} (HF: ${hf.toFixed(4)})`);
      }
    }

    // Liquidation debounce logic
    if (hf < 1.0) {
      const count = (this.lowHFCount.get(borrower.address) || 0) + 1;
      this.lowHFCount.set(borrower.address, count);
      
      if (count >= 2) {
        logger.warn('HealthScanner', `LIQUIDATABLE: Borrower ${borrower.address} has confirmed HF < 1.0 (${hf.toFixed(4)})`);
        this.emit('liquidatable', borrower.address, hf);
        this.fetchFullPositionDetails(borrower.address, hf);
        this.lowHFCount.delete(borrower.address); 
      }
    } else {
      if (this.lowHFCount.has(borrower.address)) {
        this.lowHFCount.delete(borrower.address);
      }
    }
  }

  private async fetchFullPositionDetails(userAddress: string, hf: number) {
    const { SUPPORTED_ASSETS, POOL_DATA_PROVIDER, POOL_DATA_PROVIDER_ABI, ORACLE, ORACLE_ABI } = require('../config/constants');
    const dataProvider = new ethers.Interface(POOL_DATA_PROVIDER_ABI);
    const oracle = new ethers.Interface(ORACLE_ABI);
    
    const calls: any[] = [];
    
    // Build multicall for all assets
    for (const asset of SUPPORTED_ASSETS) {
      calls.push({
        target: POOL_DATA_PROVIDER,
        allowFailure: true,
        callData: dataProvider.encodeFunctionData('getUserReserveData', [asset.address, userAddress])
      });
      calls.push({
        target: ORACLE,
        allowFailure: true,
        callData: oracle.encodeFunctionData('getAssetPrice', [asset.address])
      });
    }

    try {
      const results = await this.multicall.aggregate3.staticCall(calls);
      
      const collaterals = [];
      const debts = [];
      let totalCollateralUsd = 0;
      let totalDebtUsd = 0;

      for (let i = 0; i < SUPPORTED_ASSETS.length; i++) {
        const asset = SUPPORTED_ASSETS[i];
        
        const reserveDataRes = results[i * 2];
        const priceRes = results[i * 2 + 1];
        
        if (!reserveDataRes.success || !priceRes.success) continue;

        const reserveData = dataProvider.decodeFunctionResult('getUserReserveData', reserveDataRes.returnData);
        const priceData = oracle.decodeFunctionResult('getAssetPrice', priceRes.returnData);
        
        const priceBase = Number(ethers.formatUnits(priceData[0], 8)); // Aave base oracle uses 8 decimals
        
        const aTokenBalance = reserveData.currentATokenBalance;
        const variableDebt = reserveData.currentVariableDebt;
        
        if (aTokenBalance > 0n) {
          const amount = Number(ethers.formatUnits(aTokenBalance, asset.decimals));
          const usdValue = amount * priceBase;
          totalCollateralUsd += usdValue;
          collaterals.push({ asset: asset.symbol, amount, usdValue, aTokenBalance: aTokenBalance.toString() });
        }
        
        if (variableDebt > 0n) {
          const amount = Number(ethers.formatUnits(variableDebt, asset.decimals));
          const usdValue = amount * priceBase;
          totalDebtUsd += usdValue;
          debts.push({ asset: asset.symbol, amount, usdValue, debtTokenBalance: variableDebt.toString() });
        }
      }

      // Determine size and urgency
      const size = totalDebtUsd > 1000 ? "LARGE" : (totalDebtUsd > 100 ? "MEDIUM" : "SMALL");
      const urgency = hf < 0.8 ? "DEEP" : (hf < 0.95 ? "MODERATE" : "MARGINAL");

      const alert = {
        type: "LIQUIDATION_OPPORTUNITY",
        borrower: userAddress,
        healthFactor: hf,
        collaterals,
        debts,
        blockNumber: 0, // In real system, pass blockNumber from scan
        timestamp: new Date().toISOString(),
        classification: { size, urgency }
      };

      logger.error('AlertSystem', JSON.stringify(alert, null, 2));

    } catch (e: any) {
      logger.error('HealthScanner', `Failed to fetch full position details: ${e.message}`);
    }
  }
}

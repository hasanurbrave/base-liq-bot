import { ethers } from 'ethers';
import { logger } from '../utils/logger';

const GAS_PRICE_ORACLE_ADDRESS = '0x420000000000000000000000000000000000000F';
const GAS_PRICE_ORACLE_ABI = [
  "function getL1Fee(bytes memory _data) external view returns (uint256)",
  "function baseFee() external view returns (uint256)",
  "function scalar() external view returns (uint256)",
  "function overhead() external view returns (uint256)"
];

export interface GasEstimateResult {
  success: boolean;
  l2GasUnits?: bigint;
  l2GasPriceWei?: bigint;
  l1DataFeeWei?: bigint;
  totalCostWei?: bigint;
  totalCostUSD?: number;
  gasBufferApplied?: number;
  l1CostWarning?: boolean;
  reason?: string;
}

export class GasEstimator {
  private provider: ethers.JsonRpcProvider;
  private oracle: ethers.Contract;
  private ethPriceUSD: number;
  
  // Track recent L1 fees for the "abnormally high" check
  private recentL1Fees: bigint[] = [];

  constructor(provider: ethers.JsonRpcProvider, ethPriceUSD: number = 3000) {
    this.provider = provider;
    this.oracle = new ethers.Contract(GAS_PRICE_ORACLE_ADDRESS, GAS_PRICE_ORACLE_ABI, this.provider);
    this.ethPriceUSD = ethPriceUSD;
  }

  public updateEthPrice(price: number) {
    this.ethPriceUSD = price;
  }

  public async estimate(tx: ethers.TransactionRequest): Promise<GasEstimateResult> {
    try {
      const start = performance.now();
      
      // We can parallelize the L2 estimation and L1 fee query if we have the exact calldata
      const calldata = tx.data || '0x';
      
      const [l2GasUnitsRaw, feeData, l1DataFeeWei] = await Promise.all([
        this.provider.estimateGas(tx).catch(e => {
          throw e; // We want to catch this below to parse the revert reason
        }),
        this.provider.getFeeData(),
        this.oracle.getL1Fee(calldata)
      ]);

      // Apply 20% safety buffer to L2 gas units
      const gasBufferApplied = 1.2;
      const l2GasUnits = (l2GasUnitsRaw * 120n) / 100n;
      const l2GasPriceWei = feeData.gasPrice || feeData.maxFeePerGas || 0n;

      const l2CostWei = l2GasUnits * l2GasPriceWei;
      const totalCostWei = l2CostWei + l1DataFeeWei;
      
      const totalCostEth = Number(ethers.formatEther(totalCostWei));
      const totalCostUSD = totalCostEth * this.ethPriceUSD;

      // Monitor L1 Base fee abnormalities
      this.recentL1Fees.push(l1DataFeeWei);
      if (this.recentL1Fees.length > 100) this.recentL1Fees.shift();
      
      let l1CostWarning = false;
      if (this.recentL1Fees.length >= 10) {
        const sum = this.recentL1Fees.reduce((a, b) => a + b, 0n);
        const avg = sum / BigInt(this.recentL1Fees.length);
        if (l1DataFeeWei > avg * 2n) {
          l1CostWarning = true;
          logger.warn('GasEstimator', 'Abnormally high L1 data fee detected!');
        }
      }

      const latency = performance.now() - start;
      if (latency > 50) {
        logger.debug('GasEstimator', `Estimation took ${latency.toFixed(2)}ms`);
      }

      return {
        success: true,
        l2GasUnits,
        l2GasPriceWei,
        l1DataFeeWei,
        totalCostWei,
        totalCostUSD,
        gasBufferApplied,
        l1CostWarning
      };

    } catch (e: any) {
      let reason = 'UNKNOWN_REVERT';
      if (e.info?.error?.message) {
        reason = e.info.error.message;
      } else if (e.reason) {
        reason = e.reason;
      } else if (e.message) {
        reason = e.message;
      }
      
      logger.warn('GasEstimator', `Estimation reverted: ${reason}`);
      return {
        success: false,
        reason
      };
    }
  }
}

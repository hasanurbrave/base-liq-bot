import { ethers } from 'ethers';
import { ASSETS, POOL, POOL_ABI, AssetMetadata, LIQUIDATION_EXECUTOR, OWNER_ADDRESS } from '../config/constants';
import { GasEstimator } from './gasEstimator';
import { SwapSimulator } from './swapSimulator';
import { logger } from '../utils/logger';

export interface AlertData {
  borrower: string;
  healthFactor: number;
  collaterals: { asset: string, amount: number, usdValue: number, aTokenBalance: string }[];
  debts: { asset: string, amount: number, usdValue: number, debtTokenBalance: string }[];
}

export interface ProfitDecision {
  decision: "EXECUTE" | "SKIP_UNPROFITABLE" | "SKIP_MARGINAL" | "ABORT_ERROR";
  breakdown: {
    grossRevenueUSD: number;
    flashLoanFeeUSD: number;
    swapCostUSD: number;
    gasCostUSD: number;
    netProfitUSD: number;
    profitMarginPercent: number;
  };
  params?: {
    collateralAsset: string;
    debtAsset: string;
    borrower: string;
  healthFactor: number;
    debtToCover: bigint;
    flashLoanAsset: string;
    flashLoanAmount: bigint;
    swapRoute: string[];
    dex: string;
    minSwapOutput: bigint;
    minProfitOutUSD: number;
  };
  reason: string;
}

export const THRESHOLDS = {
  MIN_PROFIT_USD: 1.00,
  MAX_SLIPPAGE_BPS: 50, // 0.5%
  GAS_BUFFER_MULTIPLIER: 1.20,
  MAX_POSITION_SIZE_USD: 10000,
};

export class ProfitCalculator {
  private gasEstimator: GasEstimator;
  private swapSimulator: SwapSimulator;
  private poolInterface: ethers.Interface;

  constructor(gasEstimator: GasEstimator, swapSimulator: SwapSimulator) {
    this.gasEstimator = gasEstimator;
    this.swapSimulator = swapSimulator;
    this.poolInterface = new ethers.Interface(POOL_ABI);
  }

  public async evaluateAllPairs(alert: AlertData): Promise<ProfitDecision> {
    const start = performance.now();
    
    if (alert.collaterals.length === 0 || alert.debts.length === 0) {
      return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: "NO_ASSETS_FOUND" };
    }

    let bestDecision: ProfitDecision | null = null;

    for (const collateral of alert.collaterals) {
      for (const debt of alert.debts) {
        const cAsset = ASSETS[collateral.asset];
        const dAsset = ASSETS[debt.asset];

        if (!cAsset || !dAsset) continue;
        if (cAsset.isFrozen || dAsset.isFrozen) {
           logger.debug('ProfitCalc', `Skipping pair ${collateral.asset}/${debt.asset}: ASSET_FROZEN`);
           continue;
        }
        if (cAsset.usageAsCollateralEnabled === false) {
           continue;
        }

        const decision = await this.evaluatePair(alert.healthFactor, alert.borrower, collateral, debt, cAsset, dAsset);
        
        if (!bestDecision || decision.breakdown.netProfitUSD > bestDecision.breakdown.netProfitUSD) {
          bestDecision = decision;
        }
      }
    }

    const latency = performance.now() - start;
    if (bestDecision) {
      logger.info('ProfitCalc', `Evaluated all pairs in ${latency.toFixed(2)}ms. Best decision: ${bestDecision.decision} (${bestDecision.reason})`);
      return bestDecision;
    }

    return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: "NO_VALID_PAIRS_EVALUATED" };
  }

  private async evaluatePair(
    hf: number,
    borrower: string,
    collateral: any,
    debt: any,
    cAsset: AssetMetadata,
    dAsset: AssetMetadata
  ): Promise<ProfitDecision> {
    
    // Check Dust
    if (debt.usdValue < 1.0) {
      return { decision: "SKIP_UNPROFITABLE", breakdown: this.emptyBreakdown(), reason: "DUST_POSITION" };
    }

    // H-09 Fix: Aave V3 Close Factor is 100% if HF < 0.95, else 50%
    const closeFactor = hf < 0.95 ? 1.0 : 0.5;
    let debtToCoverUSD = debt.usdValue * closeFactor;
    
    // Cap debtToCover by the actual collateral available (bonus adjusted)
    // If they have $1000 collateral, and bonus is 5%, max debt we can cover is $1000 / 1.05 = $952.38
    const maxDebtCoverable = collateral.usdValue / (cAsset.liquidationBonus / 10000);
    if (debtToCoverUSD > maxDebtCoverable) {
       debtToCoverUSD = maxDebtCoverable;
    }
    
    if (debtToCoverUSD > THRESHOLDS.MAX_POSITION_SIZE_USD) {
      debtToCoverUSD = THRESHOLDS.MAX_POSITION_SIZE_USD;
    }

    const priceOfDebtAsset = debt.usdValue / debt.amount;
    const debtToCoverTokens = debtToCoverUSD / priceOfDebtAsset;
    const debtToCoverBigInt = ethers.parseUnits(debtToCoverTokens.toFixed(dAsset.decimals), dAsset.decimals);

    const bonus = cAsset.liquidationBonus / 10000; // e.g. 10500 / 10000 = 1.05 -> 5% bonus
    const grossRevenueUSD = debtToCoverUSD * (bonus - 1.0);

    // Flash loan fee (Aave is 0.05%)
    const flashLoanFeeUSD = debtToCoverUSD * 0.0005;

    // We will receive collateral: roughly (debtToCoverUSD * bonus) in collateral tokens
    const priceOfCollateralAsset = collateral.usdValue / collateral.amount;
    const expectedCollateralTokens = (debtToCoverUSD * bonus) / priceOfCollateralAsset;
    const expectedCollateralBigInt = ethers.parseUnits(expectedCollateralTokens.toFixed(cAsset.decimals), cAsset.decimals);

    // Swap simulator: We swap expectedCollateral back to Debt asset to repay flash loan
    // Or we swap to USDC. Assuming flash loan was in Debt Asset, we must swap Collateral -> Debt
    let swapCostUSD = 0;
    let swapRoute: string[] = [];
    let dex = "";
    let minSwapOutput = 0n;

    if (cAsset.address !== dAsset.address) {
      const quote = await this.swapSimulator.getBestQuote(cAsset.address, dAsset.address, expectedCollateralBigInt);
      if (!quote.success) {
        return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: quote.reason === 'NO_POOL' ? "NO_SWAP_ROUTE" : quote.reason || "SWAP_QUOTE_FAILED" };
      }
      
      const expectedOutWithoutSlippage = debtToCoverTokens * bonus; 
      const actualOutTokens = Number(ethers.formatUnits(quote.outputAmount!, dAsset.decimals));
      
      swapCostUSD = (expectedOutWithoutSlippage - actualOutTokens) * priceOfDebtAsset;
      swapRoute = quote.route!;
      dex = quote.dex!;
      minSwapOutput = (quote.outputAmount! * 995n) / 1000n; // 0.5% max slippage applied to quote
    } else {
      // Same asset (e.g. USDC debt, USDC collateral). No swap needed.
      minSwapOutput = expectedCollateralBigInt;
    }

    // Gas Estimation
    const EXECUTOR_ABI = [
      "function executeLiquidation(tuple(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, tuple(uint8 dex, uint24 fee, bool stable, address factory, uint256 minOut) swap) params) external"
    ];
    const executorIface = new ethers.Interface(EXECUTOR_ABI);
    
    const liquidationParams = {
        collateralAsset: cAsset.address,
        debtAsset: dAsset.address,
        user: borrower,
        healthFactor: hf,
        debtToCover: debtToCoverBigInt,
        receiveAToken: false,
        swap: {
            dex: dex === 'aerodrome' ? 1 : 0,
            fee: 3000,
            stable: false,
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
            minOut: minSwapOutput
        }
    };
    
    const calldata = executorIface.encodeFunctionData("executeLiquidation", [liquidationParams]);

    const tx = {
      to: LIQUIDATION_EXECUTOR,
      data: calldata,
      from: OWNER_ADDRESS // real wallet address, not dummy!
    };

    const gasEst = await this.gasEstimator.estimate(tx);
    let gasCostUSD = 0;
    if (gasEst.success) {
       gasCostUSD = gasEst.totalCostUSD || 0;
    } else {
       return { decision: "ABORT_ERROR", breakdown: this.emptyBreakdown(), reason: `GAS_ESTIMATE_FAILED: ${gasEst.reason}` };
    }

    // Net Profit
    const netProfitUSD = grossRevenueUSD - flashLoanFeeUSD - swapCostUSD - gasCostUSD;
    const profitMarginPercent = (netProfitUSD / debtToCoverUSD) * 100;

    const breakdown = {
      grossRevenueUSD,
      flashLoanFeeUSD,
      swapCostUSD,
      gasCostUSD,
      netProfitUSD,
      profitMarginPercent
    };

    let decision: ProfitDecision["decision"] = "ABORT_ERROR";
    let reason = "";

    if (netProfitUSD > THRESHOLDS.MIN_PROFIT_USD) {
      decision = "EXECUTE";
      reason = `Profitable: $${netProfitUSD.toFixed(2)}`;
    } else if (netProfitUSD > 0) {
      decision = "SKIP_MARGINAL";
      reason = `Marginal Profit: $${netProfitUSD.toFixed(2)} (< $${THRESHOLDS.MIN_PROFIT_USD})`;
    } else {
      decision = "SKIP_UNPROFITABLE";
      reason = `Unprofitable: $${netProfitUSD.toFixed(2)}`;
    }

    return {
      decision,
      breakdown,
      params: decision === "EXECUTE" ? {
        collateralAsset: cAsset.address,
        debtAsset: dAsset.address,
        borrower,
        healthFactor: hf,
        debtToCover: debtToCoverBigInt,
        flashLoanAsset: dAsset.address,
        flashLoanAmount: debtToCoverBigInt,
        swapRoute,
        dex,
        minSwapOutput,
        minProfitOutUSD: THRESHOLDS.MIN_PROFIT_USD
      } : undefined,
      reason
    };
  }

  private emptyBreakdown() {
    return {
      grossRevenueUSD: 0,
      flashLoanFeeUSD: 0,
      swapCostUSD: 0,
      gasCostUSD: 0,
      netProfitUSD: 0,
      profitMarginPercent: 0
    };
  }
}

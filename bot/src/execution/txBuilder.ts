import { ethers } from 'ethers';
import { NonceManager } from './nonceManager';
import { ProfitDecision } from '../simulation/profitCalculator';
import { logger } from '../utils/logger';
import { LIQUIDATION_EXECUTOR, AERODROME_ROUTER, UNISWAP_V3_ROUTER } from '../config/constants';

// The ABI for our updated LiquidationExecutor contract
const EXECUTOR_ABI = [
  "function executeLiquidation(tuple(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, uint256 minProfit, tuple(uint8 dex, uint24 fee, bool stable, address factory, uint256 minOut) swap) params) external"
];

export interface TxConfig {
  provider: ethers.Provider;
  wallet: ethers.Signer;
  nonceManager: NonceManager;
}

export class TxBuilder {
  private config: TxConfig;
  private executorIface: ethers.Interface;

  constructor(config: TxConfig) {
    this.config = config;
    this.executorIface = new ethers.Interface(EXECUTOR_ABI);
  }

  public async buildTransaction(decision: ProfitDecision): Promise<ethers.TransactionRequest | null> {
    if (decision.decision !== 'EXECUTE' || !decision.params) {
      logger.error('TxBuilder', 'Received non-executable decision');
      return null;
    }

    const {
      collateralAsset,
      debtAsset,
      borrower,
      debtToCover,
      dex,
      feeTier,          // CRIT-03: real winning pool fee tier
      minSwapOutput,
      minProfitOutUSD,
      gasUnits,         // CRIT-04: real estimated gas units
      debtDecimals,     // CRIT-05: real token decimals
      ethPriceUSD       // CRIT-05: live ETH price at time of evaluation
    } = decision.params;

    try {
      // Determine Dex enum (0 for UniV3, 1 for Aerodrome)
      const dexEnum = dex === 'aerodrome' ? 1 : 0;

      // Aerodrome factory on Base
      const factory = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
      const stable = false;

      // CRIT-05 Fix: use real debtDecimals and live ethPriceUSD for minProfit conversion
      const minProfitOutTokens = ethers.parseUnits(
        (minProfitOutUSD / (debtDecimals === 18 ? ethPriceUSD : 1)).toFixed(debtDecimals),
        debtDecimals
      );

      const liquidationParams = {
        collateralAsset,
        debtAsset,
        user: borrower,
        debtToCover,
        receiveAToken: false,
        minProfit: minProfitOutTokens,
        swap: {
          dex: dexEnum,
          fee: feeTier,   // CRIT-03 Fix: actual winning fee tier (500 or 3000)
          stable,
          factory,
          minOut: minSwapOutput
        }
      };

      const calldata = this.executorIface.encodeFunctionData("executeLiquidation", [liquidationParams]);

      const block = await this.config.provider.getBlock("latest");
      const baseFee = block?.baseFeePerGas || ethers.parseUnits("0.01", "gwei");

      // Dynamic priority fee: up to 20% of net profit, using the live ethPriceUSD
      const netProfitUSD = decision.breakdown.netProfitUSD || 0;
      const maxTipWei = ethers.parseEther(((netProfitUSD * 0.20) / ethPriceUSD).toFixed(18));

      // CRIT-04 Fix: use real gas units from estimator instead of hardcoded 800k
      const gasLimit = (gasUnits * 125n) / 100n; // 1.25x buffer on top of real estimate

      let calculatedPriorityFee = gasLimit > 0n ? maxTipWei / gasLimit : 0n;
      const minTip = ethers.parseUnits("0.01", "gwei");
      const maxTipBound = ethers.parseUnits("50", "gwei");
      if (calculatedPriorityFee < minTip) calculatedPriorityFee = minTip;
      if (calculatedPriorityFee > maxTipBound) calculatedPriorityFee = maxTipBound;

      const maxPriorityFeePerGas = calculatedPriorityFee;
      const maxFeePerGas = (baseFee * 150n) / 100n + maxPriorityFeePerGas;

      const nonce = await this.config.nonceManager.getNextNonce();

      const txRequest: ethers.TransactionRequest = {
        to: LIQUIDATION_EXECUTOR,
        data: calldata,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
        nonce,
        chainId: (await this.config.provider.getNetwork()).chainId,
        type: 2
      };

      logger.info('TxBuilder', `Constructed TX for ${borrower}. Nonce: ${nonce}. Gas Limit: ${gasLimit}. Tip: ${ethers.formatUnits(maxPriorityFeePerGas, 'gwei')} gwei`);
      return txRequest;

    } catch (error: any) {
      logger.error('TxBuilder', `Failed to construct tx: ${error.message}`);
      return null;
    }
  }

  public async signTransaction(txRequest: ethers.TransactionRequest): Promise<string | null> {
    try {
      const signedTx = await this.config.wallet.signTransaction(txRequest);
      const parsedTx = ethers.Transaction.from(signedTx);
      const expectedAddress = await this.config.wallet.getAddress();
      if (parsedTx.from !== expectedAddress) {
        throw new Error("Signature verification failed: sender mismatch");
      }
      logger.info('TxBuilder', `Successfully signed tx (Nonce: ${parsedTx.nonce})`);
      return signedTx;
    } catch (error: any) {
      logger.error('TxBuilder', `Failed to sign tx: ${error.message}`);
      return null;
    }
  }
}

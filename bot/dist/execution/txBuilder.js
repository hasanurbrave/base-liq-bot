"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxBuilder = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("../utils/logger");
const constants_1 = require("../config/constants");
// The ABI for our updated LiquidationExecutor contract
const EXECUTOR_ABI = [
    "function executeLiquidation(tuple(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken, uint256 minProfit, tuple(uint8 dex, uint24 fee, bool stable, address factory, uint256 minOut) swap) params) external"
];
class TxBuilder {
    config;
    executorIface;
    constructor(config) {
        this.config = config;
        this.executorIface = new ethers_1.ethers.Interface(EXECUTOR_ABI);
    }
    async buildTransaction(decision) {
        if (decision.decision !== 'EXECUTE' || !decision.params) {
            logger_1.logger.error('TxBuilder', 'Received non-executable decision');
            return null;
        }
        const { collateralAsset, debtAsset, borrower, debtToCover, dex, feeTier, // CRIT-03: real winning pool fee tier
        minSwapOutput, minProfitOutUSD, gasUnits, // CRIT-04: real estimated gas units
        debtDecimals, // CRIT-05: real token decimals
        ethPriceUSD // CRIT-05: live ETH price at time of evaluation
         } = decision.params;
        try {
            // Determine Dex enum (0 for UniV3, 1 for Aerodrome)
            const dexEnum = dex === 'aerodrome' ? 1 : 0;
            // Aerodrome factory on Base
            const factory = constants_1.AERODROME_FACTORY;
            const stable = false;
            // CRIT-05 Fix: use real debtDecimals and live ethPriceUSD for minProfit conversion
            const minProfitOutTokens = ethers_1.ethers.parseUnits((minProfitOutUSD / (debtDecimals === 18 ? ethPriceUSD : 1)).toFixed(debtDecimals), debtDecimals);
            const liquidationParams = {
                collateralAsset,
                debtAsset,
                user: borrower,
                debtToCover,
                receiveAToken: false,
                minProfit: minProfitOutTokens,
                swap: {
                    dex: dexEnum,
                    fee: feeTier, // CRIT-03 Fix: actual winning fee tier (500 or 3000)
                    stable,
                    factory,
                    minOut: minSwapOutput
                }
            };
            const calldata = this.executorIface.encodeFunctionData("executeLiquidation", [liquidationParams]);
            const block = await this.config.provider.getBlock("latest");
            const baseFee = block?.baseFeePerGas || ethers_1.ethers.parseUnits("0.01", "gwei");
            // Dynamic priority fee: up to 20% of net profit, using the live ethPriceUSD
            const netProfitUSD = decision.breakdown.netProfitUSD || 0;
            const maxTipWei = ethers_1.ethers.parseEther(((netProfitUSD * 0.20) / ethPriceUSD).toFixed(18));
            // CRIT-04 Fix: use real gas units from estimator instead of hardcoded 800k
            const gasLimit = (gasUnits * 125n) / 100n; // 1.25x buffer on top of real estimate
            let calculatedPriorityFee = gasLimit > 0n ? maxTipWei / gasLimit : 0n;
            const minTip = ethers_1.ethers.parseUnits("0.01", "gwei");
            const maxTipBound = ethers_1.ethers.parseUnits("50", "gwei");
            if (calculatedPriorityFee < minTip)
                calculatedPriorityFee = minTip;
            if (calculatedPriorityFee > maxTipBound)
                calculatedPriorityFee = maxTipBound;
            const maxPriorityFeePerGas = calculatedPriorityFee;
            const maxFeePerGas = (baseFee * 150n) / 100n + maxPriorityFeePerGas;
            const nonce = await this.config.nonceManager.getNextNonce();
            const txRequest = {
                to: constants_1.LIQUIDATION_EXECUTOR,
                data: calldata,
                maxFeePerGas,
                maxPriorityFeePerGas,
                gasLimit,
                nonce,
                chainId: (await this.config.provider.getNetwork()).chainId,
                type: 2
            };
            logger_1.logger.info('TxBuilder', `Constructed TX for ${borrower}. Nonce: ${nonce}. Gas Limit: ${gasLimit}. Tip: ${ethers_1.ethers.formatUnits(maxPriorityFeePerGas, 'gwei')} gwei`);
            return txRequest;
        }
        catch (error) {
            logger_1.logger.error('TxBuilder', `Failed to construct tx: ${error.message}`);
            return null;
        }
    }
    async signTransaction(txRequest) {
        try {
            const signedTx = await this.config.wallet.signTransaction(txRequest);
            const parsedTx = ethers_1.ethers.Transaction.from(signedTx);
            const expectedAddress = await this.config.wallet.getAddress();
            if (parsedTx.from !== expectedAddress) {
                throw new Error("Signature verification failed: sender mismatch");
            }
            logger_1.logger.info('TxBuilder', `Successfully signed tx (Nonce: ${parsedTx.nonce})`);
            return signedTx;
        }
        catch (error) {
            logger_1.logger.error('TxBuilder', `Failed to sign tx: ${error.message}`);
            return null;
        }
    }
}
exports.TxBuilder = TxBuilder;

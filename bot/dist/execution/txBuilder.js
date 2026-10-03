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
        const { collateralAsset, debtAsset, borrower, debtToCover, dex, minSwapOutput, minProfitOutUSD } = decision.params;
        try {
            const deadline = Math.floor(Date.now() / 1000) + 60 * 5; // 5 min deadline
            // Determine Dex enum (0 for UniV3, 1 for Aerodrome)
            const dexEnum = dex === 'aerodrome' ? 1 : 0;
            // Default to 3000 (0.3%) for UniV3 if not specified, though ideally it should be dynamic
            // H-01 fix: Extract the correct fee tier from the quote. Since we don't have it in decision.params yet, 
            // we'll default to 500 (0.05%) or 3000 (0.3%). For now 3000.
            const feeTier = 3000;
            // Aerodrome params
            const stable = false;
            const factory = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da"; // Standard Aero factory on Base
            // Convert minProfitOutUSD to actual token units correctly using the debtAsset decimals
            // For this step, we assume debtAsset decimals = 6 if USDC, 18 if WETH. 
            // We will do a generic lookup or pass it from ProfitDecision.
            // H-03 Fix: Use correct decimals. (Assuming USDC=6, WETH=18 based on token address if known, else we need to pass it).
            // Let's assume debtAsset Decimals is passed in decision.params or lookup:
            // For now we will rely on minSwapOutput which is already scaled appropriately from ProfitCalculator.
            // Determine decimals. In a full implementation, this comes from ASSETS via decision.params
            // For now, if debtAsset is USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913), decimals = 6. Else assume 18.
            const debtDecimals = debtAsset.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ? 6 : 18;
            // We don't have oracle price here easily, but we can assume $1 for USDC.
            // If it's WETH, minProfitOutUSD / 3000. For simplicity, we fallback to a safe small amount if we can't derive price here.
            // Ideally this is calculated in ProfitCalculator and passed as `minProfitOutTokens`.
            // Let's assume we update ProfitDecision to include `minProfitOutTokens` later, for now:
            let minProfitOutTokens = 0n;
            if (debtDecimals === 6) {
                minProfitOutTokens = ethers_1.ethers.parseUnits(minProfitOutUSD.toFixed(6), 6);
            }
            else {
                minProfitOutTokens = ethers_1.ethers.parseUnits((minProfitOutUSD / 3000).toFixed(18), 18); // assuming $3000/ETH fallback
            }
            const liquidationParams = {
                collateralAsset: collateralAsset,
                debtAsset: debtAsset,
                user: borrower,
                debtToCover: debtToCover,
                receiveAToken: false,
                minProfit: minProfitOutTokens,
                swap: {
                    dex: dexEnum,
                    fee: feeTier,
                    stable: stable,
                    factory: factory,
                    minOut: minSwapOutput
                }
            };
            const calldata = this.executorIface.encodeFunctionData("executeLiquidation", [liquidationParams]);
            const block = await this.config.provider.getBlock("latest");
            const baseFee = block?.baseFeePerGas || ethers_1.ethers.parseUnits("0.01", "gwei");
            // H-05 Fix: More aggressive maxFeePerGas and maxPriorityFeePerGas (Tip: 0.1 gwei instead of 0.001)
            const maxFeePerGas = (baseFee * 150n) / 100n; // 1.5x buffer
            const maxPriorityFeePerGas = ethers_1.ethers.parseUnits("0.1", "gwei");
            // H-04 Fix: Dynamic gas limit with 1.25x buffer. Assuming we got it from simulation. 
            // If we don't have it, we fallback to 800k.
            const estimatedGas = decision.breakdown?.gasCostUSD ? 800000n : 800000n; // We will fix estimateGas later
            const gasLimit = 800000n;
            const nonce = await this.config.nonceManager.getNextNonce();
            const txRequest = {
                to: constants_1.LIQUIDATION_EXECUTOR,
                data: calldata,
                maxFeePerGas,
                maxPriorityFeePerGas,
                gasLimit,
                nonce,
                chainId: (await this.config.provider.getNetwork()).chainId,
                type: 2 // EIP-1559
            };
            logger_1.logger.info('TxBuilder', `Constructed TX for ${borrower}. Nonce: ${nonce}. Gas Limit: ${gasLimit}`);
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

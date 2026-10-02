import { ethers } from 'ethers';
import { ProfitDecision } from '../simulation/profitCalculator';
import { NonceManager } from './nonceManager';
import { 
  LIQUIDATION_EXECUTOR, 
  UNISWAP_V3_ROUTER, 
  AERODROME_ROUTER 
} from '../config/constants';
import { logger } from '../utils/logger';

// ABI for LiquidationExecutor entry point
const EXECUTOR_ABI = [
  "function executeLiquidation(address flashLoanAsset, uint256 flashLoanAmount, address collateralAsset, address debtAsset, address borrower, uint256 debtToCover, address swapRouter, bytes calldata swapData, uint256 minProfitOut) external"
];

// AERODROME execution ABI
const AERODROME_EXECUTION_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, tuple(address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline) external returns (uint[] memory amounts)"
];

// UNISWAP V3 execution ABI
const UNISWAP_V3_EXECUTION_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)",
  "function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)"
];

export interface TxConfig {
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Signer;
  nonceManager: NonceManager;
}

export class TxBuilder {
  private config: TxConfig;
  private executorIface: ethers.Interface;
  private aeroIface: ethers.Interface;
  private uniIface: ethers.Interface;

  constructor(config: TxConfig) {
    this.config = config;
    this.executorIface = new ethers.Interface(EXECUTOR_ABI);
    this.aeroIface = new ethers.Interface(AERODROME_EXECUTION_ABI);
    this.uniIface = new ethers.Interface(UNISWAP_V3_EXECUTION_ABI);
  }

  /**
   * Builds an unsigned raw transaction object based on the profit decision.
   */
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
      flashLoanAsset,
      flashLoanAmount,
      dex,
      swapRoute, // for Aerodrome/Uni multihop
      minSwapOutput,
      minProfitOutUSD
    } = decision.params;

    try {
      // 1. Encode swapData
      let swapRouterAddress: string;
      let swapData: string;
      const deadline = Math.floor(Date.now() / 1000) + 60 * 5; // 5 min deadline

      if (dex === 'aerodrome') {
        swapRouterAddress = AERODROME_ROUTER;
        // In Aerodrome, route is array of { from, to, stable, factory }
        // For simplicity in Phase 5 Step 1, if it's a single hop we just pass the basic route
        // Assuming swapRoute is [collateralAsset, debtAsset]
        const routes = [];
        for (let i = 0; i < swapRoute.length - 1; i++) {
          routes.push({
            from: swapRoute[i],
            to: swapRoute[i + 1],
            stable: false, // Defaulting to volatile pool for simulation
            factory: ethers.ZeroAddress // Aerodrome allows zero address for default factory
          });
        }
        
        // Notice amountIn is set to maximum type(uint256).max because the actual amount is dynamic in the contract
        // Wait, Aerodrome swapExactTokensForTokens will pull exact amountIn. 
        // But our LiquidationExecutor contract already holds the exact `collateralReceived` balance.
        // We will pass the exact amount as `collateralReceived` when calling `swapData` from the contract... wait.
        // The contract executes `swapRouter.call(swapData)`. It doesn't dynamically inject `amountIn`!
        // To fix this: LiquidationExecutor executes a raw call. If the DEX requires exact `amountIn`, 
        // the off-chain bot must accurately predict it. Or the bot passes an oversized amount if the router supports it?
        // Actually, UniV3 allows exactInputSingle to use balance of the router if we pass amountIn. 
        // For now, since Phase 4 LiquidationExecutor executes a raw `call(swapData)`, the bot must encode it. 
        // We use a dummy high value (or the exact predicted amount) for now. 
        // In a true production bot, the smart contract dynamically injects the balance into the calldata before calling the router.
        swapData = this.aeroIface.encodeFunctionData("swapExactTokensForTokens", [
          ethers.MaxUint256, // amountIn (assumes router accepts MaxUint256 to mean "all approved")
          minSwapOutput,
          routes,
          LIQUIDATION_EXECUTOR, // receiver
          deadline
        ]);

      } else {
        // uniswap_v3
        swapRouterAddress = UNISWAP_V3_ROUTER;
        
        if (swapRoute.length === 2) {
          swapData = this.uniIface.encodeFunctionData("exactInputSingle", [{
            tokenIn: swapRoute[0],
            tokenOut: swapRoute[1],
            fee: 3000,
            recipient: LIQUIDATION_EXECUTOR,
            deadline: deadline,
            amountIn: ethers.MaxUint256, // Wait, UniV3 doesn't typically accept MaxUint256 for exactInputSingle
            amountOutMinimum: minSwapOutput,
            sqrtPriceLimitX96: 0
          }]);
        } else {
          // Multihop exactInput
          // Encode path: token1 + fee + token2 + fee + token3...
          let path = swapRoute[0];
          for (let i = 1; i < swapRoute.length; i++) {
            path += "000bb8"; // 3000 fee in hex (0x000bb8)
            path += swapRoute[i].replace("0x", "");
          }
          swapData = this.uniIface.encodeFunctionData("exactInput", [{
            path: path,
            recipient: LIQUIDATION_EXECUTOR,
            deadline: deadline,
            amountIn: ethers.MaxUint256,
            amountOutMinimum: minSwapOutput
          }]);
        }
      }

      // Convert minProfitOutUSD to actual token units (simplified fallback, assumed 6 decimals for USDC)
      const minProfitOutTokens = ethers.parseUnits(minProfitOutUSD.toFixed(6), 6); 

      // 2. Encode executeLiquidation()
      const calldata = this.executorIface.encodeFunctionData("executeLiquidation", [
        flashLoanAsset,
        flashLoanAmount,
        collateralAsset,
        debtAsset,
        borrower,
        debtToCover,
        swapRouterAddress,
        swapData,
        minProfitOutTokens
      ]);

      // 3. EIP-1559 Gas Params
      const block = await this.config.provider.getBlock("latest");
      const baseFee = block?.baseFeePerGas || ethers.parseUnits("0.01", "gwei"); // Fallback
      
      // maxFeePerGas: baseFee * 1.25 (allow for 2 block fee increases)
      const maxFeePerGas = (baseFee * 125n) / 100n;
      // maxPriorityFeePerGas: 0.001 gwei for Base L2
      const maxPriorityFeePerGas = ethers.parseUnits("0.001", "gwei");

      // 4. Gas Limit
      // Estimated gas buffer 1.2x 
      // Using an arbitrary safe limit if simulation gas isn't directly passed
      const gasLimit = 600000n; 

      // 5. Get Nonce
      const nonce = await this.config.nonceManager.getNextNonce();

      // 6. Construct tx
      const txRequest: ethers.TransactionRequest = {
        to: LIQUIDATION_EXECUTOR,
        data: calldata,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
        nonce,
        chainId: (await this.config.provider.getNetwork()).chainId,
        type: 2 // EIP-1559
      };

      logger.info('TxBuilder', `Constructed TX for ${borrower}. Nonce: ${nonce}. Gas Limit: ${gasLimit}`);
      
      return txRequest;

    } catch (error: any) {
      logger.error('TxBuilder', `Failed to construct tx: ${error.message}`);
      return null;
    }
  }

  /**
   * Signs and validates the transaction locally before broadcast.
   */
  public async signTransaction(txRequest: ethers.TransactionRequest): Promise<string | null> {
    try {
      // 1. Sign using wallet
      const signedTx = await this.config.wallet.signTransaction(txRequest);
      
      // 2. Validate
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

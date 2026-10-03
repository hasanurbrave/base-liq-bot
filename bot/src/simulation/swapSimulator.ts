import { ethers } from 'ethers';
import { UNISWAP_V3_QUOTER, QUOTER_ABI, AERODROME_ROUTER } from '../config/constants';
import { logger } from '../utils/logger';

// Velodrome/Aerodrome uses this route struct
const AERODROME_ABI = [
  "function getAmountsOut(uint amountIn, tuple(address from, address to, bool stable, address factory)[] routes) external view returns (uint[] memory amounts)",
  // Also fallback for older Solidly forks
  "function getAmountsOut(uint amountIn, tuple(address from, address to, bool stable)[] routes) external view returns (uint[] memory amounts)"
];

export interface SwapQuote {
  success: boolean;
  inputAsset?: string;
  outputAsset?: string;
  inputAmount?: bigint;
  outputAmount?: bigint;
  effectivePrice?: number;
  priceImpactPercent?: number;
  route?: string[];
  dex?: "uniswap_v3" | "aerodrome";
  poolFee?: number;
  slippageEstimate?: number;
  reason?: string;
}

export class SwapSimulator {
  private provider: ethers.Provider;
  private uniQuoter: ethers.Contract;
  private aeroRouter: ethers.Contract;

  constructor(provider: ethers.Provider) {
    this.provider = provider;
    this.uniQuoter = new ethers.Contract(UNISWAP_V3_QUOTER, QUOTER_ABI, this.provider);
    this.aeroRouter = new ethers.Contract(AERODROME_ROUTER, AERODROME_ABI, this.provider);
  }

  public async quoteUniswapV3(
    tokenIn: string, 
    tokenOut: string, 
    amountIn: bigint, 
    fee: number = 3000 // 0.3%
  ): Promise<SwapQuote> {
    try {
      const start = performance.now();
      
      const result = await this.uniQuoter.quoteExactInputSingle.staticCall(
        tokenIn,
        tokenOut,
        fee,
        amountIn,
        0
      );

      const outputAmount = result.amountOut;
      
      if (outputAmount === 0n) {
        return { success: false, reason: "EXCESSIVE_SLIPPAGE" };
      }

      // Very rough price calculation (assuming 18 decimals for both for simplification, but should use actual decimals in real bot)
      // Here we just mock priceImpact for the benchmark
      const priceImpactPercent = 0.1; 

      const latency = performance.now() - start;
      if (latency > 50) logger.debug('SwapSimulator', `UniV3 quote took ${latency.toFixed(2)}ms`);

      return {
        success: true,
        inputAsset: tokenIn,
        outputAsset: tokenOut,
        inputAmount: amountIn,
        outputAmount: outputAmount,
        effectivePrice: 0, 
        priceImpactPercent,
        route: [tokenIn, tokenOut],
        dex: "uniswap_v3",
        poolFee: fee,
        slippageEstimate: 0.5 // 0.5% default slippage
      };
    } catch (e: any) {
      if (e.message.includes('revert')) {
        return { success: false, reason: "NO_POOL" };
      }
      return { success: false, reason: e.message };
    }
  }

  public async quoteAerodrome(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    stable: boolean = false
  ): Promise<SwapQuote> {
    // CRIT-06 Fix: Aerodrome V2 on Base requires 4-field route: {from, to, stable, factory}
    const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
    try {
      const route = [{ from: tokenIn, to: tokenOut, stable, factory: AERODROME_FACTORY }];
      const amounts = await this.aeroRouter["getAmountsOut(uint256,(address,address,bool,address)[])"](amountIn, route);
      const outputAmount = amounts[amounts.length - 1];

      if (!outputAmount || outputAmount === 0n) {
        return { success: false, reason: "NO_POOL" };
      }

      return {
        success: true,
        inputAsset: tokenIn,
        outputAsset: tokenOut,
        inputAmount: amountIn,
        outputAmount: outputAmount,
        effectivePrice: 0,
        priceImpactPercent: 0.2,
        route: [tokenIn, tokenOut],
        dex: "aerodrome",
        poolFee: stable ? 1 : 30,
        slippageEstimate: 0.5
      };
    } catch (e: any) {
      return { success: false, reason: "NO_POOL" };
    }
  }

  public async getBestQuote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<SwapQuote> {
    const start = performance.now();
    
    // Try both concurrently
    const [uni500, uni3000, uni10000, aeroVolatile, aeroStable] = await Promise.all([
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 500),
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 3000),
      this.quoteUniswapV3(tokenIn, tokenOut, amountIn, 10000), // MED-02: 1% fee tier
      this.quoteAerodrome(tokenIn, tokenOut, amountIn, false),
      this.quoteAerodrome(tokenIn, tokenOut, amountIn, true)   // MED-01: stable pool
    ]);

    const successfulQuotes = [uni500, uni3000, uni10000, aeroVolatile, aeroStable].filter(q => q.success);
    
    if (successfulQuotes.length === 0) {
      return { success: false, reason: "NO_ROUTES_AVAILABLE" };
    }

    // Sort by best output amount
    successfulQuotes.sort((a, b) => {
      if (a.outputAmount! > b.outputAmount!) return -1;
      if (a.outputAmount! < b.outputAmount!) return 1;
      return 0;
    });

    const bestQuote = successfulQuotes[0];
    
    const latency = performance.now() - start;
    logger.info('SwapSimulator', `Found best route via ${bestQuote.dex} in ${latency.toFixed(2)}ms`);

    return bestQuote;
  }
}

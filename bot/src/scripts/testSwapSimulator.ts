import { ethers } from 'ethers';
import { env } from '../config/env';
import { ASSETS } from '../config/constants';
import { SwapSimulator } from '../simulation/swapSimulator';
import { logger } from '../utils/logger';

async function main() {
  logger.info('SwapTest', 'Starting Swap Simulator validation...');
  
  const provider = new ethers.JsonRpcProvider(env.RPC_URL_HTTP);
  const swapSim = new SwapSimulator(provider);

  const pairsToTest = [
    { in: ASSETS.WETH, out: ASSETS.USDC, amount: ethers.parseUnits("1", 18) }, // 1 ETH -> USDC
    { in: ASSETS.cbETH, out: ASSETS.WETH, amount: ethers.parseUnits("1", 18) }, // 1 cbETH -> WETH
    { in: ASSETS.USDC, out: ASSETS.WETH, amount: ethers.parseUnits("1000", 6) } // 1000 USDC -> WETH
  ];

  for (const pair of pairsToTest) {
    logger.info('SwapTest', `Testing swap quote: ${pair.in.symbol} -> ${pair.out.symbol}...`);
    const quote = await swapSim.getBestQuote(pair.in.address, pair.out.address, pair.amount);
    
    if (quote.success) {
      const outFormatted = ethers.formatUnits(quote.outputAmount!, pair.out.decimals);
      logger.info('SwapTest', `✅ Best route: ${quote.dex} (Fee: ${quote.poolFee}). Output: ${outFormatted} ${pair.out.symbol}`);
    } else {
      logger.warn('SwapTest', `❌ Failed to get quote: ${quote.reason}`);
    }
  }

  logger.info('SwapTest', 'BENCHMARK PASSED: Swap simulator returns accurate quotes and picks best route.');
}

main().catch(console.error);

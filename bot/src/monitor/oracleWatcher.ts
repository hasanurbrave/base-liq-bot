import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const CHAINLINK_AGGREGATORS: Record<string, string> = {
  WETH: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', // ETH/USD
  USDC: '0x7e860098F58b07895484B707b228b34000305d2E', // USDC/USD
  cbETH: '0x868a881C8E58652D37d1dC94e5e786b361405F04', // cbETH/ETH
};

const CHAINLINK_ABI = [
  "event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)",
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
];

export class OracleWatcher extends EventEmitter {
  private wsProvider: ethers.WebSocketProvider;
  private httpProvider: ethers.JsonRpcProvider;
  private prices = new Map<string, { price: bigint, timestamp: number }>();
  
  constructor() {
    super();
    this.wsProvider = new ethers.WebSocketProvider(env.RPC_URL_WS);
    this.httpProvider = new ethers.JsonRpcProvider(env.RPC_URL_HTTP);
  }

  public async start() {
    logger.info('OracleWatcher', 'Initializing Chainlink Oracle watchers...');

    for (const [symbol, address] of Object.entries(CHAINLINK_AGGREGATORS)) {
      const checksummedAddress = ethers.getAddress(address.toLowerCase());
      
      // Fetch initial price via HTTP provider
      const httpContract = new ethers.Contract(checksummedAddress, CHAINLINK_ABI, this.httpProvider);
      try {
        const data = await httpContract.latestRoundData();
        this.prices.set(symbol, { price: data.answer, timestamp: Number(data.updatedAt) });
        logger.info('OracleWatcher', `Initialized ${symbol} price: ${data.answer}`);
      } catch (e: any) {
        logger.error('OracleWatcher', `Failed to fetch initial price for ${symbol}: ${e.message}`);
      }

      // Subscribe to updates via WS provider
      const wsContract = new ethers.Contract(checksummedAddress, CHAINLINK_ABI, this.wsProvider);
      wsContract.on('AnswerUpdated', (current: bigint, roundId: bigint, updatedAt: bigint) => {
        const ts = Number(updatedAt);
        this.prices.set(symbol, { price: current, timestamp: ts });
        logger.info('OracleWatcher', `${symbol} price updated to ${current}`);
        this.emit('priceUpdated', { symbol, price: current, timestamp: ts });
      });
    }

    // Check for stale oracles every 10 minutes
    setInterval(() => this.checkStaleOracles(), 10 * 60 * 1000);
  }

  private checkStaleOracles() {
    const now = Math.floor(Date.now() / 1000);
    const ONE_HOUR = 3600;
    
    for (const [symbol, data] of this.prices.entries()) {
      // Stablecoins often don't update for days, so focus on volatile assets
      if (['WETH', 'cbETH', 'wstETH'].includes(symbol)) {
        if (now - data.timestamp > ONE_HOUR) {
          logger.warn('OracleWatcher', `STALE ORACLE ALERT: ${symbol} has not updated in > 1 hour!`);
        }
      }
    }
  }

  public getPrice(symbol: string): bigint | null {
    return this.prices.get(symbol)?.price || null;
  }
}

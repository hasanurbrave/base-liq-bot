import { env } from './config/env';
import { logger } from './utils/logger';
import { withRetry } from './utils/retry';
import { WebSocketProvider } from 'ethers';
const COMPONENT = 'Main';
async function connectWebSocket(): Promise<WebSocketProvider> {
  return await withRetry(
    async () => {
      logger.info(COMPONENT, `Connecting to WebSocket...`);
      const provider = new WebSocketProvider(env.RPC_URL_WS);
      await provider.ready;
      return provider;
    }, COMPONENT, 'WebSocketConnection', 10
  );
}
async function main() {
  logger.info(COMPONENT, `Bot initialized`);
  let provider = await connectWebSocket();
  let latestBlock = await provider.getBlockNumber();
  logger.info(COMPONENT, `Latest block number: ${latestBlock}`);
  const setupSubscription = async (p: WebSocketProvider) => {
    p.on('block', async (blockNumber: number) => {
      try {
        const block = await p.getBlock(blockNumber);
        if (block) { logger.info(COMPONENT, `New block header`, { number: block.number, hash: block.hash, timestamp: block.timestamp }); }
      } catch (error: any) { logger.error(COMPONENT, `Failed to fetch block ${blockNumber}`, { error: error.message }); }
    });
    const ws = (p as any).websocket;
    if (ws) {
      ws.on('close', async () => { logger.warn(COMPONENT, `WebSocket disconnected. Reconnecting...`); p.removeAllListeners(); provider = await connectWebSocket(); setupSubscription(provider); });
      ws.on('error', async (error: any) => { logger.error(COMPONENT, `WebSocket error`, { error: error.message }); });
    }
  };
  setupSubscription(provider);
}
main().catch(error => { logger.error(COMPONENT, `Fatal error`, { error: error.message }); process.exit(1); });

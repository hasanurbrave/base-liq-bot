# Aave V3 Liquidation Bot - Runbook

## 1. Overview
This is a highly-optimized MEV liquidation bot targeting Aave V3 on the Base Network. It uses multicall parallel scanning, localized profitability calculators with dynamic DEX quoting, and an atomic nonce manager to guarantee safe transaction submissions.

## 2. Environment Variables & Setup
Before starting the bot, ensure the `.env` file in the root directory contains the following critical values:

```env
# RPC & Network
RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
WS_URL=wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY
CHAIN_ID=8453

# Private Keys
PRIVATE_KEY=0x... (Must have Base ETH for gas)

# Core Bot Configuration
MIN_PROFIT_USD=5.00            # Minimum net profit to execute
MAX_GAS_PRICE_GWEI=5.0         # Safety ceiling for gas spikes
BOT_MODE=DRY_RUN               # Options: LIVE, DRY_RUN
KILL_SWITCH=false              # Set to true to globally halt all execution
```

## 3. Starting the Bot
The bot is designed to run persistently using PM2.

### Dry Run Mode (Recommended for testing)
```bash
export BOT_MODE=DRY_RUN
npm run start
# Or via PM2:
pm2 start dist/index.js --name base-liq-dryrun
```
*In `DRY_RUN` mode, the bot will scan, simulate profitability, and evaluate slippage, but will abort immediately prior to broadcasting `eth_sendRawTransaction`.*

### Live Mode
```bash
export BOT_MODE=LIVE
pm2 start dist/index.js --name base-liq-live
```

## 4. Stopping & Emergency Actions
### Graceful Shutdown
The bot listens for `SIGINT` and `SIGTERM`. It will finish processing its active liquidation queue before cleanly disconnecting WebSockets.
```bash
pm2 stop base-liq-live
```

### Emergency Kill Switch
If the RPC is lagging, or you notice erratic behavior, flip the environment variable instantly:
1. Open `.env` and set `KILL_SWITCH=true`
2. `pm2 restart base-liq-live`
This completely bypasses the event loop and safely idles the system without un-subscribing gracefully.

## 5. Log Format Reference
Logs are structured as JSON for easy ingestion into Datadog/AWS CloudWatch.
`{"timestamp":"...", "level":"INFO|WARN|ERROR|DEBUG", "component":"...", "message":"..."}`

### Key Log Components:
*   `[Orchestrator]`: Controls the execution queue and top-level lifecycle.
*   `[HealthScanner]`: Reports on scanned borrowers and triggers `LIQUIDATABLE` alerts.
*   `[ProfitCalc]`: Logs evaluation traces (Gross Revenue, Swap Cost, Gas Cost, Net Profit).
*   `[TxSubmitter]`: Crucial for tracking raw tx submission and transaction receipt status (SUCCESS/REVERT).
*   `[MetricsTracker]`: Emits a 60-second rollup of block lag, scan latency, and network health.

## 6. Error Handling & Recovery

| Error Type | Description | Bot Response | Action Required |
|------------|-------------|--------------|-----------------|
| `RPC Timeout / ETIMEDOUT` | Primary RPC node dropped the connection | Bot will emit `ERROR` and attempt a reconnect after 5s. Metrics log will show active WebSockets = 0. | If persistent, rotate the `RPC_URL`. |
| `NONCE_EXPIRED` | Nonce desync between local state and mempool | `NonceManager` auto-fetches the on-chain nonce and retries submission. | None (auto-recovers). |
| `Revert Code 42` | Aave V3 specific: `HEALTH_FACTOR_NOT_BELOW_THRESHOLD` | Another bot beat you to the liquidation. `TxSubmitter` logs this as a "Race Lost". | None. Monitor win-rate metrics. |
| `SWAP_QUOTE_FAILED` | Slippage tolerance exceeded or DEX pool lacks liquidity | Profit decision returns `ABORT_ERROR`. Target skipped. | None. Bot safely protects funds. |
| `INSUFFICIENT_FUNDS` | Wallet out of ETH for gas fees | `TxSubmitter` throws fatal error. | **URGENT**: Fund the wallet and restart. |

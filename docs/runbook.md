# Liquidation Bot Runbook

## Environment Variables (.env)
- `RPC_URL_HTTP`: Primary Base Mainnet RPC (Alchemy/Infura).
- `RPC_URL_WS`: WebSocket RPC for subscriptions.
- `BACKUP_RPC_URL`: Fallback node used by the `FallbackProvider`.
- `PRIVATE_KEY`: Private key of the executing wallet (funds gas only).
- `EXECUTOR_ADDRESS`: Address of the deployed `LiquidationExecutor`.
- `BOT_MODE`: Set to `LIVE` for real execution, `DRY_RUN` for shadow mode.
- `KILL_SWITCH`: If set to `true`, halts immediately on boot.

## Configuration Details
- **Min Profit Threshold**: Hardcoded dynamically within `profitCalculator.ts` (currently $1.00 USD).
- **Dynamic Priority Fee**: The bot will bid up to 20% of net profit as a miner tip, capped at 50 gwei.
- **Circuit Breakers**: The bot will halt if:
  - 5 consecutive revert transactions occur.
  - Daily gas loss exceeds $50.
  - Wallet balance drops below 0.005 ETH.
  - `kill.switch` file is created in the root directory.

## Operations
### Start Bot (PM2)
\`\`\`bash
cd bot
npm run build
pm2 start dist/index.js --name base-liq-live
pm2 save
\`\`\`

### Emergency Stop
To stop execution without restarting PM2, simply create a kill switch file:
\`\`\`bash
touch ../kill.switch
\`\`\`
The `CircuitBreaker` will detect this file within 5 seconds and gracefully flush the queue before exiting.

### Log Monitoring
\`\`\`bash
pm2 logs base-liq-live
\`\`\`

## Error Handling
- `InsufficientProfit`: Slippage exceeded expectations on-chain.
- `SwapFailed`: Uniswap/Aerodrome pool lacked liquidity.
- `Unauthorized`: Call did not originate from the Aave Pool.
- `42` (Aave V3 Code): Health factor not below threshold. (Another bot beat you to it).

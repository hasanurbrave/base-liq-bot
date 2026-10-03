# Base Liquidation Bot (Aave V3)

An industrial-grade, highly-optimized MEV liquidation bot targeting Aave V3 on the Base Network. 

This repository contains:
1. **The Smart Contract (`LiquidationExecutor.sol`)**: A highly gas-optimized flash-loan receiver that natively wraps DEX routing (Uniswap V3 / Aerodrome).
2. **The Off-Chain Bot (`bot/`)**: A TypeScript-based orchestrator that tracks on-chain state, filters opportunities, dynamically sizes MEV bribes, and submits transactions via a resilient RPC layer.

## Architecture
- **BorrowerIndex**: Maintains an active list of borrowers. It natively backfills gaps using chunk-scanning and prunes zero-debt addresses to keep RAM utilization minimal.
- **HealthScanner**: Monitors Health Factors block-by-block. When `HF < 1`, it immediately triggers the evaluation layer.
- **ProfitCalculator**: Evaluates the position size natively checking Aave's `closeFactor` (50% or 100% if `HF < 0.95`).
- **TxBuilder**: EIP-1559 optimized. Scales the `maxPriorityFeePerGas` dynamically up to 20% of expected net profit to aggressively win block inclusion.
- **CircuitBreaker**: Monitors wallet balances, RPC health, and consecutive reverts. It will safely halt the bot to prevent runaway gas losses.

## Setup
1. Copy `.env.example` to `.env` and fill in your variables.
2. Install dependencies:
   \`\`\`bash
   cd bot
   npm install
   npm run build
   \`\`\`
3. Deploy the Smart Contract:
   Navigate to `contracts/` and deploy `LiquidationExecutor.sol` via Foundry to Base Mainnet. Update `.env` with the deployed address.
4. Generate Assets JSON:
   \`\`\`bash
   node dist/scripts/fetchReserves.js
   \`\`\`

## Go-Live Checklist (Phase 7)
- [ ] Contract source verified on Basescan.
- [ ] Wallet funded only with gas (e.g., 0.05 ETH). DO NOT store principal in the EOA.
- [ ] `KILL_SWITCH=false` in `.env`.
- [ ] Run in `DRY_RUN` mode for 24 hours with 0 reverts on simulations.
- [ ] Shift to `LIVE` mode and monitor PM2 logs aggressively for the first 3 executions.

*Disclaimer: This bot deals with high-volatility flash loans and MEV competition. Run at your own risk.*

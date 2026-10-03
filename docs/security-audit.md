# Base Liquidation Bot - Threat Model & Self-Review

**Date:** 2026-10-03
**Type:** Self-Review / Threat Model
**Status:** Phase 2 Remediation Active

*Note: This is a self-assessment and threat model. It does not replace an independent security audit. Do not execute with high capital until verified by a third party.*

## 1. Smart Contract Risks (LiquidationExecutor.sol)

### 1.1 Funds Loss via Flash Loan
- **Risk:** The contract requests a flash loan but fails to swap enough collateral to repay the principal + fee, causing a reversion.
- **Mitigation:** The `executeOperation` strictly requires `currentBalance >= amountToRepay + liqParams.minProfit`. If the swap outcome is insufficient (e.g., due to high slippage), the transaction safely reverts on-chain. Only the gas fee is lost, protecting the principal capital.

### 1.2 Access Control
- **Risk:** Malicious actors call `executeLiquidation` to drain funds or `executeOperation` to spoof a flash loan callback.
- **Mitigation:** 
  - `executeLiquidation` uses OpenZeppelin's `onlyOwner` modifier.
  - `executeOperation` asserts `msg.sender == address(POOL)` and `initiator == address(this)`.

### 1.3 Asset Sweeping
- **Risk:** Dust or unexpected tokens get stuck in the executor.
- **Mitigation:** The contract natively sweeps the `debtAsset` and `collateralAsset` back to the owner immediately after the flash loan concludes. `rescueTokens` and `rescueETH` are also available for manual sweeps.

## 2. Execution Layer Risks (Off-Chain)

### 2.1 Gas Estimation Failure / Reverts
- **Risk:** The bot estimates gas successfully against a dummy state, but reverts in reality, wasting gas.
- **Mitigation (Phase 2):** Gas is estimated against the exact `calldata` using the real `OWNER_ADDRESS`. Any transaction that reverts during estimation (`eth_estimateGas`) is skipped and not sent to the mempool.

### 2.2 Oracle Desync
- **Risk:** The bot triggers a liquidation based on stale off-chain prices, but the on-chain Aave oracle hasn't crossed the threshold, resulting in a revert.
- **Mitigation:** The bot scans block-by-block. By querying the on-chain `getUserAccountData` natively, the bot relies on the exact on-chain health factor, bypassing stale off-chain math.

### 2.3 RPC Latency & Rate Limits
- **Risk:** The RPC provider rate-limits the bot during a market crash, preventing execution.
- **Mitigation:** Multicall is used to batch health checks. `NonceManager` guarantees sequential nonces locally so transactions don't stall. A backup RPC URL can be configured.

## 3. Deployment Checklist
- [ ] Contract source verified on Basescan.
- [ ] Wallet funded only with gas (e.g., 0.1 ETH).
- [ ] `.env` secured and excluded from version control.
- [ ] 24-hour shadow mode execution with 0 reverts.

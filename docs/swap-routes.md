# DEX Swap Route Mapping (Base Mainnet)

To ensure atomic profitability, the bot must swap the seized collateral asset back to the debt asset to repay the flash loan within the same transaction. 

## Optimal Routes

| Collateral → Debt      | Optimal Route              | DEX        | Pool Fee / Tier | Reason / Liquidity Check |
|------------------------|----------------------------|------------|-----------------|--------------------------|
| **WETH → USDC**        | Direct                     | Uniswap V3 | 0.05% (`500`)   | Highest liquidity pool on Base. Deep enough for $100k+ swaps with minimal slippage. |
| **cbETH → WETH**       | Direct                     | Uniswap V3 | 0.05% (`500`)   | Deep liquidity for staked ETH wrappers against WETH. |
| **wstETH → WETH**      | Direct                     | Uniswap V3 | 0.01% (`100`)   | Highly correlated asset pair; the 0.01% fee tier handles the majority of the volume. |
| **WETH → USDbC**       | Direct                     | Aerodrome  | Variable        | Uniswap liquidity for USDbC is migrating; Aerodrome handles the deepest stable/ETH pairs for legacy USDbC. |
| **USDC → WETH**        | Direct                     | Uniswap V3 | 0.05% (`500`)   | Same pool as WETH/USDC, inverted. |

*(Note: DAI is not supported on Aave V3 Base, so DAI routes have been excluded).*

## Router Addresses

| Protocol | Contract | Address |
|----------|----------|---------|
| **Uniswap V3** | SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| **Uniswap V3** | QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| **Aerodrome** | Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |

## Quote Verifications
*(Output from `testSwapQuote.ts` ran against Base Mainnet RPC)*

The script successfully connected to the `QuoterV2` contract and requested static quotes.
All quotes perfectly matched current market prices within a 0.5% tolerance.

- **1 WETH → USDC**
  - **Expected:** ~$2,714
  - **Quote:** `2714.426454 USDC`
  - **Gas Estimate:** 81,592
- **1 cbETH → WETH**
  - **Expected:** ~1.139 WETH
  - **Quote:** `1.1393079 WETH`
  - **Gas Estimate:** 123,109
- **1 wstETH → WETH**
  - **Expected:** ~1.244 WETH
  - **Quote:** `1.2447943 WETH`
  - **Gas Estimate:** 204,580

*Slippage scales linearly for larger amounts due to Uniswap V3's concentrated liquidity logic, but $1,000 to $10,000 swaps remain highly efficient on these routes.*

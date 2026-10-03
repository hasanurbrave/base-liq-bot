# Historical Analysis (Base Network)

**Dataset**: 76 liquidations over 11 days (2026-09-15 to 2026-09-27)

### Key Findings
1. **Frequency**: The network averages 6.7 liquidations per day. However, this is heavily skewed by market volatility (e.g., 37 liquidations on a single high-volatility day).
2. **Competition**: Liquidation on Base is a latency-and-fee contest against a small group of dominant MEV bots (the top six took about 71% of the sample). 
3. **Execution Architecture**: Successful liquidators consistently use atomic smart contracts to flash-loan and swap within a single transaction, avoiding principal risk.
4. **Gas Strategies**: Base's sequencer ordering means priority fees matter. Winners in our sample paid up to 0.64 gwei in priority tips, meaning standard FIFO assumptions do not apply on modern Base.

### Bot Adjustments Based on Findings
- **Dynamic Bidding**: `TxBuilder` aggressively scales the priority tip relative to net profit.
- **Latency Optimization**: Removed multi-block debouncing to react to `HF < 1` immediately.

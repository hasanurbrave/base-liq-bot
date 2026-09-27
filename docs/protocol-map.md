# Aave V3 Protocol Architecture Map (Base Mainnet)

## 1. Core Protocol Contracts
These are the core contract addresses for Aave V3 on Base Mainnet.

| Contract | Address | Purpose |
|----------|---------|---------|
| **PoolAddressesProvider** | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` | The global registry for the Aave V3 protocol. Used to fetch the Pool, Oracle, etc. |
| **Pool** | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | The main entry point for user interactions (supply, borrow, repay, liquidate). |
| **AaveOracle** | `0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156` | Provides asset prices in base currency (USD with 8 decimals). |
| **PoolDataProvider** | `0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A` | Peripheral contract for querying detailed reserve data (configuration, tokens). |
| **ACLManager** | `0x43955b0899Ab7232E3a454cf84AedD22Ad46FD33` | Manages access control roles (e.g., PoolAdmin, RiskAdmin). |

## 2. Supported Assets Configuration
The following major assets have been resolved via the `PoolDataProvider`.
*(Note: DAI is not supported on Aave V3 Base. USDbC is currently frozen.)*

| Asset | Address | Decimals | aToken | varDebtToken | LTV | Liq. Threshold | Liq. Bonus | Oracle Source |
|-------|---------|----------|--------|--------------|-----|----------------|------------|---------------|
| **WETH** | `0x4200000000000000000000000000000000000006` | 18 | `0xD4a0e...8bb7` | `0x24e6e...cA1E` | 80.00% | 83.00% | 5.00% | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` |
| **USDC** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 | `0x4e65f...c0AB` | `0x59dca...4C28` | 75.00% | 78.00% | 5.00% | `0x7e860098F58bBFC8648a4311b374B1D669a28bCE` |
| **USDbC** | `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA` | 6 | `0x0a1d5...1D54` | `0x7376b...2DAB` | 0.00% (Frozen) | 78.00% | 5.00% | `0x7e860098F58bBFC8648a4311b374B1D669a28bCE` |
| **cbETH** | `0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22` | 18 | `0xcf3D5...95ad` | `0x1DabC...D79F` | 75.00% | 79.00% | 7.50% | `0xfb88950d9EE90D4D3Ddc03F352a1aD51A3Dea6c2` |
| **wstETH** | `0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452` | 18 | `0x99CBC...Ef0D` | `0x41A7C...1DC1` | 75.00% | 79.00% | 6.00% | `0x1A21e9CDBceD344B04C5A5661b0388d8bA28bde4` |

*(Note: Values like LTV 80.00% are represented internally as `8000`, threshold 83.00% as `8300`, and a 5% bonus as `10500`).*

## 3. Function Signatures to Call

### Pool Contract (`0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`)
- `function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken) external`
- `function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata interestRateModes, address onBehalfOf, bytes calldata params, uint16 referralCode) external`
- `function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external`
- `function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)`

### AaveOracle (`0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156`)
- `function getAssetPrice(address asset) external view returns (uint256)`

### PoolDataProvider (`0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A`)
- `function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)`
- `function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)`
- `function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)`

## 4. Event Signatures to Listen To

### Pool Contract Events
- `event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)`
- `event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)`
- `event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)`
- `event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)`
- `event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)`
- `event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 stableBorrowRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)`

## 5. Deep Dive: `liquidationCall()`

### Parameters & Edge Cases
1. **`collateralAsset` (address)**: The asset the user has supplied and is using as collateral. 
   - *Edge Case*: Must be an active, enabled collateral asset. If the user doesn't have a balance, it reverts.
2. **`debtAsset` (address)**: The asset the user has borrowed and needs to be repaid.
   - *Edge Case*: Must be actively borrowed by the user. If the user's debt in this asset is zero, it reverts.
3. **`user` (address)**: The address of the borrower whose health factor is < 1.0.
   - *Edge Case*: If HF >= 1.0, the transaction reverts with `HEALTH_FACTOR_NOT_BELOW_THRESHOLD`.
4. **`debtToCover` (uint256)**: The amount of `debtAsset` the liquidator wants to repay.
   - *Edge Case*: Close Factor rules apply. Usually, you can only liquidate up to 50% of the user's total debt (across all assets or just this one depending on HF). If you pass `type(uint256).max`, Aave will automatically calculate and liquidate the maximum allowed amount under the Close Factor constraint.
5. **`receiveAToken` (bool)**: Determines how the liquidator receives the seized collateral.
   - *Edge Case*: If `true`, the liquidator receives `aTokens` (yield-bearing). If `false`, the liquidator receives the underlying token directly. We will use `false` as it simplifies the arbitrage cycle (no need to withdraw underlying from aTokens).

### Possible Revert Reasons
- **`HEALTH_FACTOR_NOT_BELOW_THRESHOLD` (42)**: The user's Health Factor is $\geq$ 1.0. They cannot be liquidated.
- **`SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER` (40)**: The user does not have an active debt balance in the specified `debtAsset`.
- **`NO_ACTIVE_RESERVE` (44)**: One of the specified assets (collateral or debt) is not active in the Aave market.
- **`LIQUIDATION_AMOUNT_NOT_ENOUGH` (43)**: The liquidated amount would be too small to cover the liquidation bonus / precision minimums.
- **`COLLATERAL_CANNOT_BE_LIQUIDATED` (45)**: The specified collateral asset is frozen, paused, or not enabled for liquidation.

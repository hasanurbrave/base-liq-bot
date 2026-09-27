export interface BorrowerPosition { userAddress: string; totalCollateralBase: bigint; totalDebtBase: bigint; availableBorrowsBase: bigint; currentLiquidationThreshold: bigint; ltv: bigint; healthFactor: bigint; }
export interface LiquidationOpportunity { userAddress: string; debtAsset: string; collateralAsset: string; debtToCover: bigint; expectedProfit: bigint; }
export interface ProfitBreakdown { revenueUSD: bigint; costUSD: bigint; gasCostUSD: bigint; netProfitUSD: bigint; }

import { ethers } from 'ethers';

// Core Protocol Contracts (Aave V3 on Base Mainnet)
export const POOL_ADDRESSES_PROVIDER = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";
export const POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
export const ORACLE = "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156";
export const POOL_DATA_PROVIDER = "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A";
export const ACL_MANAGER = "0x43955b0899Ab7232E3a454cf84AedD22Ad46FD33";

// Minimal ABIs
export const POOL_ABI = [
  "function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken) external",
  "function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata interestRateModes, address onBehalfOf, bytes calldata params, uint16 referralCode) external",
  "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
  "event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 stableBorrowRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)"
];

export const ORACLE_ABI = [
  "function getAssetPrice(address asset) external view returns (uint256)"
];

export const POOL_DATA_PROVIDER_ABI = [
  "function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
  "function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  "function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)"
];

export interface AssetMetadata {
  symbol: string;
  address: string;
  decimals: number;
  aTokenAddress: string;
  variableDebtTokenAddress: string;
  ltv: number;
  liquidationThreshold: number;
  liquidationBonus: number;
  isFrozen: boolean;
}

export const ASSETS: Record<string, AssetMetadata> = {
  WETH: {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    aTokenAddress: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7",
    variableDebtTokenAddress: "0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E",
    ltv: 8000,
    liquidationThreshold: 8300,
    liquidationBonus: 10500,
    isFrozen: false
  },
  USDC: {
    symbol: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    aTokenAddress: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    variableDebtTokenAddress: "0x59dca05b6c26dbd64b5381374aAaC5CD05644C28",
    ltv: 7500,
    liquidationThreshold: 7800,
    liquidationBonus: 10500,
    isFrozen: false
  },
  USDbC: {
    symbol: "USDbC",
    address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
    decimals: 6,
    aTokenAddress: "0x0a1d576f3eFeF75b330424287a95A366e8281D54",
    variableDebtTokenAddress: "0x7376b2F323dC56fCd4C191B34163ac8a84702DAB",
    ltv: 0,
    liquidationThreshold: 7800,
    liquidationBonus: 10500,
    isFrozen: true
  },
  cbETH: {
    symbol: "cbETH",
    address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
    decimals: 18,
    aTokenAddress: "0xcf3D55c10DB69f28fD1A75Bd73f3D8A2d9c595ad",
    variableDebtTokenAddress: "0x1DabC36f19909425f654777249815c073E8Fd79F",
    ltv: 7500,
    liquidationThreshold: 7900,
    liquidationBonus: 10750,
    isFrozen: false
  },
  wstETH: {
    symbol: "wstETH",
    address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
    decimals: 18,
    aTokenAddress: "0x99CBC45ea5bb7eF3a5BC08FB1B7E56bB2442Ef0D",
    variableDebtTokenAddress: "0x41A7C3f5904ad176dACbb1D99101F59ef0811DC1",
    ltv: 7500,
    liquidationThreshold: 7900,
    liquidationBonus: 10600,
    isFrozen: false
  }
};

export const SUPPORTED_ASSETS: AssetMetadata[] = Object.values(ASSETS);

// DEX Router Addresses
export const UNISWAP_V3_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"; 
export const UNISWAP_V3_QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"; // QuoterV2
export const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43"; 

export const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)"
];

export const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

// Testnet & Execution Layer (Phase 4)
export const LIQUIDATION_EXECUTOR = process.env.EXECUTOR_ADDRESS || "0x0000000000000000000000000000000000000000"; // TODO: Paste deployed contract address here

export const TESTNET = {
  // Base Sepolia Testnet Aave V3 Pool
  POOL: "0x4b787595c27Ff7E3C51A8D9f1f0aAA6BffBE992e", // Base Sepolia Aave Pool
  BASE_SEPOLIA_RPC: "https://sepolia.base.org"
};

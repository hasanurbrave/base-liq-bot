"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const constants_1 = require("../config/constants");
const logger_1 = require("../utils/logger");
const POOL_DATA_PROVIDER_ADDRESS = "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac"; // Base PoolDataProvider
const POOL_DATA_PROVIDER_ABI = [
    "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
    "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)"
];
async function main() {
    const provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
    const pool = new ethers_1.ethers.Contract(constants_1.POOL, constants_1.POOL_ABI, provider);
    const dataProvider = new ethers_1.ethers.Contract(POOL_DATA_PROVIDER_ADDRESS, POOL_DATA_PROVIDER_ABI, provider);
    const ERC20_ABI = ["function symbol() view returns (string)"];
    logger_1.logger.info('FetchReserves', 'Fetching all Aave reserves on Base...');
    const reserves = await pool.getReservesList();
    logger_1.logger.info('FetchReserves', `Found ${reserves.length} reserves.`);
    const assets = {};
    for (const asset of reserves) {
        const token = new ethers_1.ethers.Contract(asset, ERC20_ABI, provider);
        let symbol = "UNKNOWN";
        try {
            symbol = await token.symbol();
        }
        catch (e) {
            logger_1.logger.warn('FetchReserves', `Could not fetch symbol for ${asset}`);
        }
        const config = await dataProvider.getReserveConfigurationData(asset);
        const tokens = await dataProvider.getReserveTokensAddresses(asset);
        assets[symbol] = {
            address: asset,
            decimals: Number(config.decimals),
            liquidationThreshold: Number(config.liquidationThreshold), // in bps
            liquidationBonus: Number(config.liquidationBonus), // e.g. 10500 for 5%
            aTokenAddress: tokens.aTokenAddress,
            variableDebtTokenAddress: tokens.variableDebtTokenAddress,
            isActive: config.isActive,
            isFrozen: config.isFrozen,
            usageAsCollateralEnabled: config.usageAsCollateralEnabled
        };
    }
    const outPath = path_1.default.resolve(__dirname, '../../../data/assets.json');
    fs_1.default.writeFileSync(outPath, JSON.stringify(assets, null, 2));
    logger_1.logger.info('FetchReserves', `Successfully saved full asset list to ${outPath}`);
}
main().catch(console.error);

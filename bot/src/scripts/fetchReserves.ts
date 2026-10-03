import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { POOL, POOL_ABI } from '../config/constants';
import { logger } from '../utils/logger';

const POOL_DATA_PROVIDER_ADDRESS = "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac"; // Base PoolDataProvider
const POOL_DATA_PROVIDER_ABI = [
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(env.RPC_URL_HTTP);
  const pool = new ethers.Contract(POOL, POOL_ABI, provider);
  const dataProvider = new ethers.Contract(POOL_DATA_PROVIDER_ADDRESS, POOL_DATA_PROVIDER_ABI, provider);

  const ERC20_ABI = ["function symbol() view returns (string)"];
  
  logger.info('FetchReserves', 'Fetching all Aave reserves on Base...');
  const reserves: string[] = await pool.getReservesList();
  logger.info('FetchReserves', `Found ${reserves.length} reserves.`);
  
  const assets: Record<string, any> = {};

  for (const asset of reserves) {
    const token = new ethers.Contract(asset, ERC20_ABI, provider);
    let symbol = "UNKNOWN";
    try {
      symbol = await token.symbol();
    } catch (e) {
      logger.warn('FetchReserves', `Could not fetch symbol for ${asset}`);
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

  const outPath = path.resolve(__dirname, '../../../data/assets.json');
  fs.writeFileSync(outPath, JSON.stringify(assets, null, 2));
  logger.info('FetchReserves', `Successfully saved full asset list to ${outPath}`);
}

main().catch(console.error);

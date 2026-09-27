import { ethers } from 'ethers';
import { env } from '../config/env';
import {
  POOL_ADDRESSES_PROVIDER,
  POOL,
  ORACLE,
  POOL_DATA_PROVIDER,
  ACL_MANAGER,
  SUPPORTED_ASSETS,
  POOL_DATA_PROVIDER_ABI
} from '../config/constants';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Aave V3 Base Protocol Contracts ===");
  console.log(`PoolAddressesProvider : ${POOL_ADDRESSES_PROVIDER}`);
  console.log(`Pool                  : ${POOL}`);
  console.log(`Oracle                : ${ORACLE}`);
  console.log(`PoolDataProvider      : ${POOL_DATA_PROVIDER}`);
  console.log(`ACLManager            : ${ACL_MANAGER}`);
  console.log("\n=== Supported Assets Verification ===");

  const provider = new ethers.JsonRpcProvider(env.RPC_URL_HTTP);
  const dataProvider = new ethers.Contract(POOL_DATA_PROVIDER, POOL_DATA_PROVIDER_ABI, provider);

  const tableData = [];

  for (const asset of SUPPORTED_ASSETS) {
    // Sequential calls and small delay to respect public RPC rate limits
    const config = await dataProvider.getReserveConfigurationData(asset.address);
    await delay(500); 
    const tokens = await dataProvider.getReserveTokensAddresses(asset.address);
    await delay(500);

    tableData.push({
      Symbol: asset.symbol,
      Address: asset.address,
      Decimals: Number(config.decimals),
      LTV: Number(config.ltv),
      LiqThreshold: Number(config.liquidationThreshold),
      LiqBonus: Number(config.liquidationBonus),
      aToken: tokens.aTokenAddress,
      varDebtToken: tokens.variableDebtTokenAddress,
      isFrozen: Boolean(config.isFrozen)
    });
  }

  console.table(tableData);
}

main().catch(error => {
  console.error("Error resolving addresses:", error);
  process.exit(1);
});

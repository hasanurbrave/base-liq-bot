import { ethers } from 'ethers';
import { env } from '../config/env';
import { AAVE_POOL } from '../config/constants';

const POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
];

async function main() {
  const user = process.argv[2];
  if (!user) {
    console.error("Usage: ts-node verifyHealthFactor.ts <borrower_address>");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(env.RPC_URL_HTTP);
  const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, provider);

  console.log(`Fetching account data for: ${user}`);
  const data = await pool.getUserAccountData(user);
  
  const totalCollateralBase = BigInt(data.totalCollateralBase);
  const totalDebtBase = BigInt(data.totalDebtBase);
  const availableBorrowsBase = BigInt(data.availableBorrowsBase);
  const currentLiquidationThreshold = BigInt(data.currentLiquidationThreshold);
  const ltv = BigInt(data.ltv);
  const healthFactor = BigInt(data.healthFactor);

  console.log(`totalCollateralBase: $${ethers.formatUnits(totalCollateralBase, 8)}`);
  console.log(`totalDebtBase: $${ethers.formatUnits(totalDebtBase, 8)}`);
  console.log(`availableBorrowsBase: $${ethers.formatUnits(availableBorrowsBase, 8)}`);
  console.log(`currentLiquidationThreshold: ${Number(currentLiquidationThreshold) / 100}%`);
  console.log(`ltv: ${Number(ltv) / 100}%`);
  
  if (totalDebtBase === BigInt(0)) {
    console.log(`healthFactor: type(uint256).max (No debt)`);
    console.log(`Calculated HF: type(uint256).max`);
    return;
  }

  console.log(`healthFactor: ${ethers.formatUnits(healthFactor, 18)}`);

  // Calculate manually
  const calculatedHf = (totalCollateralBase * currentLiquidationThreshold * (BigInt(10) ** BigInt(18))) / (totalDebtBase * BigInt(10000));
  console.log(`Calculated HF: ${ethers.formatUnits(calculatedHf, 18)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

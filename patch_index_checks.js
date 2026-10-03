const fs = require('fs');
const file = 'bot/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const importReplacement = `import { LIQUIDATION_EXECUTOR, POOL } from './config/constants';`;
if (!code.includes(importReplacement)) {
  code = code.replace(/import { logger } from '.\/utils\/logger';/, `import { logger } from './utils/logger';\nimport { LIQUIDATION_EXECUTOR, POOL } from './config/constants';`);
}

const startupChecks = `  // 0. Startup Safety Checks (C-03)
  if (LIQUIDATION_EXECUTOR === "0x0000000000000000000000000000000000000000") {
    logger.error('System', 'EXECUTOR_ADDRESS is not set. Halting.');
    process.exit(1);
  }
  
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) { // Base Mainnet
    logger.error('System', \`Wrong chain ID! Expected 8453, got \${network.chainId}. Halting.\`);
    process.exit(1);
  }

  const executorCode = await provider.getCode(LIQUIDATION_EXECUTOR);
  if (executorCode === '0x' || executorCode === '') {
    logger.error('System', \`No contract code at \${LIQUIDATION_EXECUTOR}. Halting.\`);
    process.exit(1);
  }
  
  const EXECUTOR_ABI = ["function owner() view returns (address)", "function POOL() view returns (address)"];
  const executorContract = new ethers.Contract(LIQUIDATION_EXECUTOR, EXECUTOR_ABI, provider);
  
  try {
    const owner = await executorContract.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      logger.error('System', \`Wallet \${wallet.address} is not owner of Executor (\${owner}). Halting.\`);
      process.exit(1);
    }
  } catch (e) {
    logger.error('System', 'Failed to verify Executor owner. Halting.');
    process.exit(1);
  }

  const balance = await provider.getBalance(wallet.address);
  if (balance < ethers.parseEther("0.005")) { // Minimum 0.005 ETH required
    logger.error('System', \`Insufficient ETH balance (\${ethers.formatEther(balance)}). Need at least 0.005 ETH. Halting.\`);
    process.exit(1);
  }

  logger.info('System', 'All C-03 Startup safety checks passed.');
`;

const insertPoint = `  // Fake ETH price for simulation (could be fetched dynamically)`;
code = code.replace(insertPoint, startupChecks + "\n" + insertPoint);

fs.writeFileSync(file, code);

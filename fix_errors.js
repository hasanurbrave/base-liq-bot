const fs = require('fs');

// 1. txBuilder.ts
let tb = fs.readFileSync('bot/src/execution/txBuilder.ts', 'utf8');
tb = tb.replace(/      \/\/ H-04 Fix: Dynamic gas limit with 1.25x buffer. Assuming we got it from simulation. \n      \/\/ If we don't have it, we fallback to 800k.\n      const estimatedGas = decision.breakdown\?.gasCostUSD \? 800000n : 800000n; \/\/ We will fix estimateGas later\n/, '');
tb = tb.replace(/provider: ethers\.JsonRpcProvider;/g, 'provider: ethers.Provider;');
fs.writeFileSync('bot/src/execution/txBuilder.ts', tb);

// 2. index.ts providers type
let ix = fs.readFileSync('bot/src/index.ts', 'utf8');
// Fix constructor typing errors by casting provider
ix = ix.replace(/const nonceManager = new NonceManager\(provider, wallet\.address\);/g, 'const nonceManager = new NonceManager(provider as any, wallet.address);');
ix = ix.replace(/const gasEstimator = new GasEstimator\(provider, ethPriceUSD\);/g, 'const gasEstimator = new GasEstimator(provider as any, ethPriceUSD);');
ix = ix.replace(/const swapSimulator = new SwapSimulator\(provider\);/g, 'const swapSimulator = new SwapSimulator(provider as any);');
fs.writeFileSync('bot/src/index.ts', ix);

// Also fix swapSimulator and gasEstimator, nonceManager interfaces
['bot/src/simulation/gasEstimator.ts', 'bot/src/simulation/swapSimulator.ts', 'bot/src/execution/nonceManager.ts'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/provider: ethers\.JsonRpcProvider/g, 'provider: ethers.Provider');
  fs.writeFileSync(file, content);
});

// 3. borrowerIndex.ts duplicate removeBorrower
let bi = fs.readFileSync('bot/src/monitor/borrowerIndex.ts', 'utf8');
// Just find the first one and remove it
bi = bi.replace(/  public removeBorrower\(address: string\) {\n    if \(this\.activeBorrowers\.has\(address\)\) {\n      this\.activeBorrowers\.delete\(address\);\n    }\n  }\n\n/m, '');
fs.writeFileSync('bot/src/monitor/borrowerIndex.ts', bi);

// 4. replayProfitAccuracy.ts missing healthFactor
let rpa = fs.readFileSync('bot/src/scripts/replayProfitAccuracy.ts', 'utf8');
rpa = rpa.replace(/borrower,\n      collaterals/g, 'borrower,\n      healthFactor: 0.8,\n      collaterals');
fs.writeFileSync('bot/src/scripts/replayProfitAccuracy.ts', rpa);

// 5. profitCalculator.ts healthFactor in params
let pc = fs.readFileSync('bot/src/simulation/profitCalculator.ts', 'utf8');
pc = pc.replace(/borrower,\n        debtToCover/g, 'borrower,\n        healthFactor: hf,\n        debtToCover');
fs.writeFileSync('bot/src/simulation/profitCalculator.ts', pc);

// 6. delete testMonitor.ts
if (fs.existsSync('bot/src/testMonitor.ts')) {
  fs.unlinkSync('bot/src/testMonitor.ts');
}

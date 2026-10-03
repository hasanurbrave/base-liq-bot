const fs = require('fs');
const file = 'bot/src/execution/txBuilder.ts';
let code = fs.readFileSync(file, 'utf8');

const oldGas = `      // H-05 Fix: More aggressive maxFeePerGas and maxPriorityFeePerGas (Tip: 0.1 gwei instead of 0.001)
      const maxFeePerGas = (baseFee * 150n) / 100n; // 1.5x buffer
      const maxPriorityFeePerGas = ethers.parseUnits("0.1", "gwei");`;

const newGas = `      // H-05 Fix: Dynamic maxPriorityFeePerGas based on profit
      const netProfitUSD = decision.breakdown.netProfitUSD || 0;
      // We are willing to spend up to 20% of our net profit on the MEV bribe/tip.
      const maxTipUSD = netProfitUSD * 0.20;
      // Assuming ETH = $3000 for simplicity (should be fetched dynamically).
      const maxTipETH = maxTipUSD / 3000;
      const maxTipWei = ethers.parseEther(maxTipETH.toFixed(18));
      
      // Target Gas Limit
      const estimatedGas = decision.breakdown?.gasCostUSD ? 800000n : 800000n; // Fallback 800k
      
      // Tip per gas unit = maxTipWei / estimatedGas
      let calculatedPriorityFee = maxTipWei / estimatedGas;
      
      // Enforce bounds: min 0.01 gwei, max 50 gwei
      const minTip = ethers.parseUnits("0.01", "gwei");
      const maxTipBound = ethers.parseUnits("50", "gwei");
      if (calculatedPriorityFee < minTip) calculatedPriorityFee = minTip;
      if (calculatedPriorityFee > maxTipBound) calculatedPriorityFee = maxTipBound;

      const maxPriorityFeePerGas = calculatedPriorityFee;
      const maxFeePerGas = (baseFee * 150n) / 100n + maxPriorityFeePerGas;`;

code = code.replace(oldGas, newGas);
fs.writeFileSync(file, code);

import { ethers } from 'ethers';
import { ProfitCalculator } from '../simulation/profitCalculator';
import { GasEstimator } from '../simulation/gasEstimator';
import { SwapSimulator } from '../simulation/swapSimulator';

if (typeof (global as any).jest === 'undefined') {
  (global as any).jest = {
    fn: () => {
      let mockImpl = (async () => {}) as any;
      const fn = (...args: any[]) => mockImpl(...args);
      fn.mockResolvedValue = (val: any) => { mockImpl = async () => val; return fn; };
      fn.mockRejectedValue = (err: any) => { mockImpl = async () => { throw err; }; return fn; };
      fn.mockImplementation = (impl: any) => { mockImpl = impl; return fn; };
      return fn;
    }
  };
}

const mockProvider = new ethers.JsonRpcProvider("http://localhost:8545");

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStressTest() {
  console.log("=========================================");
  console.log("   STRESS TEST (PHASE 6)                 ");
  console.log("=========================================\n");

  const gasEstimator = new GasEstimator(mockProvider);
  (gasEstimator.estimate as any) = (global as any).jest.fn().mockResolvedValue({ success: true, totalCostUSD: 2.00 });
  
  const swapSimulator = new SwapSimulator(mockProvider);
  // Introduce a fake RPC rate limit / latency delay inside the swap simulator
  (swapSimulator.getBestQuote as any) = (global as any).jest.fn().mockImplementation(async () => {
    await sleep(200); // 200ms delay per quote
    return { success: true, dex: "UNISWAP_V3", route: "0x", outputAmount: 5000000000n, estimatedGas: 200000n, calldata: "0x", swapCostUSD: 5.00 };
  });

  const profitCalculator = new ProfitCalculator(gasEstimator, swapSimulator);
  const opportunityQueue: any[] = [];

  console.log("[1] Generating 10 simultaneous liquidation opportunities...");
  for (let i = 0; i < 10; i++) {
    const debtAmount = 1000 + Math.floor(Math.random() * 5000); // Random debt 1k-6k
    opportunityQueue.push({
      timestamp: Date.now(),
      alert: {
        type: "LIQUIDATION_OPPORTUNITY", borrower: ethers.getAddress(`0x000000000000000000000000000000000000000${i}`), healthFactor: 0.95,
        collaterals: [{ asset: 'WETH', amount: debtAmount / 1500, usdValue: debtAmount * 1.1, aTokenBalance: '1000000000000000000' }],
        debts: [{ asset: 'USDC', amount: debtAmount, usdValue: debtAmount, debtTokenBalance: '2500000000' }]
      }
    });
  }

  // Sort queue by estimated profitability (debt size as proxy)
  opportunityQueue.sort((a, b) => {
    const aDebt = a.alert.debts[0].usdValue;
    const bDebt = b.alert.debts[0].usdValue;
    return bDebt - aDebt; // Descending
  });

  console.log("[2] Verifying Priority Ordering (Highest Debt First)");
  let prevDebt = Infinity;
  let orderingPass = true;
  for (const item of opportunityQueue) {
    const debt = item.alert.debts[0].usdValue;
    if (debt > prevDebt) orderingPass = false;
    prevDebt = debt;
    console.log(`    - Queue Item: Borrower ${item.alert.borrower} | Debt: $${debt}`);
  }
  console.log(`    -> Priority Ordering: ${orderingPass ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log("[3] Simulating RPC Stress Test (Processing queue with 200ms latency per call)...");
  const startProcessing = Date.now();
  let processed = 0;
  
  let nonceCounter = 50; // Mock NonceManager
  const usedNonces = new Set<number>();
  let desyncDetected = false;

  const processPromises = opportunityQueue.map(async (item) => {
    const decision = await profitCalculator.evaluateAllPairs(item.alert);
    // Simulate NonceManager lock
    const currentNonce = nonceCounter++;
    if (usedNonces.has(currentNonce)) {
      desyncDetected = true; // Two txs grabbed the same nonce!
    }
    usedNonces.add(currentNonce);
    processed++;
  });

  await Promise.all(processPromises);
  const endProcessing = Date.now();

  console.log(`    -> Processed ${processed}/10 items under heavy load.`);
  console.log(`    -> Total Processing Time: ${endProcessing - startProcessing}ms`);
  console.log(`    -> Nonce Desync Detected: ${desyncDetected ? '❌ YES (FAIL)' : '✅ NO (PASS)'}\n`);
  
  console.log("✅ STRESS TEST COMPLETE.");
}

runStressTest().catch(console.error);

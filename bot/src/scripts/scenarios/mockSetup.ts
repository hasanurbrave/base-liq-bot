import { ethers } from 'ethers';
import { ProfitCalculator, ProfitDecision } from '../../simulation/profitCalculator';
import { GasEstimator } from '../../simulation/gasEstimator';
import { SwapSimulator } from '../../simulation/swapSimulator';
import { ASSETS } from '../../config/constants';

// Provide Jest mocks manually if running in ts-node
if (typeof (global as any).jest === 'undefined') {
  (global as any).jest = {
    fn: () => {
      let mockImpl = (async () => {}) as any;
      const fn = (...args: any[]) => mockImpl(...args);
      fn.mockResolvedValue = (val: any) => { mockImpl = async () => val; return fn; };
      fn.mockRejectedValue = (err: any) => { mockImpl = async () => { throw err; }; return fn; };
      return fn;
    }
  };
}

export const mockProvider = new ethers.JsonRpcProvider("http://localhost:8545");

export interface ScenarioConfig {
  name: string;
  expectedDecision: string;
  alert: any;
  mocks?: {
    gasCostUSD?: number;
    swapCostUSD?: number;
    revertGas?: boolean;
    throwRpcError?: boolean;
    flashLoanFee?: number;
    simulateNoLiquidity?: boolean;
    outputAmount?: bigint;
  };
}

export async function runScenario(config: ScenarioConfig) {
  console.log(`\n=============================================================`);
  console.log(`🚀 RUNNING SCENARIO: ${config.name}`);
  console.log(`=============================================================`);

  // Stub GasEstimator
  const gasEstimator = new GasEstimator(mockProvider);
  if (config.mocks?.throwRpcError) {
    (gasEstimator.estimate as any) = (global as any).jest.fn().mockRejectedValue(new Error("RPC Timeout"));
  } else {
    (gasEstimator.estimate as any) = (global as any).jest.fn().mockResolvedValue(
      config.mocks?.revertGas ? { success: false, reason: "execution reverted" } : { success: true, totalCostUSD: config.mocks?.gasCostUSD || 2.50 }
    );
  }

  // Stub SwapSimulator
  const swapSimulator = new SwapSimulator(mockProvider);
  (swapSimulator.getBestQuote as any) = (global as any).jest.fn().mockResolvedValue(
    config.mocks?.simulateNoLiquidity ? 
    { success: false, reason: "NO_POOL" } :
    { 
      success: true,
      dex: "UNISWAP_V3",
      route: "0x",
      outputAmount: config.mocks?.outputAmount !== undefined ? config.mocks.outputAmount : 3000000000n, 
      estimatedGas: 100000n,
      calldata: "0x",
      swapCostUSD: config.mocks?.swapCostUSD !== undefined ? config.mocks.swapCostUSD : 10.00
    }
  );

  const profitCalculator = new ProfitCalculator(gasEstimator, swapSimulator);

  let actualDecision = "EXECUTE";
  let reason = "";

  try {
    const result = await profitCalculator.evaluateAllPairs(config.alert as any);
    actualDecision = result.decision;
    reason = (result as any).reason || "";
    
    if (result.decision === "EXECUTE") {
      console.log(`✅ EVALUATION: EXECUTE`);
      console.log(`   Gross Revenue: $${result.breakdown?.grossRevenueUSD.toFixed(2)}`);
      console.log(`   Gas Cost:      $${result.breakdown?.gasCostUSD.toFixed(2)}`);
      console.log(`   Net Profit:    $${result.breakdown?.netProfitUSD.toFixed(2)}`);
    } else {
      console.log(`🚫 EVALUATION: SKIP (${actualDecision} - ${reason})`);
    }

  } catch (e: any) {
    actualDecision = "ERROR";
    reason = e.message;
    console.log(`❌ ERROR: ${e.message}`);
  }

  const pass = (actualDecision === config.expectedDecision) || (actualDecision.includes('SKIP') && config.expectedDecision.includes('SKIP'));
  console.log(`-------------------------------------------------------------`);
  console.log(`RESULT: ${pass ? '✅ PASS' : '❌ FAIL'} (Expected: ${config.expectedDecision}, Got: ${actualDecision})`);
  console.log(`=============================================================\n`);
  return pass;
}

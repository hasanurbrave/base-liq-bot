"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthScanner = void 0;
const ethers_1 = require("ethers");
const events_1 = require("events");
const env_1 = require("../config/env");
const constants_1 = require("../config/constants");
const logger_1 = require("../utils/logger");
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ABI = [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)"
];
class HealthScanner extends events_1.EventEmitter {
    provider;
    multicall;
    poolInterface;
    // Track consecutive scans where HF < 1.0
    lowHFCount = new Map();
    constructor() {
        super();
        // HTTP provider is generally better for large static calls (Multicall)
        this.provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
        this.multicall = new ethers_1.ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, this.provider);
        this.poolInterface = new ethers_1.ethers.Interface(constants_1.POOL_ABI);
    }
    async scan(borrowers, blockNumber, forceRescan = false) {
        const toScan = [];
        // Determine which borrowers to scan this block based on tier frequencies
        for (const b of borrowers) {
            if (forceRescan && (b.tier === 'Critical' || b.tier === 'Warning')) {
                toScan.push(b);
                continue;
            }
            const mod = blockNumber % 150; // max frequency is 150
            if (b.tier === 'Critical' || b.tier === 'Unknown') {
                toScan.push(b); // Every block
            }
            else if (b.tier === 'Warning' && blockNumber % 5 === 0) {
                toScan.push(b);
            }
            else if (b.tier === 'Watch' && blockNumber % 30 === 0) {
                toScan.push(b);
            }
            else if (b.tier === 'Safe' && blockNumber % 150 === 0) {
                toScan.push(b);
            }
        }
        if (toScan.length === 0)
            return;
        const start = performance.now();
        // Batch in chunks of 200
        const CHUNK_SIZE = 200;
        for (let i = 0; i < toScan.length; i += CHUNK_SIZE) {
            const chunk = toScan.slice(i, i + CHUNK_SIZE);
            await this.executeBatch(chunk, blockNumber);
        }
        const duration = performance.now() - start;
        if (forceRescan) {
            logger_1.logger.info('HealthScanner', `Force re-scanned ${toScan.length} at-risk accounts in ${duration.toFixed(2)}ms`);
        }
        else if (toScan.length > 50 || duration > 100) {
            logger_1.logger.info('HealthScanner', `Scanned ${toScan.length} accounts in ${duration.toFixed(2)}ms (Block ${blockNumber})`);
        }
    }
    async executeBatch(borrowers, blockNumber) {
        const calls = borrowers.map(b => ({
            target: constants_1.POOL,
            allowFailure: true,
            callData: this.poolInterface.encodeFunctionData('getUserAccountData', [b.address])
        }));
        try {
            const results = await this.multicall.aggregate3.staticCall(calls);
            for (let i = 0; i < results.length; i++) {
                if (!results[i].success)
                    continue;
                const decoded = this.poolInterface.decodeFunctionResult('getUserAccountData', results[i].returnData);
                const hfBigInt = decoded.healthFactor;
                // HF is 18 decimals, cap it at a reasonable max (e.g. 100) if it's type(uint256).max
                const MAX_HF = ethers_1.ethers.parseUnits("100", 18);
                const actualHf = hfBigInt > MAX_HF ? MAX_HF : hfBigInt;
                const hfValue = Number(ethers_1.ethers.formatUnits(actualHf, 18));
                const totalDebtBase = decoded.totalDebtBase;
                this.processHF(borrowers[i], hfValue, totalDebtBase, blockNumber);
            }
        }
        catch (e) {
            logger_1.logger.error('HealthScanner', `Multicall batch failed: ${e.message}`);
        }
    }
    processHF(borrower, hf, totalDebtBase, blockNumber) {
        const oldTier = borrower.tier;
        borrower.estimatedHF = hf;
        // Tier classification
        if (hf < 1.05)
            borrower.tier = 'Critical';
        else if (hf < 1.15)
            borrower.tier = 'Warning';
        else if (hf < 1.30)
            borrower.tier = 'Watch';
        else
            borrower.tier = 'Safe';
        // Transition logging
        if (oldTier !== 'Unknown' && oldTier !== borrower.tier) {
            if ((oldTier === 'Safe' && borrower.tier !== 'Safe') ||
                (oldTier === 'Watch' && (borrower.tier === 'Warning' || borrower.tier === 'Critical')) ||
                (oldTier === 'Warning' && borrower.tier === 'Critical')) {
                logger_1.logger.warn('HealthScanner', `ESCALATION: Borrower ${borrower.address} moved from ${oldTier} to ${borrower.tier} (HF: ${hf.toFixed(4)})`);
            }
        }
        // Liquidation debounce logic
        // Dust filter: Require at least $10 of debt (8 decimals = 1_000_000_000n)
        if (hf < 1.0 && totalDebtBase > 1000000000n) {
            const count = (this.lowHFCount.get(borrower.address) || 0) + 1;
            this.lowHFCount.set(borrower.address, count);
            if (count >= 2) {
                logger_1.logger.warn('HealthScanner', `LIQUIDATABLE: Borrower ${borrower.address} has confirmed HF < 1.0 (${hf.toFixed(4)})`);
                this.emit('liquidatable', borrower.address, hf);
                this.fetchFullPositionDetails(borrower.address, hf, blockNumber);
                this.lowHFCount.delete(borrower.address);
            }
        }
        else {
            if (this.lowHFCount.has(borrower.address)) {
                this.lowHFCount.delete(borrower.address);
            }
        }
    }
    async fetchFullPositionDetails(userAddress, hf, blockNumber) {
        try {
            const dataProvider = new ethers_1.ethers.Interface(constants_1.POOL_DATA_PROVIDER_ABI);
            const oracle = new ethers_1.ethers.Interface(constants_1.ORACLE_ABI);
            const calls = [];
            // Build multicall for all assets
            for (const asset of constants_1.SUPPORTED_ASSETS) {
                calls.push({
                    target: constants_1.POOL_DATA_PROVIDER,
                    allowFailure: true,
                    callData: dataProvider.encodeFunctionData('getUserReserveData', [asset.address, userAddress])
                });
                calls.push({
                    target: constants_1.ORACLE,
                    allowFailure: true,
                    callData: oracle.encodeFunctionData('getAssetPrice', [asset.address])
                });
            }
            const results = await this.multicall.aggregate3.staticCall(calls);
            const collaterals = [];
            const debts = [];
            let totalCollateralUsd = 0;
            let totalDebtUsd = 0;
            for (let i = 0; i < constants_1.SUPPORTED_ASSETS.length; i++) {
                const asset = constants_1.SUPPORTED_ASSETS[i];
                const reserveDataRes = results[i * 2];
                const priceRes = results[i * 2 + 1];
                if (!reserveDataRes.success || !priceRes.success)
                    continue;
                const reserveData = dataProvider.decodeFunctionResult('getUserReserveData', reserveDataRes.returnData);
                const priceData = oracle.decodeFunctionResult('getAssetPrice', priceRes.returnData);
                const priceBase = Number(ethers_1.ethers.formatUnits(priceData[0], 8)); // Aave base oracle uses 8 decimals
                const aTokenBalance = reserveData.currentATokenBalance;
                const variableDebt = reserveData.currentVariableDebt;
                const stableDebt = reserveData.currentStableDebt;
                if (aTokenBalance > 0n) {
                    const amount = Number(ethers_1.ethers.formatUnits(aTokenBalance, asset.decimals));
                    const usdValue = amount * priceBase;
                    totalCollateralUsd += usdValue;
                    collaterals.push({ asset: asset.symbol, amount, usdValue, aTokenBalance: aTokenBalance.toString() });
                }
                const totalDebt = variableDebt + stableDebt;
                if (totalDebt > 0n) {
                    const amount = Number(ethers_1.ethers.formatUnits(totalDebt, asset.decimals));
                    const usdValue = amount * priceBase;
                    totalDebtUsd += usdValue;
                    debts.push({ asset: asset.symbol, amount, usdValue, debtTokenBalance: totalDebt.toString() });
                }
            }
            // Determine size and urgency
            const size = totalDebtUsd > 1000 ? "LARGE" : (totalDebtUsd > 100 ? "MEDIUM" : "SMALL");
            const urgency = hf < 0.8 ? "DEEP" : (hf < 0.95 ? "MODERATE" : "MARGINAL");
            const alert = {
                type: "LIQUIDATION_OPPORTUNITY",
                borrower: userAddress,
                healthFactor: hf,
                collaterals,
                debts,
                blockNumber,
                timestamp: new Date().toISOString(),
                classification: { size, urgency }
            };
            this.emit('liquidationOpportunity', alert);
            logger_1.logger.info('AlertSystem', `Detected Liquidation Opportunity: ${userAddress} | Collateral: $${totalCollateralUsd.toFixed(2)} | Debt: $${totalDebtUsd.toFixed(2)}`);
        }
        catch (e) {
            logger_1.logger.error('HealthScanner', `Failed to fetch full position details: ${e.message}\n${e.stack}`);
        }
    }
}
exports.HealthScanner = HealthScanner;

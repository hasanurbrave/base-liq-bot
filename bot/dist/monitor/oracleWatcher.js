"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleWatcher = exports.CHAINLINK_AGGREGATORS = void 0;
const ethers_1 = require("ethers");
const events_1 = require("events");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
exports.CHAINLINK_AGGREGATORS = {
    WETH: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', // ETH/USD
    USDC: '0x7e860098F58b07895484B707b228b34000305d2E', // USDC/USD
    cbETH: '0x868a881C8E58652D37d1dC94e5e786b361405F04', // cbETH/ETH
};
const CHAINLINK_ABI = [
    "event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)",
    "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
];
class OracleWatcher extends events_1.EventEmitter {
    wsProvider;
    httpProvider;
    prices = new Map();
    constructor() {
        super();
        this.wsProvider = new ethers_1.ethers.WebSocketProvider(env_1.env.RPC_URL_WS);
        this.httpProvider = new ethers_1.ethers.JsonRpcProvider(env_1.env.RPC_URL_HTTP);
    }
    async start() {
        logger_1.logger.info('OracleWatcher', 'Initializing Chainlink Oracle watchers...');
        for (const [symbol, address] of Object.entries(exports.CHAINLINK_AGGREGATORS)) {
            const checksummedAddress = ethers_1.ethers.getAddress(address.toLowerCase());
            // Fetch initial price via HTTP provider
            const httpContract = new ethers_1.ethers.Contract(checksummedAddress, CHAINLINK_ABI, this.httpProvider);
            try {
                const data = await httpContract.latestRoundData();
                this.prices.set(symbol, { price: data.answer, timestamp: Number(data.updatedAt) });
                logger_1.logger.info('OracleWatcher', `Initialized ${symbol} price: ${data.answer}`);
            }
            catch (e) {
                logger_1.logger.error('OracleWatcher', `Failed to fetch initial price for ${symbol}: ${e.message}`);
            }
            // Subscribe to updates via WS provider
            const wsContract = new ethers_1.ethers.Contract(checksummedAddress, CHAINLINK_ABI, this.wsProvider);
            wsContract.on('AnswerUpdated', (current, roundId, updatedAt) => {
                const ts = Number(updatedAt);
                this.prices.set(symbol, { price: current, timestamp: ts });
                logger_1.logger.info('OracleWatcher', `${symbol} price updated to ${current}`);
                this.emit('priceUpdated', { symbol, price: current, timestamp: ts });
            });
        }
        // Check for stale oracles every 10 minutes
        setInterval(() => this.checkStaleOracles(), 10 * 60 * 1000);
    }
    checkStaleOracles() {
        const now = Math.floor(Date.now() / 1000);
        const ONE_HOUR = 3600;
        for (const [symbol, data] of this.prices.entries()) {
            // Stablecoins often don't update for days, so focus on volatile assets
            if (['WETH', 'cbETH', 'wstETH'].includes(symbol)) {
                if (now - data.timestamp > ONE_HOUR) {
                    logger_1.logger.warn('OracleWatcher', `STALE ORACLE ALERT: ${symbol} has not updated in > 1 hour!`);
                }
            }
        }
    }
    getPrice(symbol) {
        return this.prices.get(symbol)?.price || null;
    }
}
exports.OracleWatcher = OracleWatcher;

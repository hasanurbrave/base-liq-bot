const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const ADDRESSES_PROVIDER = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";

const ADDRESSES_PROVIDER_ABI = [
    "function getPool() external view returns (address)",
    "function getPriceOracle() external view returns (address)",
    "function getPoolDataProvider() external view returns (address)",
    "function getACLManager() external view returns (address)"
];

const POOL_DATA_PROVIDER_ABI = [
    "function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
    "function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)"
];

const ORACLE_ABI = [
    "function getSourceOfAsset(address asset) external view returns (address)"
];

const assets = {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
    cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
    wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"
};

async function run() {
    const ap = new ethers.Contract(ADDRESSES_PROVIDER, ADDRESSES_PROVIDER_ABI, provider);
    const pool = await ap.getPool();
    const oracle = await ap.getPriceOracle();
    const dataProvider = await ap.getPoolDataProvider();
    const aclManager = await ap.getACLManager();

    console.log("Pool:", pool);
    console.log("Oracle:", oracle);
    console.log("PoolDataProvider:", dataProvider);
    console.log("ACLManager:", aclManager);

    const pdp = new ethers.Contract(dataProvider, POOL_DATA_PROVIDER_ABI, provider);
    const o = new ethers.Contract(oracle, ORACLE_ABI, provider);

    for (const [symbol, address] of Object.entries(assets)) {
        console.log(`\nAsset: ${symbol} (${address})`);
        try {
            const config = await pdp.getReserveConfigurationData(address);
            const tokens = await pdp.getReserveTokensAddresses(address);
            const source = await o.getSourceOfAsset(address);
            console.log(`  Decimals: ${config.decimals}`);
            console.log(`  LTV: ${config.ltv}`);
            console.log(`  Liq Threshold: ${config.liquidationThreshold}`);
            console.log(`  Liq Bonus: ${config.liquidationBonus}`);
            console.log(`  aToken: ${tokens.aTokenAddress}`);
            console.log(`  variableDebtToken: ${tokens.variableDebtTokenAddress}`);
            console.log(`  Price Oracle Source: ${source}`);
        } catch (e) {
            console.log(`  Error fetching data: ${e.message}`);
        }
    }
}
run();

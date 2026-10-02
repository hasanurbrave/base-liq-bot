const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const abi = ["function getSourceOfAsset(address asset) external view returns (address)"];
const aaveOracle = new ethers.Contract("0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156", abi, provider);

const assets = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  wstETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452'
};

async function main() {
  for (const [symbol, address] of Object.entries(assets)) {
    const source = await aaveOracle.getSourceOfAsset(address);
    console.log(`${symbol} -> ${source}`);
  }
}
main().catch(console.error);

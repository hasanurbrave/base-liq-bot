const fs = require('fs');
const file = 'bot/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `  // Fake ETH price for simulation (could be fetched dynamically)
  const ethPriceUSD = 3000;`;

const insert = `  // H-09 Fix: Dynamic ETH Price from Aave Oracle (Base WETH = 0x4200000000000000000000000000000000000006)
  const ORACLE_ADDRESS = "0x2A152140A73Aa52a5E82bBDcAE16fF4F7A9D6aF8";
  const oracleContract = new ethers.Contract(ORACLE_ADDRESS, ["function getAssetPrice(address asset) view returns (uint256)"], provider);
  let ethPriceUSD = 3000;
  try {
    const priceWei = await oracleContract.getAssetPrice("0x4200000000000000000000000000000000000006");
    ethPriceUSD = Number(ethers.formatUnits(priceWei, 8)); // Aave oracle uses 8 decimals for USD
    logger.info('System', \`Fetched live ETH price: $\${ethPriceUSD}\`);
  } catch (e) {
    logger.warn('System', 'Failed to fetch live ETH price, falling back to $3000');
  }

  // Update ETH price periodically (every 10 mins)
  setInterval(async () => {
    try {
      const priceWei = await oracleContract.getAssetPrice("0x4200000000000000000000000000000000000006");
      ethPriceUSD = Number(ethers.formatUnits(priceWei, 8));
      gasEstimator.updateEthPrice(ethPriceUSD);
    } catch (e) {}
  }, 10 * 60 * 1000);`;

code = code.replace(target, insert);
fs.writeFileSync(file, code);

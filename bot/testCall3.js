const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const abi = ["function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)"];
const contract = new ethers.Contract("0x9dA00D23465282005DB222a441a663eE7B9dfCc8", abi, provider);
contract.latestRoundData().then(console.log).catch(console.error);

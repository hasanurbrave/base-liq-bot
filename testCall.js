const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const abi = ["function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)"];
const contract = new ethers.Contract("0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", abi, provider);
contract.latestRoundData().then(console.log).catch(console.error);

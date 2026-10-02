const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const abi = ["function latestAnswer() external view returns (int256)"];
const contract = new ethers.Contract(ethers.getAddress("0x1A21e9CDBceD344B04C5A5661b0388d8bA28bde4".toLowerCase()), abi, provider);
contract.latestAnswer().then(console.log).catch(console.error);

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LiquidationExecutor.sol";

contract DeployLiquidationExecutor is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address aavePool = vm.envAddress("AAVE_POOL_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        LiquidationExecutor executor = new LiquidationExecutor(aavePool);

        console.log("LiquidationExecutor deployed at:", address(executor));
        console.log("Owner:", executor.owner());
        console.log("Aave Pool:", address(executor.aavePool()));

        vm.stopBroadcast();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;
import "forge-std/Script.sol";
import "forge-std/console.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

contract TestScript is Script {
    function run() external {
        address provider = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
        address pool = IPoolAddressesProvider(provider).getPool();
        console.log("Pool:", pool);
    }
}

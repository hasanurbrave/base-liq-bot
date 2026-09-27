// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

contract FlashLoanReceiver is IFlashLoanSimpleReceiver {
    IPool public immutable POOL;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(address _addressProvider) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(POOL), "Only Pool");
        
        console.log("Flash loan received!");
        console.log("Asset borrowed:", asset);
        console.log("Amount borrowed:", amount);
        console.log("Premium to pay:", premium);

        // Do nothing with the borrowed amount (bare flash loan)
        
        // Approve the Pool to pull the borrowed amount + premium
        uint256 amountToRepay = amount + premium;
        IERC20(asset).approve(address(POOL), amountToRepay);
        
        console.log("Approved Pool to pull repayment");
        return true;
    }

    function requestFlashLoan(address asset, uint256 amount) external {
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            "",
            0
        );
    }
}

contract FlashLoanTest is Script {
    address constant AAVE_ADDRESSES_PROVIDER = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D; // Base Aave V3
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // Base USDC
    address constant USDC_WHALE = 0x3304E22DDaa22bCdC5f618EE876feA379a20B416; // Arbitrary USDC holder on Base

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Receiver
        FlashLoanReceiver receiver = new FlashLoanReceiver(AAVE_ADDRESSES_PROVIDER);
        console.log("Receiver deployed at:", address(receiver));

        vm.stopBroadcast();

        // 2. Fund the receiver with USDC to pay the flash loan fee
        // We prank a whale to send some USDC to the receiver
        uint256 borrowAmount = 1000 * 1e6; // 1000 USDC
        uint256 expectedPremium = (borrowAmount * 5) / 10000; // 0.05% fee = 0.5 USDC
        
        vm.prank(USDC_WHALE);
        IERC20(USDC).transfer(address(receiver), expectedPremium + 1e6); // Send fee + extra
        
        console.log("Receiver funded with USDC for premium");
        console.log("Receiver USDC balance:", IERC20(USDC).balanceOf(address(receiver)));

        // 3. Trigger Flash Loan
        vm.startBroadcast(deployerPrivateKey);
        receiver.requestFlashLoan(USDC, borrowAmount);
        vm.stopBroadcast();
        
        console.log("Flash loan executed successfully!");
    }
}

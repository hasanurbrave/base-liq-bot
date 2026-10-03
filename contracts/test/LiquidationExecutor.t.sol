// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {LiquidationExecutor} from "../src/LiquidationExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "@aave/core-v3/contracts/interfaces/IPriceOracleGetter.sol";

contract LiquidationExecutorTest is Test {
    LiquidationExecutor public executor;
    
    // Base Mainnet Addresses
    address constant PROVIDER = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
    address constant POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address constant ORACLE = 0x2A152140A73Aa52a5E82bBDcAE16fF4F7A9D6aF8; // Aave Oracle
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant UNI_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant AERO_ROUTER = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;
    
    address owner = address(0x123);
    address borrower = address(0x456);
    
    function setUp() public {
        // Create a Base fork
        string memory rpcUrl = vm.envOr("RPC_URL_HTTP", string("https://mainnet.base.org"));
        uint256 forkId = vm.createSelectFork(rpcUrl);
        
        vm.startPrank(owner);
        executor = new LiquidationExecutor(PROVIDER, UNI_ROUTER, AERO_ROUTER);
        vm.stopPrank();
    }

    function test_AccessControl_OnlyOwner() public {
        vm.startPrank(address(0x999));
        LiquidationExecutor.SwapParams memory swap = LiquidationExecutor.SwapParams(
            LiquidationExecutor.Dex.UNISWAP_V3,
            3000,
            false,
            address(0),
            0
        );
        LiquidationExecutor.LiquidationParams memory params = LiquidationExecutor.LiquidationParams({
            collateralAsset: WETH,
            debtAsset: USDC,
            user: borrower,
            debtToCover: 100e6,
            receiveAToken: false,
            minProfit: 0,
            swap: swap
        });
        
        vm.expectRevert(); // OwnableUnauthorizedAccount
        executor.executeLiquidation(params);
        vm.stopPrank();
    }
    
    function test_RevertIf_NotPool() public {
        vm.startPrank(address(0x999));
        vm.expectRevert(LiquidationExecutor.Unauthorized.selector);
        executor.executeOperation(USDC, 100e6, 1e6, address(executor), "");
        vm.stopPrank();
    }

    function test_SimulatedRealLiquidation() public {
        // 1. Setup an underwater position
        // Give borrower 1 WETH
        deal(WETH, borrower, 1 ether);
        
        vm.startPrank(borrower);
        IERC20(WETH).approve(POOL, type(uint256).max);
        IPool(POOL).supply(WETH, 1 ether, borrower, 0);
        
        // Borrow 2000 USDC against it (assuming price is ~3000, 2000 is healthy)
        // Wait, to borrow they need to be healthy at current block.
        // We will just force borrow using deal on variable debt token if possible, 
        // or just mock the oracle price of WETH to be very high, borrow, then drop it.
        vm.mockCall(
            ORACLE,
            abi.encodeWithSelector(IPriceOracleGetter.getAssetPrice.selector, WETH),
            abi.encode(4000e8) // WETH = $4000
        );
        IPool(POOL).borrow(USDC, 2500e6, 2, 0, borrower);
        vm.stopPrank();
        
        // 2. Drop WETH price to force HF < 1
        vm.mockCall(
            ORACLE,
            abi.encodeWithSelector(IPriceOracleGetter.getAssetPrice.selector, WETH),
            abi.encode(2600e8) // WETH = $2600. Borrowed 2500, LTV is 0.82. 2600 * 0.82 = 2132. HF = 2132 / 2500 < 1!
        );
        
        // 3. Execute Liquidation
        LiquidationExecutor.SwapParams memory swap = LiquidationExecutor.SwapParams(
            LiquidationExecutor.Dex.UNISWAP_V3,
            500, // 0.05% fee pool for WETH/USDC
            false,
            address(0),
            0 // minOut = 0 for test, IRL we set this
        );
        
        LiquidationExecutor.LiquidationParams memory params = LiquidationExecutor.LiquidationParams({
            collateralAsset: WETH,
            debtAsset: USDC,
            user: borrower,
            debtToCover: 1250e6, // 50% of 2500
            receiveAToken: false,
            minProfit: 1e6, // Expect at least 1 USDC profit
            swap: swap
        });
        
        vm.startPrank(owner);
        uint256 ownerUsdcBefore = IERC20(USDC).balanceOf(owner);
        
        // NOTE: In a true fork, Uniswap pool prices depend on the block's real state.
        // Since we didn't mock Uniswap, the swap uses real liquidity! 
        // WETH is actually ~$3000 on chain right now, so our seized WETH (worth $1250 * 1.05 = $1312 at our fake oracle price)
        // will be swapped at real market rates (~$3000/ETH). 
        // 1312 / 2600 = 0.504 ETH. Swapped at $3000 = $1512 USDC!
        // We borrowed 1250 USDC. Profit = 1512 - 1250 = 262 USDC.
        executor.executeLiquidation(params);
        
        uint256 ownerUsdcAfter = IERC20(USDC).balanceOf(owner);
        uint256 profit = ownerUsdcAfter - ownerUsdcBefore;
        
        console2.log("Liquidation Profit (USDC):", profit / 1e6);
        assertTrue(profit >= 1e6, "Profit should be at least 1 USDC");
        vm.stopPrank();
    }
}

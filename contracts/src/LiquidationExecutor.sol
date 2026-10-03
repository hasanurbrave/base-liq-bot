// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract LiquidationExecutor is FlashLoanSimpleReceiverBase, Ownable, Pausable {
    using SafeERC20 for IERC20;

    address public immutable uniswapRouter;
    address public immutable aerodromeRouter;

    enum Dex { UNISWAP_V3, AERODROME }

    struct SwapParams {
        Dex dex;
        uint24 fee; // UniV3 fee
        bool stable; // Aerodrome stable flag
        address factory; // Aerodrome factory
        uint256 minOut;
    }

    struct LiquidationParams {
        address collateralAsset;
        address debtAsset;
        address user;
        uint256 debtToCover;
        bool receiveAToken;
        uint256 minProfit; // CRIT-NEW-01 Fix: Restore minProfit field
        SwapParams swap;
    }

    error InsufficientProfit(uint256 expected, uint256 actual);
    error SwapFailed();
    error Unauthorized();

    event Liquidated(address indexed user, address indexed debtAsset, address indexed collateralAsset, uint256 profit);

    constructor(
        address _addressProvider,
        address _uniswapRouter,
        address _aerodromeRouter
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        uniswapRouter = _uniswapRouter;
        aerodromeRouter = _aerodromeRouter;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function executeLiquidation(LiquidationParams memory params) external onlyOwner whenNotPaused {
        bytes memory data = abi.encode(params);
        
        // Initiate Flash Loan
        POOL.flashLoanSimple(
            address(this),
            params.debtAsset,
            params.debtToCover,
            data,
            0
        );

        // Sweep profits back to owner
        uint256 debtBalance = IERC20(params.debtAsset).balanceOf(address(this));
        if (debtBalance > 0) {
            IERC20(params.debtAsset).safeTransfer(owner(), debtBalance);
        }
        
        uint256 collateralBalance = IERC20(params.collateralAsset).balanceOf(address(this));
        if (collateralBalance > 0) {
            IERC20(params.collateralAsset).safeTransfer(owner(), collateralBalance);
        }
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override whenNotPaused returns (bool) {
        if (msg.sender != address(POOL)) revert Unauthorized();
        if (initiator != address(this)) revert Unauthorized();

        LiquidationParams memory liqParams = abi.decode(params, (LiquidationParams));

        // 1. Approve Aave Pool to pull debt asset for liquidation
        IERC20(asset).forceApprove(address(POOL), amount);

        // 2. Liquidate
        POOL.liquidationCall(
            liqParams.collateralAsset,
            liqParams.debtAsset,
            liqParams.user,
            liqParams.debtToCover,
            liqParams.receiveAToken
        );

        // Reset allowance
        IERC20(asset).forceApprove(address(POOL), 0);

        // 3. Get received collateral amount
        uint256 amountIn = IERC20(liqParams.collateralAsset).balanceOf(address(this));

        // 4. Swap Collateral for Debt Asset
        // Important: check swap.dex instead of liqParams.dex! 
        // Previously it was liqParams.dex which doesn't exist on LiquidationParams directly.
        if (liqParams.swap.dex == Dex.UNISWAP_V3) {
            IERC20(liqParams.collateralAsset).forceApprove(uniswapRouter, amountIn);
            
            ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter.ExactInputSingleParams({
                tokenIn: liqParams.collateralAsset,
                tokenOut: liqParams.debtAsset,
                fee: liqParams.swap.fee,
                recipient: address(this),
                deadline: block.timestamp + 60, // LOW-08 Fix: 60s tolerance
                amountIn: amountIn,
                amountOutMinimum: liqParams.swap.minOut,
                sqrtPriceLimitX96: 0
            });

            try ISwapRouter(uniswapRouter).exactInputSingle(swapParams) returns (uint256) {
                // Success
            } catch {
                revert SwapFailed();
            }
            IERC20(liqParams.collateralAsset).forceApprove(uniswapRouter, 0);

        } else if (liqParams.swap.dex == Dex.AERODROME) {
            IERC20(liqParams.collateralAsset).forceApprove(aerodromeRouter, amountIn);
            
            IAerodromeRouter.Route[] memory route = new IAerodromeRouter.Route[](1);
            route[0] = IAerodromeRouter.Route({
                from: liqParams.collateralAsset,
                to: liqParams.debtAsset,
                stable: liqParams.swap.stable,
                factory: liqParams.swap.factory
            });

            try IAerodromeRouter(aerodromeRouter).swapExactTokensForTokens(
                amountIn,
                liqParams.swap.minOut,
                route,
                address(this),
                block.timestamp + 60 // LOW-08 Fix
            ) {
                // Success
            } catch {
                revert SwapFailed();
            }
            IERC20(liqParams.collateralAsset).forceApprove(aerodromeRouter, 0);
        }

        // 5. Verify we can repay flash loan and hit min profit
        uint256 amountToRepay = amount + premium;
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        
        // CRIT-NEW-01 Fix: enforce on-chain minProfit check
        uint256 requiredBalance = amountToRepay + liqParams.minProfit;
        if (currentBalance < requiredBalance) {
            revert InsufficientProfit(requiredBalance, currentBalance);
        }

        // Record profit event
        uint256 profit = currentBalance - amountToRepay;
        emit Liquidated(liqParams.user, liqParams.debtAsset, liqParams.collateralAsset, profit);

        // 6. Approve Aave Pool to pull flash loan repayment
        IERC20(asset).forceApprove(address(POOL), amountToRepay);

        return true;
    }
    
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    function rescueETH(uint256 amount) external onlyOwner {
        (bool success, ) = owner().call{value: amount}("");
        require(success, "ETH transfer failed");
    }
    
    receive() external payable {}
}


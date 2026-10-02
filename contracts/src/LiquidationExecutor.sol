// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IPool {
    function liquidationCall(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external;

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params)
        external
        returns (bool);
    function ADDRESSES_PROVIDER() external view returns (address);
    function POOL() external view returns (address);
}

contract LiquidationExecutor is IFlashLoanSimpleReceiver {
    address public immutable owner;
    IPool public immutable aavePool;

    error NotOwner();
    error NotAavePool();
    error NotInitiator();
    error InsufficientProfit(uint256 expected, uint256 actual);
    error SwapFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _aavePool) {
        owner = msg.sender;
        aavePool = IPool(_aavePool);
    }

    struct LiquidationParams {
        address collateralAsset;
        address debtAsset;
        address borrower;
        uint256 debtToCover;
        address swapRouter;
        bytes swapData;
        uint256 minProfitOut;
    }

    /// @notice Entry point for the bot to trigger the flash loan
    function executeLiquidation(
        address flashLoanAsset, // Usually same as debtAsset
        uint256 flashLoanAmount,
        address collateralAsset,
        address debtAsset,
        address borrower,
        uint256 debtToCover,
        address swapRouter,
        bytes calldata swapData,
        uint256 minProfitOut
    ) external onlyOwner {
        // Encode the parameters to pass through the flash loan callback
        bytes memory params = abi.encode(
            LiquidationParams({
                collateralAsset: collateralAsset,
                debtAsset: debtAsset,
                borrower: borrower,
                debtToCover: debtToCover,
                swapRouter: swapRouter,
                swapData: swapData,
                minProfitOut: minProfitOut
            })
        );

        // Initiate the flash loan
        aavePool.flashLoanSimple(
            address(this),
            flashLoanAsset,
            flashLoanAmount,
            params,
            0 // referralCode
        );
    }

    /// @notice Callback function called by Aave Pool after sending the flash loan funds
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params)
        external
        override
        returns (bool)
    {
        // Security checks
        if (msg.sender != address(aavePool)) revert NotAavePool();
        if (initiator != address(this)) revert NotInitiator();

        // Decode parameters
        LiquidationParams memory decoded = abi.decode(params, (LiquidationParams));

        // Step 1: Approve debtAsset to aavePool and execute liquidation
        IERC20(decoded.debtAsset).approve(address(aavePool), decoded.debtToCover);

        aavePool.liquidationCall(
            decoded.collateralAsset,
            decoded.debtAsset,
            decoded.borrower,
            decoded.debtToCover,
            false // Receive underlying token, not aToken
        );

        // Step 2: Check collateral received
        uint256 collateralReceived = IERC20(decoded.collateralAsset).balanceOf(address(this));

        // Step 3: Execute swap (Collateral -> Debt Asset) to repay loan
        if (decoded.collateralAsset != decoded.debtAsset) {
            IERC20(decoded.collateralAsset).approve(decoded.swapRouter, collateralReceived);

            // Execute the swap via raw call using the provided swapData (e.g., Uniswap Router calldata)
            (bool success,) = decoded.swapRouter.call(decoded.swapData);
            if (!success) revert SwapFailed();
        }

        // Step 4 & 5: Verify we have enough to repay the loan + premium
        uint256 amountToRepay = amount + premium;
        uint256 debtAssetBalance = IERC20(asset).balanceOf(address(this));

        // We must have at least enough to repay the loan.
        // Aave will pull the `amountToRepay` from this contract right after this function returns true.
        require(debtAssetBalance >= amountToRepay, "Not enough funds to repay flash loan");

        // Approve Aave Pool to pull the repayment
        IERC20(asset).approve(address(aavePool), amountToRepay);

        // Step 6: Calculate profit
        uint256 profit = debtAssetBalance - amountToRepay;

        // Step 7: Require profit >= minProfitOut
        if (profit < decoded.minProfitOut) {
            revert InsufficientProfit(decoded.minProfitOut, profit);
        }

        // Step 8: Transfer profit to owner
        if (profit > 0) {
            IERC20(asset).transfer(owner, profit);
        }

        return true;
    }

    /// @notice Rescue stuck ERC20 tokens
    function rescueTokens(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(to, balance);
    }

    /// @notice Rescue stuck ETH
    function rescueETH(address to) external onlyOwner {
        (bool success,) = to.call{value: address(this).balance}("");
        require(success, "ETH transfer failed");
    }

    /// @notice Accept ETH if needed
    receive() external payable {}

    // Fallback interfaces required by IFlashLoanSimpleReceiver
    function ADDRESSES_PROVIDER() external view override returns (address) {
        // Technically Aave V3 requires this in some older versions of the interface,
        // but flashLoanSimple on the Pool directly doesn't strictly check it internally.
        // Returning address(0) or owner as a dummy to satisfy the interface.
        return address(0);
    }

    function POOL() external view override returns (address) {
        return address(aavePool);
    }
}

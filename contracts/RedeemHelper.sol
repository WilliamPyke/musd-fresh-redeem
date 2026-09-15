// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title RedeemHelper
/// @notice Unofficial same-tx MUSD redemption wrapper for Mezo.
/// @dev TroveManager burns MUSD from msg.sender and sends native BTC to msg.sender,
///      so this contract must hold MUSD for the call and receive BTC, then forward both.
///      Hints are computed in this transaction so they cannot go stale vs redeemCollateral.
contract RedeemHelper {
    ITroveManager public immutable troveManager;
    IHintHelpers public immutable hintHelpers;
    ISortedTroves public immutable sortedTroves;
    IPriceFeed public immutable priceFeed;
    IERC20 public immutable musd;

    uint256 private constant DEFAULT_MAX_ITERATIONS = 50;

    error ZeroAddress();
    error ZeroAmount();
    error NothingRedeemable();
    error TransferFailed();
    error NativeTransferFailed();
    error Reentrant();

    event Redeemed(
        address indexed caller,
        uint256 musdRequested,
        uint256 musdRedeemed,
        uint256 musdRefunded,
        uint256 btcOut,
        uint256 maxIterations
    );

    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrant();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(
        address _troveManager,
        address _hintHelpers,
        address _sortedTroves,
        address _priceFeed,
        address _musd
    ) {
        if (
            _troveManager == address(0) ||
            _hintHelpers == address(0) ||
            _sortedTroves == address(0) ||
            _priceFeed == address(0) ||
            _musd == address(0)
        ) revert ZeroAddress();

        troveManager = ITroveManager(_troveManager);
        hintHelpers = IHintHelpers(_hintHelpers);
        sortedTroves = ISortedTroves(_sortedTroves);
        priceFeed = IPriceFeed(_priceFeed);
        musd = IERC20(_musd);
    }

    receive() external payable {}

    /// @notice Pull MUSD from the caller, redeem in this same tx, forward BTC + leftover MUSD.
    /// @param amount MUSD wei to attempt. Actual redeem may be HintHelpers truncatedAmount.
    /// @param maxIterations Trove walk cap. 0 means 50.
    function redeem(
        uint256 amount,
        uint256 maxIterations
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (maxIterations == 0) maxIterations = DEFAULT_MAX_ITERATIONS;

        _pullMusd(msg.sender, amount);
        uint256 truncated = _redeemWithFreshHints(amount, maxIterations);

        uint256 musdRefunded = musd.balanceOf(address(this));
        if (musdRefunded > 0) _pushMusd(msg.sender, musdRefunded);

        uint256 btcOut = address(this).balance;
        if (btcOut > 0) {
            (bool ok, ) = payable(msg.sender).call{value: btcOut}("");
            if (!ok) revert NativeTransferFailed();
        }

        emit Redeemed(
            msg.sender,
            amount,
            truncated,
            musdRefunded,
            btcOut,
            maxIterations
        );
    }

    function _redeemWithFreshHints(
        uint256 amount,
        uint256 maxIterations
    ) internal returns (uint256 truncated) {
        uint256 price = priceFeed.fetchPrice();
        address firstHint;
        uint256 partialNicr;
        (firstHint, partialNicr, truncated) = hintHelpers.getRedemptionHints(
            amount,
            price,
            maxIterations
        );
        if (truncated == 0) revert NothingRedeemable();

        (address upperHint, address lowerHint) = sortedTroves.findInsertPosition(
            partialNicr,
            address(this),
            address(this)
        );

        troveManager.redeemCollateral(
            truncated,
            firstHint,
            upperHint,
            lowerHint,
            partialNicr,
            maxIterations
        );
    }

    function _pullMusd(address from, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(musd).call(
            abi.encodeWithSelector(
                IERC20.transferFrom.selector,
                from,
                address(this),
                amount
            )
        );
        if (!_okBool(ok, ret)) revert TransferFailed();
    }

    function _pushMusd(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(musd).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!_okBool(ok, ret)) revert TransferFailed();
    }

    function _okBool(
        bool ok,
        bytes memory ret
    ) private pure returns (bool) {
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
    }
}

interface IERC20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

interface IPriceFeed {
    function fetchPrice() external returns (uint256);
}

interface IHintHelpers {
    function getRedemptionHints(
        uint256 amount,
        uint256 price,
        uint256 maxIterations
    )
        external
        view
        returns (
            address firstRedemptionHint,
            uint256 partialRedemptionHintNICR,
            uint256 truncatedAmount
        );
}

interface ISortedTroves {
    function findInsertPosition(
        uint256 nicr,
        address prevId,
        address nextId
    ) external view returns (address, address);
}

interface ITroveManager {
    function redeemCollateral(
        uint256 amount,
        address firstRedemptionHint,
        address upperPartialRedemptionHint,
        address lowerPartialRedemptionHint,
        uint256 partialRedemptionHintNICR,
        uint256 maxIterations
    ) external;
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {RedeemHelper} from "../RedeemHelper.sol";

contract MockERC20 {
    string public name = "MUSD";
    string public symbol = "MUSD";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "bal");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(balanceOf[from] >= amount, "bal");
        require(allowance[from][msg.sender] >= amount, "allow");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function burn(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "bal");
        balanceOf[from] -= amount;
    }
}

contract MockPriceFeed {
    uint256 public price = 100_000e18;
    uint256 public fetchCount;

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function fetchPrice() external returns (uint256) {
        fetchCount += 1;
        return price;
    }
}

contract MockHintHelpers {
    address public firstHint;
    uint256 public partialNicr;
    uint256 public truncated;
    uint256 public lastAmount;
    uint256 public lastPrice;
    uint256 public lastIters;

    function setHints(
        address _first,
        uint256 _nicr,
        uint256 _truncated
    ) external {
        firstHint = _first;
        partialNicr = _nicr;
        truncated = _truncated;
    }

    function getRedemptionHints(
        uint256 amount,
        uint256 price,
        uint256 maxIterations
    ) external view returns (address, uint256, uint256) {
        lastAmount; // silence
        return (firstHint, partialNicr, truncated);
        // store via unused to keep interface view-compatible
        amount;
        price;
        maxIterations;
    }
}

contract RecordingHintHelpers {
    address public firstHint;
    uint256 public partialNicr;
    uint256 public truncated;

    function setHints(
        address _first,
        uint256 _nicr,
        uint256 _truncated
    ) external {
        firstHint = _first;
        partialNicr = _nicr;
        truncated = _truncated;
    }

    function getRedemptionHints(
        uint256 amount,
        uint256 price,
        uint256 maxIterations
    ) external view returns (address, uint256, uint256) {
        amount;
        price;
        maxIterations;
        return (firstHint, partialNicr, truncated);
    }
}

contract MockSortedTroves {
    address public upper;
    address public lower;
    uint256 public lastNicr;

    function setInsert(address _upper, address _lower) external {
        upper = _upper;
        lower = _lower;
    }

    function findInsertPosition(
        uint256 nicr,
        address,
        address
    ) external view returns (address, address) {
        nicr;
        return (upper, lower);
    }
}

contract MockTroveManager {
    uint256 public lastAmount;
    address public lastFirst;
    address public lastUpper;
    address public lastLower;
    uint256 public lastNicr;
    uint256 public lastIters;
    bool public shouldRevert;
    uint256 public btcToSend;
    IERC20Like public musd;
    address public burnFrom;

    function configure(
        address _musd,
        uint256 _btcToSend
    ) external {
        musd = IERC20Like(_musd);
        btcToSend = _btcToSend;
    }

    function setRevert(bool v) external {
        shouldRevert = v;
    }

    receive() external payable {}

    function fund() external payable {}

    function redeemCollateral(
        uint256 amount,
        address firstRedemptionHint,
        address upperPartialRedemptionHint,
        address lowerPartialRedemptionHint,
        uint256 partialRedemptionHintNICR,
        uint256 maxIterations
    ) external {
        if (shouldRevert) revert("tm");
        lastAmount = amount;
        lastFirst = firstRedemptionHint;
        lastUpper = upperPartialRedemptionHint;
        lastLower = lowerPartialRedemptionHint;
        lastNicr = partialRedemptionHintNICR;
        lastIters = maxIterations;
        musd.burn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: btcToSend}("");
        require(ok, "btc");
    }
}

interface IERC20Like {
    function burn(address from, uint256 amount) external;
}

contract RevertingReceiver {
    RedeemHelper public helper;

    constructor(RedeemHelper _helper) {
        helper = _helper;
    }

    function go(uint256 amount) external {
        helper.redeem(amount, 50);
    }

    receive() external payable {
        revert("nope");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RedeemHelper} from "../RedeemHelper.sol";
import {
    MockERC20,
    MockPriceFeed,
    RecordingHintHelpers,
    MockSortedTroves,
    MockTroveManager,
    RevertingReceiver
} from "./Mocks.sol";

contract RedeemHelperTest is Test {
    MockERC20 musd;
    MockPriceFeed priceFeed;
    RecordingHintHelpers hints;
    MockSortedTroves sorted;
    MockTroveManager tm;
    RedeemHelper helper;
    address user = address(0xA11CE);

    function setUp() public {
        musd = new MockERC20();
        priceFeed = new MockPriceFeed();
        hints = new RecordingHintHelpers();
        sorted = new MockSortedTroves();
        tm = new MockTroveManager();
        helper = new RedeemHelper(
            address(tm),
            address(hints),
            address(sorted),
            address(priceFeed),
            address(musd)
        );
        tm.configure(address(musd), 1 ether);
        vm.deal(address(tm), 100 ether);

        hints.setHints(address(0xB0C9), 1_500_000e9, 100e18);
        sorted.setInsert(address(0x1111), address(0x2222));

        musd.mint(user, 1_000e18);
        vm.prank(user);
        musd.approve(address(helper), type(uint256).max);
        vm.deal(user, 0);
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(RedeemHelper.ZeroAddress.selector);
        new RedeemHelper(
            address(0),
            address(hints),
            address(sorted),
            address(priceFeed),
            address(musd)
        );
    }

    function test_zeroAmountReverts() public {
        vm.prank(user);
        vm.expectRevert(RedeemHelper.ZeroAmount.selector);
        helper.redeem(0, 50);
    }

    function test_nothingRedeemableReverts() public {
        hints.setHints(address(0xB0C9), 1, 0);
        vm.prank(user);
        vm.expectRevert(RedeemHelper.NothingRedeemable.selector);
        helper.redeem(100e18, 50);
    }

    function test_redeemForwardsBtcAndRefundsDust() public {
        vm.prank(user);
        helper.redeem(250e18, 0);

        assertEq(tm.lastAmount, 100e18, "truncated amount");
        assertEq(tm.lastFirst, address(0xB0C9));
        assertEq(tm.lastUpper, address(0x1111));
        assertEq(tm.lastLower, address(0x2222));
        assertEq(tm.lastNicr, 1_500_000e9);
        assertEq(tm.lastIters, 50, "default iterations");
        assertEq(priceFeed.fetchCount(), 1, "price fetched in-tx");
        assertEq(user.balance, 1 ether);
        assertEq(musd.balanceOf(user), 900e18, "unused musd refunded");
        assertEq(musd.balanceOf(address(helper)), 0);
        assertEq(address(helper).balance, 0);
    }

    function test_btcForwardFailureReverts() public {
        RevertingReceiver recv = new RevertingReceiver(helper);
        musd.mint(address(recv), 250e18);
        vm.prank(address(recv));
        musd.approve(address(helper), type(uint256).max);
        vm.expectRevert(RedeemHelper.NativeTransferFailed.selector);
        recv.go(250e18);
    }

    function test_noOwnerOrSweep() public {
        (bool ok, ) = address(helper).call(
            abi.encodeWithSignature("owner()")
        );
        assertFalse(ok);
        (ok, ) = address(helper).call(
            abi.encodeWithSignature("sweep(address)")
        );
        assertFalse(ok);
    }
}

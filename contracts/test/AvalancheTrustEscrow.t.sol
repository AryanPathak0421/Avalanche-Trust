// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AvalancheTrustEscrow} from "../src/AvalancheTrustEscrow.sol";
import {ReentrantSeller, RejectingReceiver} from "./mocks/Attackers.sol";

contract AvalancheTrustEscrowTest is Test {
    AvalancheTrustEscrow internal escrow;

    address internal admin = makeAddr("admin");
    address internal arbitrator = makeAddr("arbitrator");
    address internal buyer = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AMOUNT = 2.5 ether;
    bytes32 internal constant AGREEMENT = keccak256("agreement");
    bytes32 internal constant WORK = keccak256("work");
    bytes32 internal constant REASON = keccak256("reason");

    uint256 internal deadline;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 deadline,
        bytes32 agreementHash,
        address arbitrator
    );
    event EscrowFunded(uint256 indexed escrowId, uint256 amount);
    event WorkSubmitted(uint256 indexed escrowId, bytes32 workHash);
    event EscrowCompleted(uint256 indexed escrowId, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, bytes32 reasonHash, address indexed raisedBy);
    event DisputeResolved(uint256 indexed escrowId, address winner, uint256 amount);
    event EscrowRefunded(uint256 indexed escrowId, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId);

    function setUp() public {
        vm.warp(1_800_000_000);
        escrow = new AvalancheTrustEscrow(admin, arbitrator);
        deadline = block.timestamp + 7 days;
        vm.deal(buyer, 100 ether);
        vm.deal(stranger, 100 ether);
    }

    // ------------------------------------------------------------------ helpers

    function _create() internal returns (uint256 id) {
        vm.prank(buyer);
        id = escrow.createEscrow(seller, deadline, AGREEMENT);
    }

    function _createAndFund() internal returns (uint256 id) {
        id = _create();
        vm.prank(buyer);
        escrow.fundEscrow{value: AMOUNT}(id);
    }

    function _createFundSubmit() internal returns (uint256 id) {
        id = _createAndFund();
        vm.prank(seller);
        escrow.submitWork(id, WORK);
    }

    function _createFundDispute() internal returns (uint256 id) {
        id = _createAndFund();
        vm.prank(buyer);
        escrow.raiseDispute(id, REASON);
    }

    function _status(uint256 id) internal view returns (AvalancheTrustEscrow.EscrowStatus) {
        return escrow.getEscrow(id).status;
    }

    // ------------------------------------------------------------------ constructor

    function test_constructor_setsRoles() public view {
        assertTrue(escrow.hasRole(escrow.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(escrow.hasRole(escrow.PAUSER_ROLE(), admin));
        assertTrue(escrow.hasRole(escrow.ARBITRATOR_ROLE(), arbitrator));
        assertFalse(escrow.hasRole(escrow.ARBITRATOR_ROLE(), admin));
        assertEq(escrow.defaultArbitrator(), arbitrator);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(AvalancheTrustEscrow.InvalidAddress.selector);
        new AvalancheTrustEscrow(address(0), arbitrator);
        vm.expectRevert(AvalancheTrustEscrow.InvalidAddress.selector);
        new AvalancheTrustEscrow(admin, address(0));
    }

    // ------------------------------------------------------------------ creation

    function test_create_valid() public {
        vm.expectEmit(true, true, true, true);
        emit EscrowCreated(1, buyer, seller, deadline, AGREEMENT, arbitrator);
        uint256 id = _create();
        assertEq(id, 1);

        AvalancheTrustEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.buyer, buyer);
        assertEq(e.seller, seller);
        assertEq(e.arbitrator, arbitrator);
        assertEq(e.amount, 0);
        assertEq(e.deadline, deadline);
        assertEq(e.createdAt, block.timestamp);
        assertEq(uint8(e.status), uint8(AvalancheTrustEscrow.EscrowStatus.Created));
        assertEq(e.agreementHash, AGREEMENT);
        assertEq(escrow.escrowCount(), 1);
    }

    function test_create_zeroSellerRejected() public {
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidAddress.selector);
        escrow.createEscrow(address(0), deadline, AGREEMENT);
    }

    function test_create_sellerEqualsBuyerRejected() public {
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.SameParty.selector);
        escrow.createEscrow(buyer, deadline, AGREEMENT);
    }

    function test_create_deadlineTooSoonRejected() public {
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidDeadline.selector);
        escrow.createEscrow(seller, block.timestamp + 30 minutes, AGREEMENT);
    }

    function test_create_deadlineInPastRejected() public {
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidDeadline.selector);
        escrow.createEscrow(seller, block.timestamp - 1, AGREEMENT);
    }

    function test_create_deadlineTooFarRejected() public {
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidDeadline.selector);
        escrow.createEscrow(seller, block.timestamp + 366 days, AGREEMENT);
    }

    function test_create_uniqueIds() public {
        uint256 a = _create();
        uint256 b = _create();
        vm.prank(stranger);
        uint256 c = escrow.createEscrow(seller, deadline, AGREEMENT);
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(c, 3);
        assertEq(escrow.escrowCount(), 3);
    }

    function test_create_indexesParticipants() public {
        uint256 id = _create();
        uint256[] memory b = escrow.getEscrowsByParticipant(buyer);
        uint256[] memory s = escrow.getEscrowsByParticipant(seller);
        assertEq(b.length, 1);
        assertEq(s.length, 1);
        assertEq(b[0], id);
        assertEq(s[0], id);
        assertEq(escrow.getEscrowsByParticipant(stranger).length, 0);
    }

    function test_getEscrow_unknownReverts() public {
        vm.expectRevert(AvalancheTrustEscrow.EscrowNotFound.selector);
        escrow.getEscrow(999);
    }

    // ------------------------------------------------------------------ funding

    function test_fund_buyerCanFund() public {
        uint256 id = _create();
        vm.expectEmit(true, false, false, true);
        emit EscrowFunded(id, AMOUNT);
        vm.prank(buyer);
        escrow.fundEscrow{value: AMOUNT}(id);

        AvalancheTrustEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.amount, AMOUNT);
        assertEq(e.fundedAt, block.timestamp);
        assertEq(uint8(e.status), uint8(AvalancheTrustEscrow.EscrowStatus.Funded));
        assertEq(address(escrow).balance, AMOUNT);
        assertEq(escrow.totalValueLocked(), AMOUNT);
    }

    function test_fund_sellerCannotFund() public {
        uint256 id = _create();
        vm.deal(seller, AMOUNT);
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.fundEscrow{value: AMOUNT}(id);
    }

    function test_fund_zeroAmountRejected() public {
        uint256 id = _create();
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidAmount.selector);
        escrow.fundEscrow{value: 0}(id);
    }

    function test_fund_doubleFundingRejected() public {
        uint256 id = _createAndFund();
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.fundEscrow{value: AMOUNT}(id);
    }

    function test_fund_unknownEscrowRejected() public {
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.EscrowNotFound.selector);
        escrow.fundEscrow{value: AMOUNT}(42);
    }

    function test_fund_afterDeadlineRejected() public {
        uint256 id = _create();
        vm.warp(deadline);
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.DeadlineExpired.selector);
        escrow.fundEscrow{value: AMOUNT}(id);
    }

    function test_fund_cancelledRejected() public {
        uint256 id = _create();
        vm.prank(buyer);
        escrow.cancelEscrow(id);
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.fundEscrow{value: AMOUNT}(id);
    }

    function test_receive_directTransferRejected() public {
        vm.prank(buyer);
        (bool ok,) = address(escrow).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(escrow).balance, 0);
    }

    // ------------------------------------------------------------------ cancel

    function test_cancel_buyerCanCancelCreated() public {
        uint256 id = _create();
        vm.expectEmit(true, false, false, false);
        emit EscrowCancelled(id);
        vm.prank(buyer);
        escrow.cancelEscrow(id);
        assertEq(uint8(_status(id)), uint8(AvalancheTrustEscrow.EscrowStatus.Cancelled));
    }

    function test_cancel_sellerCannot() public {
        uint256 id = _create();
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.cancelEscrow(id);
    }

    function test_cancel_fundedCannotBeCancelled() public {
        uint256 id = _createAndFund();
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.cancelEscrow(id);
    }

    // ------------------------------------------------------------------ work

    function test_submit_sellerCanSubmit() public {
        uint256 id = _createAndFund();
        vm.expectEmit(true, false, false, true);
        emit WorkSubmitted(id, WORK);
        vm.prank(seller);
        escrow.submitWork(id, WORK);
        AvalancheTrustEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.workSubmissionHash, WORK);
        assertEq(uint8(e.status), uint8(AvalancheTrustEscrow.EscrowStatus.WorkSubmitted));
    }

    function test_submit_buyerCannot() public {
        uint256 id = _createAndFund();
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.submitWork(id, WORK);
    }

    function test_submit_invalidStateRejected() public {
        uint256 id = _create();
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.submitWork(id, WORK);
    }

    function test_submit_zeroHashRejected() public {
        uint256 id = _createAndFund();
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.InvalidHash.selector);
        escrow.submitWork(id, bytes32(0));
    }

    function test_submit_afterDeadlineRejected() public {
        uint256 id = _createAndFund();
        vm.warp(deadline + 1);
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.DeadlineExpired.selector);
        escrow.submitWork(id, WORK);
    }

    function test_submit_exactlyAtDeadlineAllowed() public {
        uint256 id = _createAndFund();
        vm.warp(deadline);
        vm.prank(seller);
        escrow.submitWork(id, WORK);
        assertEq(uint8(_status(id)), uint8(AvalancheTrustEscrow.EscrowStatus.WorkSubmitted));
    }

    // ------------------------------------------------------------------ completion

    function test_approve_buyerCanApproveAndFundsMove() public {
        uint256 id = _createFundSubmit();
        uint256 before = seller.balance;
        vm.expectEmit(true, false, false, true);
        emit EscrowCompleted(id, AMOUNT);
        vm.prank(buyer);
        escrow.approveWork(id);

        assertEq(seller.balance - before, AMOUNT);
        assertEq(address(escrow).balance, 0);
        assertEq(escrow.totalValueLocked(), 0);
        AvalancheTrustEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AvalancheTrustEscrow.EscrowStatus.Completed));
        assertEq(e.completedAt, block.timestamp);
        assertEq(e.resolvedAt, block.timestamp);
    }

    function test_approve_sellerCannot() public {
        uint256 id = _createFundSubmit();
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.approveWork(id);
    }

    function test_approve_beforeSubmissionRejected() public {
        uint256 id = _createAndFund();
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.approveWork(id);
    }

    function test_approve_twiceRejected() public {
        uint256 id = _createFundSubmit();
        vm.startPrank(buyer);
        escrow.approveWork(id);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.approveWork(id);
        vm.stopPrank();
    }

    function test_approve_afterDeadlineStillAllowed() public {
        uint256 id = _createFundSubmit();
        vm.warp(deadline + 30 days);
        vm.prank(buyer);
        escrow.approveWork(id);
        assertEq(uint8(_status(id)), uint8(AvalancheTrustEscrow.EscrowStatus.Completed));
    }

    // ------------------------------------------------------------------ refund

    function test_refund_validAfterDeadline() public {
        uint256 id = _createAndFund();
        uint256 before = buyer.balance;
        vm.warp(deadline);
        assertTrue(escrow.canRefund(id));
        vm.expectEmit(true, false, false, true);
        emit EscrowRefunded(id, AMOUNT);
        vm.prank(buyer);
        escrow.requestRefund(id);
        assertEq(buyer.balance - before, AMOUNT);
        assertEq(escrow.totalValueLocked(), 0);
        assertEq(uint8(_status(id)), uint8(AvalancheTrustEscrow.EscrowStatus.Refunded));
    }

    function test_refund_beforeDeadlineRejected() public {
        uint256 id = _createAndFund();
        assertFalse(escrow.canRefund(id));
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.DeadlineNotReached.selector);
        escrow.requestRefund(id);
    }

    function test_refund_unauthorizedRejected() public {
        uint256 id = _createAndFund();
        vm.warp(deadline);
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.requestRefund(id);
        vm.prank(stranger);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.requestRefund(id);
    }

    function test_refund_afterWorkSubmittedRejected() public {
        uint256 id = _createFundSubmit();
        vm.warp(deadline + 1);
        assertFalse(escrow.canRefund(id));
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.requestRefund(id);
    }

    function test_refund_twiceRejected() public {
        uint256 id = _createAndFund();
        vm.warp(deadline);
        vm.startPrank(buyer);
        escrow.requestRefund(id);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.requestRefund(id);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ dispute

    function test_dispute_buyerCanDisputeFunded() public {
        uint256 id = _createAndFund();
        vm.expectEmit(true, true, false, true);
        emit DisputeRaised(id, REASON, buyer);
        vm.prank(buyer);
        escrow.raiseDispute(id, REASON);
        AvalancheTrustEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AvalancheTrustEscrow.EscrowStatus.Disputed));
        assertEq(e.disputeReasonHash, REASON);
        assertEq(e.disputeRaisedBy, buyer);
        assertEq(e.disputedAt, block.timestamp);
        assertEq(address(escrow).balance, AMOUNT);
        assertEq(escrow.totalValueLocked(), AMOUNT);
    }

    function test_dispute_sellerCanDisputeWorkSubmitted() public {
        uint256 id = _createFundSubmit();
        vm.prank(seller);
        escrow.raiseDispute(id, REASON);
        assertEq(escrow.getEscrow(id).disputeRaisedBy, seller);
    }

    function test_dispute_strangerRejected() public {
        uint256 id = _createAndFund();
        vm.prank(stranger);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.raiseDispute(id, REASON);
    }

    function test_dispute_arbitratorCannotRaise() public {
        uint256 id = _createAndFund();
        vm.prank(arbitrator);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.raiseDispute(id, REASON);
    }

    function test_dispute_unfundedRejected() public {
        uint256 id = _create();
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.raiseDispute(id, REASON);
    }

    function test_dispute_locksNormalCompletionAndRefund() public {
        uint256 id = _createFundDispute();
        vm.startPrank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.approveWork(id);
        vm.warp(deadline + 1);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.requestRefund(id);
        vm.stopPrank();
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.submitWork(id, WORK);
    }

    function test_dispute_twiceRejected() public {
        uint256 id = _createFundDispute();
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.raiseDispute(id, REASON);
    }

    // ------------------------------------------------------------------ arbitration

    function test_resolve_toSeller() public {
        uint256 id = _createFundDispute();
        uint256 before = seller.balance;
        vm.expectEmit(true, false, false, true);
        emit DisputeResolved(id, seller, AMOUNT);
        vm.prank(arbitrator);
        escrow.resolveDispute(id, true);
        assertEq(seller.balance - before, AMOUNT);
        AvalancheTrustEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(AvalancheTrustEscrow.EscrowStatus.Completed));
        assertEq(e.resolvedAt, block.timestamp);
        assertEq(escrow.totalValueLocked(), 0);
    }

    function test_resolve_toBuyer() public {
        uint256 id = _createFundDispute();
        uint256 before = buyer.balance;
        vm.expectEmit(true, false, false, true);
        emit DisputeResolved(id, buyer, AMOUNT);
        vm.prank(arbitrator);
        escrow.resolveDispute(id, false);
        assertEq(buyer.balance - before, AMOUNT);
        assertEq(uint8(_status(id)), uint8(AvalancheTrustEscrow.EscrowStatus.Refunded));
    }

    function test_resolve_nonArbitratorRejected() public {
        uint256 id = _createFundDispute();
        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.resolveDispute(id, true);
        vm.prank(admin);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.resolveDispute(id, true);
    }

    function test_resolve_twiceRejected() public {
        uint256 id = _createFundDispute();
        vm.startPrank(arbitrator);
        escrow.resolveDispute(id, true);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.resolveDispute(id, false);
        vm.stopPrank();
    }

    function test_resolve_notDisputedRejected() public {
        uint256 id = _createAndFund();
        vm.prank(arbitrator);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.resolveDispute(id, true);
    }

    function test_resolve_revokedArbitratorRejected() public {
        uint256 id = _createFundDispute();
        bytes32 role = escrow.ARBITRATOR_ROLE();
        vm.prank(admin);
        escrow.revokeRole(role, arbitrator);
        vm.prank(arbitrator);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.resolveDispute(id, true);
    }

    function test_resolve_newDefaultArbitratorCannotResolveOldEscrow() public {
        uint256 id = _createFundDispute();
        address newArb = makeAddr("newArb");
        vm.prank(admin);
        escrow.setDefaultArbitrator(newArb);
        assertTrue(escrow.hasRole(escrow.ARBITRATOR_ROLE(), newArb));
        vm.prank(newArb);
        vm.expectRevert(AvalancheTrustEscrow.Unauthorized.selector);
        escrow.resolveDispute(id, true);
        vm.prank(arbitrator);
        escrow.resolveDispute(id, true);
        uint256 id2 = _create();
        assertEq(escrow.getEscrow(id2).arbitrator, newArb);
    }

    // ------------------------------------------------------------------ admin / pause

    function test_pause_onlyPauser() public {
        bytes32 role = escrow.PAUSER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        escrow.pause();
    }

    function test_pause_blocksStateChangingActions() public {
        uint256 funded = _createAndFund();
        uint256 submitted = _createFundSubmit();
        uint256 disputed = _createFundDispute();

        vm.prank(admin);
        escrow.pause();
        assertTrue(escrow.paused());

        vm.startPrank(buyer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.createEscrow(seller, deadline, AGREEMENT);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.approveWork(submitted);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.raiseDispute(funded, REASON);
        vm.stopPrank();

        vm.prank(seller);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.submitWork(funded, WORK);

        vm.prank(arbitrator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.resolveDispute(disputed, true);

        vm.prank(admin);
        escrow.unpause();
        vm.prank(buyer);
        escrow.approveWork(submitted);
    }

    function test_pause_fundingBlocked() public {
        uint256 id = _create();
        vm.prank(admin);
        escrow.pause();
        vm.prank(buyer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        escrow.fundEscrow{value: AMOUNT}(id);
    }

    function test_setDefaultArbitrator_onlyAdmin() public {
        bytes32 role = escrow.DEFAULT_ADMIN_ROLE();
        vm.prank(arbitrator);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, arbitrator, role)
        );
        escrow.setDefaultArbitrator(stranger);
        vm.prank(admin);
        vm.expectRevert(AvalancheTrustEscrow.InvalidAddress.selector);
        escrow.setDefaultArbitrator(address(0));
    }

    function test_admin_hasNoWithdrawalPath() public {
        _createAndFund();
        vm.startPrank(admin);
        escrow.pause();
        escrow.unpause();
        escrow.setDefaultArbitrator(makeAddr("x"));
        vm.stopPrank();
        assertEq(address(escrow).balance, AMOUNT);
    }

    // ------------------------------------------------------------------ security

    function test_security_reentrancyOnApproveFails() public {
        ReentrantSeller attacker = new ReentrantSeller(escrow);
        vm.prank(buyer);
        uint256 id = escrow.createEscrow(address(attacker), deadline, AGREEMENT);
        vm.prank(buyer);
        escrow.fundEscrow{value: AMOUNT}(id);
        attacker.setTarget(id);
        attacker.submit(id, WORK);

        vm.prank(buyer);
        escrow.approveWork(id);

        assertEq(attacker.reentryAttempts(), 1);
        assertFalse(attacker.reentrySucceeded());
        assertEq(address(attacker).balance, AMOUNT);
        assertEq(address(escrow).balance, 0);
    }

    function test_security_reentrancyOnResolveFails() public {
        ReentrantSeller attacker = new ReentrantSeller(escrow);
        vm.prank(buyer);
        uint256 id = escrow.createEscrow(address(attacker), deadline, AGREEMENT);
        vm.prank(buyer);
        escrow.fundEscrow{value: AMOUNT}(id);
        attacker.setTarget(id);
        vm.prank(buyer);
        escrow.raiseDispute(id, REASON);

        vm.prank(arbitrator);
        escrow.resolveDispute(id, true);
        assertFalse(attacker.reentrySucceeded());
        assertEq(address(escrow).balance, 0);
    }

    function test_security_failedTransferRevertsAndKeepsState() public {
        RejectingReceiver badSeller = new RejectingReceiver(escrow);
        vm.prank(buyer);
        uint256 id = escrow.createEscrow(address(badSeller), deadline, AGREEMENT);
        vm.prank(buyer);
        escrow.fundEscrow{value: AMOUNT}(id);
        badSeller.submit(id, WORK);

        vm.prank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.TransferFailed.selector);
        escrow.approveWork(id);

        assertEq(uint8(_status(id)), uint8(AvalancheTrustEscrow.EscrowStatus.WorkSubmitted));
        assertEq(escrow.totalValueLocked(), AMOUNT);

        vm.prank(buyer);
        escrow.raiseDispute(id, REASON);
        uint256 before = buyer.balance;
        vm.prank(arbitrator);
        escrow.resolveDispute(id, false);
        assertEq(buyer.balance - before, AMOUNT);
    }

    function test_security_failedRefundToContractBuyerReverts() public {
        RejectingReceiver badBuyer = new RejectingReceiver(escrow);
        vm.deal(address(badBuyer), AMOUNT);
        uint256 id = badBuyer.create(seller, deadline, AGREEMENT);
        badBuyer.fund{value: AMOUNT}(id);
        vm.warp(deadline);
        vm.expectRevert(AvalancheTrustEscrow.TransferFailed.selector);
        badBuyer.refund(id);
        assertEq(uint8(_status(id)), uint8(AvalancheTrustEscrow.EscrowStatus.Funded));
    }

    function test_security_invalidTransitionsFromTerminalStates() public {
        uint256 done = _createFundSubmit();
        vm.prank(buyer);
        escrow.approveWork(done);

        vm.startPrank(buyer);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.fundEscrow{value: AMOUNT}(done);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.raiseDispute(done, REASON);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.cancelEscrow(done);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.requestRefund(done);
        vm.stopPrank();
        vm.prank(seller);
        vm.expectRevert(AvalancheTrustEscrow.InvalidStatus.selector);
        escrow.submitWork(done, WORK);
    }

    function test_security_fundsIsolatedBetweenEscrows() public {
        uint256 a = _createFundSubmit();
        uint256 b = _createAndFund();
        vm.prank(buyer);
        escrow.approveWork(a);
        assertEq(address(escrow).balance, AMOUNT);
        assertEq(escrow.totalValueLocked(), AMOUNT);
        assertEq(escrow.getEscrow(b).amount, AMOUNT);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_fundAndApproveAnyAmount(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(buyer, amount);
        uint256 id = _create();
        vm.prank(buyer);
        escrow.fundEscrow{value: amount}(id);
        vm.prank(seller);
        escrow.submitWork(id, WORK);
        uint256 before = seller.balance;
        vm.prank(buyer);
        escrow.approveWork(id);
        assertEq(seller.balance - before, amount);
        assertEq(escrow.totalValueLocked(), 0);
    }

    function testFuzz_deadlineBounds(uint64 delta) public {
        delta = uint64(bound(delta, 1 hours, 365 days));
        vm.prank(buyer);
        uint256 id = escrow.createEscrow(seller, block.timestamp + delta, AGREEMENT);
        assertEq(escrow.getEscrow(id).deadline, block.timestamp + delta);
    }
}

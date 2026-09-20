// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AvalancheTrustEscrow} from "../../src/AvalancheTrustEscrow.sol";

/// @dev Seller that tries to re-enter the escrow when it receives a payout.
contract ReentrantSeller {
    AvalancheTrustEscrow public escrow;
    uint256 public targetId;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;

    constructor(AvalancheTrustEscrow _escrow) {
        escrow = _escrow;
    }

    function setTarget(uint256 id) external {
        targetId = id;
    }

    function submit(uint256 id, bytes32 h) external {
        escrow.submitWork(id, h);
    }

    receive() external payable {
        reentryAttempts++;
        try escrow.approveWork(targetId) {
            reentrySucceeded = true;
        } catch {}
        try escrow.requestRefund(targetId) {
            reentrySucceeded = true;
        } catch {}
    }
}

/// @dev Participant that rejects all incoming AVAX.
contract RejectingReceiver {
    AvalancheTrustEscrow public escrow;

    constructor(AvalancheTrustEscrow _escrow) {
        escrow = _escrow;
    }

    function submit(uint256 id, bytes32 h) external {
        escrow.submitWork(id, h);
    }

    function create(address seller, uint256 deadline, bytes32 h) external returns (uint256) {
        return escrow.createEscrow(seller, deadline, h);
    }

    function fund(uint256 id) external payable {
        escrow.fundEscrow{value: msg.value}(id);
    }

    function refund(uint256 id) external {
        escrow.requestRefund(id);
    }

    receive() external payable {
        revert("nope");
    }
}

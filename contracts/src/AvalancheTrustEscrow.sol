// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AvalancheTrustEscrow
/// @notice Non-custodial AVAX escrow with a strict state machine, role-based arbitration
///         and an emergency pause. Funds are only ever moved by the rules encoded here:
///         no admin, arbitrator or backend can withdraw arbitrary balances.
/// @dev Large documents (agreement, work deliverable, dispute reason) live off-chain;
///      only their keccak256 hashes are stored so the chain can verify integrity.
contract AvalancheTrustEscrow is AccessControl, Pausable, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------

    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum EscrowStatus {
        Created,
        Funded,
        WorkSubmitted,
        Completed,
        Disputed,
        Refunded,
        Cancelled
    }

    struct Escrow {
        address buyer;
        address seller;
        address arbitrator;
        uint256 amount;
        uint64 createdAt;
        uint64 fundedAt;
        uint64 deadline;
        uint64 completedAt;
        uint64 disputedAt;
        uint64 resolvedAt;
        EscrowStatus status;
        bytes32 agreementHash;
        bytes32 workSubmissionHash;
        bytes32 disputeReasonHash;
        address disputeRaisedBy;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Minimum time between creation and deadline.
    uint64 public constant MIN_DEADLINE_DELTA = 1 hours;
    /// @notice Maximum time between creation and deadline.
    uint64 public constant MAX_DEADLINE_DELTA = 365 days;

    uint256 private _nextEscrowId = 1;
    mapping(uint256 => Escrow) private _escrows;
    mapping(address => uint256[]) private _escrowsByParticipant;

    /// @notice Sum of AVAX currently locked in non-terminal escrows.
    uint256 public totalValueLocked;

    /// @notice Arbitrator assigned to newly created escrows.
    address public defaultArbitrator;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

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
    event DefaultArbitratorUpdated(address indexed previousArbitrator, address indexed newArbitrator);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error Unauthorized();
    error InvalidStatus();
    error InvalidAmount();
    error DeadlineExpired();
    error DeadlineNotReached();
    error InvalidDeadline();
    error InvalidAddress();
    error EscrowNotFound();
    error TransferFailed();
    error SameParty();
    error InvalidHash();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @param admin      receives DEFAULT_ADMIN_ROLE and PAUSER_ROLE
    /// @param arbitrator receives ARBITRATOR_ROLE and becomes the default arbitrator.
    ///                   Intentionally distinct from the deployer unless explicitly configured.
    constructor(address admin, address arbitrator) {
        if (admin == address(0) || arbitrator == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(ARBITRATOR_ROLE, arbitrator);
        defaultArbitrator = arbitrator;
        emit DefaultArbitratorUpdated(address(0), arbitrator);
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier escrowExists(uint256 escrowId) {
        if (_escrows[escrowId].buyer == address(0)) revert EscrowNotFound();
        _;
    }

    modifier onlyBuyer(uint256 escrowId) {
        if (_escrows[escrowId].buyer != msg.sender) revert Unauthorized();
        _;
    }

    modifier onlySeller(uint256 escrowId) {
        if (_escrows[escrowId].seller != msg.sender) revert Unauthorized();
        _;
    }

    modifier inStatus(uint256 escrowId, EscrowStatus expected) {
        if (_escrows[escrowId].status != expected) revert InvalidStatus();
        _;
    }

    // ---------------------------------------------------------------------
    // Buyer actions
    // ---------------------------------------------------------------------

    /// @notice Create a new escrow agreement. The escrow is unfunded until `fundEscrow`.
    /// @param seller        counterparty who will deliver the work
    /// @param deadline      unix timestamp by which the seller must submit work
    /// @param agreementHash keccak256 of the off-chain agreement document
    function createEscrow(address seller, uint256 deadline, bytes32 agreementHash)
        external
        whenNotPaused
        returns (uint256 escrowId)
    {
        if (seller == address(0)) revert InvalidAddress();
        if (seller == msg.sender) revert SameParty();
        if (deadline < block.timestamp + MIN_DEADLINE_DELTA || deadline > block.timestamp + MAX_DEADLINE_DELTA) {
            revert InvalidDeadline();
        }

        escrowId = _nextEscrowId++;
        Escrow storage e = _escrows[escrowId];
        e.buyer = msg.sender;
        e.seller = seller;
        e.arbitrator = defaultArbitrator;
        e.createdAt = uint64(block.timestamp);
        e.deadline = uint64(deadline);
        e.status = EscrowStatus.Created;
        e.agreementHash = agreementHash;

        _escrowsByParticipant[msg.sender].push(escrowId);
        _escrowsByParticipant[seller].push(escrowId);

        emit EscrowCreated(escrowId, msg.sender, seller, deadline, agreementHash, defaultArbitrator);
    }

    /// @notice Lock AVAX into the escrow. `msg.value` becomes the escrow amount.
    function fundEscrow(uint256 escrowId)
        external
        payable
        whenNotPaused
        nonReentrant
        escrowExists(escrowId)
        onlyBuyer(escrowId)
        inStatus(escrowId, EscrowStatus.Created)
    {
        if (msg.value == 0) revert InvalidAmount();
        Escrow storage e = _escrows[escrowId];
        if (block.timestamp >= e.deadline) revert DeadlineExpired();

        e.amount = msg.value;
        e.fundedAt = uint64(block.timestamp);
        e.status = EscrowStatus.Funded;
        totalValueLocked += msg.value;

        emit EscrowFunded(escrowId, msg.value);
    }

    /// @notice Cancel an unfunded escrow. No funds are involved.
    function cancelEscrow(uint256 escrowId)
        external
        escrowExists(escrowId)
        onlyBuyer(escrowId)
        inStatus(escrowId, EscrowStatus.Created)
    {
        _escrows[escrowId].status = EscrowStatus.Cancelled;
        _escrows[escrowId].resolvedAt = uint64(block.timestamp);
        emit EscrowCancelled(escrowId);
    }

    /// @notice Approve submitted work and release the locked AVAX to the seller.
    function approveWork(uint256 escrowId)
        external
        whenNotPaused
        nonReentrant
        escrowExists(escrowId)
        onlyBuyer(escrowId)
        inStatus(escrowId, EscrowStatus.WorkSubmitted)
    {
        Escrow storage e = _escrows[escrowId];
        uint256 amount = e.amount;

        e.status = EscrowStatus.Completed;
        e.completedAt = uint64(block.timestamp);
        e.resolvedAt = uint64(block.timestamp);
        totalValueLocked -= amount;

        emit EscrowCompleted(escrowId, amount);
        _payout(e.seller, amount);
    }

    /// @notice Refund the buyer when the seller has missed the deadline without submitting work.
    /// @dev Only allowed in `Funded` state after `deadline`. This is the ONLY unilateral refund
    ///      path; every other outcome for a funded escrow requires seller approval (via work
    ///      submission + buyer approval) or arbitration.
    function requestRefund(uint256 escrowId)
        external
        whenNotPaused
        nonReentrant
        escrowExists(escrowId)
        onlyBuyer(escrowId)
        inStatus(escrowId, EscrowStatus.Funded)
    {
        Escrow storage e = _escrows[escrowId];
        if (block.timestamp < e.deadline) revert DeadlineNotReached();

        uint256 amount = e.amount;
        e.status = EscrowStatus.Refunded;
        e.resolvedAt = uint64(block.timestamp);
        totalValueLocked -= amount;

        emit EscrowRefunded(escrowId, amount);
        _payout(e.buyer, amount);
    }

    // ---------------------------------------------------------------------
    // Seller actions
    // ---------------------------------------------------------------------

    /// @notice Seller records the hash of the delivered work.
    function submitWork(uint256 escrowId, bytes32 workHash)
        external
        whenNotPaused
        escrowExists(escrowId)
        onlySeller(escrowId)
        inStatus(escrowId, EscrowStatus.Funded)
    {
        Escrow storage e = _escrows[escrowId];
        if (block.timestamp > e.deadline) revert DeadlineExpired();
        if (workHash == bytes32(0)) revert InvalidHash();

        e.workSubmissionHash = workHash;
        e.status = EscrowStatus.WorkSubmitted;

        emit WorkSubmitted(escrowId, workHash);
    }

    // ---------------------------------------------------------------------
    // Disputes
    // ---------------------------------------------------------------------

    /// @notice Either party can freeze a funded escrow pending arbitration.
    /// @dev Allowed from `Funded` or `WorkSubmitted`. Funds stay locked.
    function raiseDispute(uint256 escrowId, bytes32 reasonHash) external whenNotPaused escrowExists(escrowId) {
        Escrow storage e = _escrows[escrowId];
        if (msg.sender != e.buyer && msg.sender != e.seller) revert Unauthorized();
        if (e.status != EscrowStatus.Funded && e.status != EscrowStatus.WorkSubmitted) revert InvalidStatus();

        e.status = EscrowStatus.Disputed;
        e.disputeReasonHash = reasonHash;
        e.disputeRaisedBy = msg.sender;
        e.disputedAt = uint64(block.timestamp);

        emit DisputeRaised(escrowId, reasonHash, msg.sender);
    }

    /// @notice Arbitrator decides the outcome of a disputed escrow. Funds can only go to
    ///         the buyer or the seller, never to the arbitrator or a third party.
    function resolveDispute(uint256 escrowId, bool releaseToSeller)
        external
        whenNotPaused
        nonReentrant
        escrowExists(escrowId)
        inStatus(escrowId, EscrowStatus.Disputed)
    {
        Escrow storage e = _escrows[escrowId];
        if (msg.sender != e.arbitrator || !hasRole(ARBITRATOR_ROLE, msg.sender)) revert Unauthorized();

        uint256 amount = e.amount;
        address winner;
        if (releaseToSeller) {
            winner = e.seller;
            e.status = EscrowStatus.Completed;
            e.completedAt = uint64(block.timestamp);
        } else {
            winner = e.buyer;
            e.status = EscrowStatus.Refunded;
        }
        e.resolvedAt = uint64(block.timestamp);
        totalValueLocked -= amount;

        emit DisputeResolved(escrowId, winner, amount);
        if (releaseToSeller) {
            emit EscrowCompleted(escrowId, amount);
        } else {
            emit EscrowRefunded(escrowId, amount);
        }
        _payout(winner, amount);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Change the arbitrator for future escrows. Existing escrows keep their arbitrator.
    function setDefaultArbitrator(address newArbitrator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newArbitrator == address(0)) revert InvalidAddress();
        address previous = defaultArbitrator;
        defaultArbitrator = newArbitrator;
        if (!hasRole(ARBITRATOR_ROLE, newArbitrator)) {
            _grantRole(ARBITRATOR_ROLE, newArbitrator);
        }
        emit DefaultArbitratorUpdated(previous, newArbitrator);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getEscrow(uint256 escrowId) external view escrowExists(escrowId) returns (Escrow memory) {
        return _escrows[escrowId];
    }

    function getEscrowsByParticipant(address participant) external view returns (uint256[] memory) {
        return _escrowsByParticipant[participant];
    }

    /// @notice Number of escrows created so far (ids run from 1 to escrowCount()).
    function escrowCount() external view returns (uint256) {
        return _nextEscrowId - 1;
    }

    /// @notice Whether the buyer may currently claim a deadline refund.
    function canRefund(uint256 escrowId) external view returns (bool) {
        Escrow storage e = _escrows[escrowId];
        return e.status == EscrowStatus.Funded && block.timestamp >= e.deadline;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _payout(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev The contract only accepts AVAX through `fundEscrow`.
    receive() external payable {
        revert InvalidAmount();
    }
}

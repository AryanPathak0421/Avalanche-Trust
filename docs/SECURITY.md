# AvalancheTrust — Security

> **Audit status: NOT AUDITED.** This contract has been engineered with audit-style practices and has a
> comprehensive automated test suite, but it has not undergone an independent third-party security audit.
> Do not treat it as audited. Mainnet deployment should be preceded by a professional audit and a
> limited-value pilot.

## 1. Threat model

| Actor | Capability | Goal we defend against |
|---|---|---|
| Malicious buyer | Creates/funds escrows, calls buyer functions | Reclaiming funds after work is delivered; blocking payout |
| Malicious seller | Calls seller functions; may be a contract | Extracting funds without approval; reentrancy on payout |
| Malicious third party | Any public call | Acting on escrows they are not party to; draining balances |
| Compromised admin key | `pause`, `unpause`, `setDefaultArbitrator`, role management | Stealing locked funds; changing escrow ownership |
| Compromised arbitrator key | `resolveDispute` on assigned escrows | Sending funds anywhere except buyer/seller |
| Compromised backend / database | Read/write off-chain metadata | Moving funds; misrepresenting on-chain state |
| Malicious frontend fork | Serves altered UI | Hiding state; getting users to sign unintended calls |
| Unreliable RPC | Drops or delays requests | Silent failures; stale UI |

## 2. Fund custody

- AVAX enters the contract only through `fundEscrow`; `receive()` reverts so stray transfers are rejected.
- AVAX leaves only through `_payout`, which is reached from exactly three functions: `approveWork` (to seller), `requestRefund` (to buyer), `resolveDispute` (to buyer **or** seller of that escrow).
- There is **no** `withdraw`, `sweep`, `rescue`, `selfdestruct`, or upgrade mechanism. The admin cannot move funds under any circumstances. `test_admin_hasNoWithdrawalPath` asserts the balance is untouched by every admin function.
- `totalValueLocked` is maintained for transparency and is checked in tests to match the sum of open escrows.

## 3. Reentrancy

- All payout paths are `nonReentrant` (OpenZeppelin `ReentrancyGuard`).
- Checks-Effects-Interactions: status, timestamps and `totalValueLocked` are updated **before** the external call.
- Even without the guard, the status change means a re-entered call hits `InvalidStatus`.
- Tests: `test_security_reentrancyOnApproveFails`, `test_security_reentrancyOnResolveFails` use an attacker contract that re-enters from `receive()` and assert it fails while the legitimate payout still succeeds.

## 4. Failed transfers

`_payout` uses `call{value: amount}("")` and reverts with `TransferFailed()` if it returns `false`. Because the revert rolls back the state change, funds remain in the escrow rather than being lost. A seller whose receiving contract rejects AVAX cannot be paid; the buyer can raise a dispute and the arbitrator can refund. Tests: `test_security_failedTransferRevertsAndKeepsState`, `test_security_failedRefundToContractBuyerReverts`.

## 5. Access control

Roles (OpenZeppelin `AccessControl`):

| Role | Granted at deploy to | Can |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `ADMIN_ADDRESS` (defaults to deployer) | grant/revoke roles, `setDefaultArbitrator` |
| `PAUSER_ROLE` | admin | `pause`, `unpause` |
| `ARBITRATOR_ROLE` | `ARBITRATOR_ADDRESS` | `resolveDispute` on escrows where they are the recorded arbitrator |

Per-escrow authorization uses `onlyBuyer` / `onlySeller` modifiers and explicit checks in `raiseDispute` and `resolveDispute`. `resolveDispute` requires **both** that the caller equals `escrow.arbitrator` and still holds `ARBITRATOR_ROLE`, so revoking the role immediately disables a compromised arbitrator, and changing the default arbitrator does not retroactively reassign existing escrows.

The deploy script warns loudly when arbitrator equals deployer. For production, use three distinct keys (deployer, admin multisig, arbitrator) and revoke the deployer's admin role after handover.

## 6. State machine

`EscrowStatus` transitions are enforced by `inStatus` modifiers and explicit checks; see `docs/ARCHITECTURE.md` §3. Terminal states (`Completed`, `Refunded`, `Cancelled`) admit no further calls. Tests enumerate every invalid transition, double funding, double approval, double refund and double resolution.

## 7. Deadlines and refunds

- `createEscrow` requires `1 hour ≤ deadline − now ≤ 365 days`.
- `fundEscrow` reverts once the deadline has passed (prevents locking funds in an escrow the seller can no longer fulfil).
- `submitWork` is allowed up to and including the deadline second.
- `requestRefund` is the **only** unilateral refund and is possible **only** in `Funded` state at or after the deadline, i.e. when the seller demonstrably missed it. Once work is submitted, refunds require buyer approval of the work (payment), or arbitration.
- `approveWork` is not deadline-bound: submitted work can be approved late.

## 8. Emergency pause

`whenNotPaused` guards creation, funding, work submission, approval, refunds, dispute raising and resolution. `cancelEscrow` remains available because it never moves funds. Pausing cannot move or seize funds; it only freezes the state machine. The frontend reads `paused()` and shows a banner while hiding actions.

## 9. Input validation

Custom errors instead of strings: `Unauthorized`, `InvalidStatus`, `InvalidAmount`, `DeadlineExpired`, `DeadlineNotReached`, `InvalidDeadline`, `InvalidAddress`, `EscrowNotFound`, `TransferFailed`, `SameParty`, `InvalidHash`. Zero seller, seller == buyer, zero value, zero work hash and unknown escrow IDs all revert. Solidity 0.8 checked arithmetic prevents overflow; timestamps are stored as `uint64`.

## 10. Frontend security

- The UI never has keys. Every write goes through the user's wallet after `simulateContract`, which surfaces reverts before signing.
- Role checks in the UI are cosmetic; the contract re-validates everything.
- No transaction is sent unless the wallet is on `NEXT_PUBLIC_CHAIN_ID`; wagmi is configured with a single chain and the guard blocks other chains.
- Documents are hashed client-side; displayed content is re-hashed and compared with the on-chain value before rendering, so a compromised backend cannot show altered agreements as verified.
- Explorer links are built from configuration, not user input.
- Error messages are mapped through a central parser; raw revert data is shown only inside a collapsed "Technical details" section.

## 11. Backend security

- No private keys, no signing, no write access to the chain.
- Rejects documents whose hash does not match the payload (HTTP 422).
- `helmet`, CORS allow-list, 256 KB JSON body limit, Zod validation on every route.
- Database is never used to present balances or statuses as truth.

## 12. Environment variables and secrets

- `.env*` is git-ignored at every level; only `.env.example` files are committed.
- `DEPLOYER_PRIVATE_KEY` is read by Foundry from the environment at deploy time and is never written to disk by our scripts. Broadcast logs (`contracts/broadcast/`) contain transaction data but not keys; local Anvil broadcasts are ignored.
- Public `NEXT_PUBLIC_*` variables contain no secrets (RPC URL, contract address, chain id, optional WalletConnect project id).

## 13. Wallet security guidance for users

- Verify the contract address in the footer against the one published in the README/release notes.
- Check the transaction summary in the wallet: `fundEscrow` should carry exactly the AVAX you intend to lock; other calls should carry zero value.
- Arbitrators should use a dedicated hardware wallet.

## 14. Known limitations (require further hardening before mainnet)

1. **Single arbitrator per escrow.** A malicious or unavailable arbitrator can rule unfairly or stall. A dispute timeout, multi-arbitrator quorum, or appeal path would mitigate this.
2. **No fee/insurance mechanism.** Arbitration is unpaid; there is no economic incentive layer.
3. **Buyer-only funding amount.** The agreed amount is off-chain; the buyer chooses `msg.value`. A seller should verify the funded amount before submitting work (the UI shows it). An `expectedAmount` at creation would enforce this on-chain.
4. **Deadline is seller-side only.** Buyers can delay approval indefinitely after work is submitted; the seller's only recourse is a dispute. A buyer-approval timeout with auto-release would remove this leverage.
5. **Off-chain document availability.** Hashes prove integrity, not availability. Without the backend (or IPFS), only the author's browser holds the text.
6. **No third-party audit** (see banner above).
7. **Public RPC limits.** Event scanning depends on the RPC's `eth_getLogs` range limits; set `NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK` to keep scans short, or run the backend indexer.

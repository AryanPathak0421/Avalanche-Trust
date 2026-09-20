# AvalancheTrust — Architecture

## 1. System overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js 15)                        │
│  Landing · Dashboard · Create · Escrow detail · Disputes · Arbitrator│
│                                                                     │
│   React components ──► hooks (wagmi / TanStack Query) ──► viem      │
└───────────────┬──────────────────────────────┬──────────────────────┘
                │ eth_* JSON-RPC (reads, logs) │ eth_sendTransaction (signed)
                ▼                              ▼
        Avalanche RPC                     Wallet (MetaMask / WalletConnect)
                │                              │
                └──────────────┬───────────────┘
                               ▼
                    Avalanche C-Chain (Fuji 43113 / Mainnet 43114)
                               │
                               ▼
                 AvalancheTrustEscrow.sol  ◄── holds ALL funds
                               │ events
                               ▼
           backend/ indexer (read-only)  ──► PostgreSQL (notifications,
           backend/ REST API             ◄── documents, metadata)
```

Layers, top to bottom:

| Layer | Responsibility | Trust |
|---|---|---|
| Frontend | Renders on-chain state, builds transactions, hashes documents client-side | Untrusted: authorization is mirrored for UX only |
| Wallet | Signs transactions with the user's key | User-controlled |
| Wagmi / Viem | Typed contract calls, simulation, receipts, event decoding | Library |
| Avalanche C-Chain | Execution and finality | Source of truth |
| Smart contract | Custody, state machine, access control | Enforces every rule |
| Backend | Off-chain text, notifications | Cannot touch funds |

## 2. Escrow flow

```text
Buyer
 │  createEscrow(seller, deadline, agreementHash)
 ▼
Create Escrow ──── status: Created ──── (buyer may cancelEscrow)
 │  fundEscrow{value: amount}
 ▼
Fund ─────────────── status: Funded ──── AVAX locked in contract
 │
 ▼
Seller
 │  submitWork(escrowId, workHash)   (before deadline)
 ▼
Submit Work ──────── status: WorkSubmitted
 │
 ▼
Buyer
 │  approveWork(escrowId)
 ▼
Approve ──────────── status: Completed
 │
 ▼
Smart Contract  ──── call{value: amount}(seller)
 │
 ▼
Seller receives AVAX
```

Alternative branches:

```text
Funded ── deadline passes, no work ── requestRefund (buyer) ──► Refunded
Funded / WorkSubmitted ── raiseDispute (buyer or seller) ──► Disputed
Disputed ── resolveDispute(true)  (arbitrator) ──► Completed (seller paid)
Disputed ── resolveDispute(false) (arbitrator) ──► Refunded  (buyer paid)
Created ── cancelEscrow (buyer) ──► Cancelled
```

## 3. State machine

```text
            ┌──────────┐  cancelEscrow   ┌───────────┐
            │ Created  │────────────────►│ Cancelled │
            └────┬─────┘                 └───────────┘
      fundEscrow │
                 ▼
            ┌──────────┐ requestRefund (after deadline) ┌──────────┐
            │  Funded  │───────────────────────────────►│ Refunded │
            └────┬─────┘                                └──────────┘
      submitWork │        raiseDispute                       ▲
                 ▼             │                             │ resolveDispute(false)
        ┌───────────────┐      ▼                       ┌──────────┐
        │ WorkSubmitted │──raiseDispute──────────────►│ Disputed │
        └──────┬────────┘                              └────┬─────┘
    approveWork│                                            │ resolveDispute(true)
               ▼                                            ▼
          ┌───────────┐◄────────────────────────────────────┘
          │ Completed │
          └───────────┘
```

Every transition is guarded by `inStatus(...)`, so anything not drawn above reverts with `InvalidStatus()`.

## 4. Data model

### On-chain (`Escrow` struct)

| Field | Type | Notes |
|---|---|---|
| buyer / seller / arbitrator | address | arbitrator is snapshotted at creation |
| amount | uint256 | set by `msg.value` in `fundEscrow` |
| createdAt / fundedAt / deadline / completedAt / disputedAt / resolvedAt | uint64 | unix seconds |
| status | EscrowStatus | enum above |
| agreementHash / workSubmissionHash / disputeReasonHash | bytes32 | keccak256 of off-chain documents |
| disputeRaisedBy | address | zero unless disputed |

Escrow IDs are sequential (`1..escrowCount()`), so the arbitrator view enumerates them with multicall. `getEscrowsByParticipant(address)` returns the IDs for a wallet's dashboard.

### Off-chain document hashing

Large text (agreements, deliverables, dispute reasons) never goes on-chain. The frontend builds a canonical JSON document, sorts its keys, drops `undefined`, and hashes the UTF-8 bytes with keccak256:

```json
{"createdAt":1789900000,"fileHash":"0x…","fileName":"proof.pdf","kind":"dispute","text":"…"}
```

The `bytes32` hash is what the contract stores. The document itself is:

1. saved in the author's browser (`localStorage`), and
2. POSTed to the backend when `NEXT_PUBLIC_API_URL` is set, where the server re-hashes it and refuses mismatches.

When rendering, the frontend re-hashes the fetched payload and only displays it if it equals the on-chain hash. Attached files are hashed separately (`fileHash`) and folded into the document, so the single on-chain hash commits to everything.

### Backend (PostgreSQL via Prisma)

`User`, `Document`, `EscrowMetadata`, `DisputeMetadata`, `Notification`, `IndexerCursor`. None of these tables store balances or status as authoritative data; they only cache or annotate.

## 5. Frontend architecture

```text
frontend/src
├── app/                 Next.js App Router pages (server shells + client content)
├── components/
│   ├── ui/              shadcn-style primitives (button, card, dialog, table…)
│   ├── layout/          header, footer, theme toggle, logo
│   ├── wallet/          connect button, network guard, wrong-network/paused banners
│   ├── transaction/     transaction dialog, tx hash link, address display
│   ├── escrow/          timeline, actions, events, dialogs, table, create form
│   ├── dashboard/       stats cards
│   └── landing/         marketing sections
├── hooks/               use-network, use-contract-status, use-escrows, use-escrow-events, use-contract-tx
├── lib/                 escrow rules, error parser, explorer urls, hashing, documents, format
├── config/              chains, contract, wagmi, site constants
├── contracts/           generated ABI
└── types/               shared TypeScript types
```

Key design decisions:

- **Blockchain is the only state store.** Every page reads through `useReadContract(s)` with periodic refetch and invalidation on contract events. Browser refresh re-fetches from chain. No escrow data is cached in a database for display.
- **Actions are derived, not guessed.** `getAvailableActions()` mirrors the contract's modifiers (role + status + deadline + paused). A button only renders if the call would succeed, and the transaction is still simulated before the wallet opens.
- **One transaction lifecycle hook.** `useContractTx` runs simulate → gas estimate → wallet confirm → pending → receipt, and maps any failure through `parseContractError`.
- **Single-chain config.** `NEXT_PUBLIC_CHAIN_ID` selects Fuji or Mainnet; RPC and explorer URLs derive from it. The wrong-network guard compares the wallet chain with this value.
- **No fake data.** If the contract address is not configured, pages show a configuration notice instead of demo data.

## 6. Event indexing

Both the frontend and the backend reconstruct history from events rather than polling storage:

- Frontend `useEscrowEvents(id)` calls `eth_getLogs` with `topics[1] = escrowId` in 2 000-block chunks from `NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK`, decodes with the ABI, attaches block timestamps, and subscribes to new logs.
- Backend `indexer.ts` tails the contract, stores a cursor, and creates notifications for the affected buyer/seller.

## 7. Network configuration

| | Fuji | Mainnet |
|---|---|---|
| Chain ID | 43113 | 43114 |
| RPC | https://api.avax-test.network/ext/bc/C/rpc | https://api.avax.network/ext/bc/C/rpc |
| Explorer | https://testnet.snowtrace.io | https://snowtrace.io |
| Verification API | Routescan testnet endpoint | Routescan mainnet endpoint |

Switching networks is a configuration change only; no code paths are chain-specific.

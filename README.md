# AvalancheTrust

**Trustless Escrow. Powered by Avalanche.**

Secure AVAX payments between buyers and sellers with transparent, programmable smart contracts on the Avalanche C-Chain. Funds are held exclusively by an open-source Solidity contract; no company, backend or administrator can move them.

> Status: fully implemented and tested against Avalanche Fuji Testnet tooling. **Not audited** — see [docs/SECURITY.md](docs/SECURITY.md).

---

## Table of contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Tech stack](#tech-stack)
5. [Avalanche network](#avalanche-network)
6. [Smart contract architecture](#smart-contract-architecture)
7. [Escrow lifecycle](#escrow-lifecycle)
8. [User roles](#user-roles)
9. [Security](#security)
10. [Environment variables](#environment-variables)
11. [Installation](#installation)
12. [Development](#development)
13. [Contract testing](#contract-testing)
14. [Deployment](#deployment)
15. [Contract verification](#contract-verification)
16. [Frontend configuration](#frontend-configuration)
17. [Backend (optional)](#backend-optional)
18. [Troubleshooting](#troubleshooting)
19. [Future improvements](#future-improvements)
20. [License](#license)

---

## Overview

A buyer creates an escrow naming a seller, a deadline and an agreement. The buyer deposits AVAX; the contract locks it. The seller submits work; the buyer approves; the contract pays the seller directly. If something goes wrong either party can raise a dispute, freezing the funds until a designated on-chain arbitrator releases them to the buyer or the seller. If the seller misses the deadline without submitting, the buyer can reclaim the deposit unilaterally.

Everything financial happens in `AvalancheTrustEscrow.sol`. The web app is a thin, typed client that reads state from the chain and asks the user's wallet to sign transactions. An optional backend stores off-chain documents and notifications and has no keys.

## Architecture

```text
Frontend (Next.js) ─► Wallet (MetaMask / WalletConnect) ─► Wagmi / Viem ─► Avalanche C-Chain ─► AvalancheTrustEscrow.sol
                                                                                        │
                                              Backend indexer + REST API (read-only) ◄──┘ events
```

Repository layout:

```text
avalanchetrust/
├── contracts/        Foundry project: src/, test/, script/, foundry.toml
├── frontend/         Next.js 15 + TypeScript + Tailwind + wagmi/viem
├── backend/          Express + Prisma (PostgreSQL) metadata API + event indexer
├── docs/             ARCHITECTURE.md, SECURITY.md
├── .env.example      Consolidated environment template
├── package.json      Root convenience scripts
└── README.md
```

Full diagrams and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Why documents are hashed, not stored on-chain

Agreements, deliverables and dispute reasons can be long. Storing them on-chain is expensive and leaks private business details. Instead the app canonicalises the document as JSON, hashes it with keccak256 in the browser, and stores only the 32-byte hash on-chain (`agreementHash`, `workSubmissionHash`, `disputeReasonHash`). The full text lives in the author's browser and, when a backend is configured, in PostgreSQL. Whenever content is displayed it is re-hashed and compared with the on-chain value, so tampered content is never shown as verified. Attached files are hashed too and folded into the document hash.

## Features

- Landing page, wallet connection (MetaMask, injected, WalletConnect), Avalanche network detection and one-click switching
- Dashboard with overview cards, filterable/searchable escrow table (cards on mobile)
- Create escrow with validation and a confirmation modal; two-step create → fund
- Escrow detail page with timeline, documents, on-chain event history and role-aware actions
- Seller work submission, buyer approval, deadline refund, dispute raising with hashed evidence
- Arbitrator dashboard gated by the on-chain `ARBITRATOR_ROLE`
- Full transaction UX: simulate → confirm in wallet → pending → confirmed with block, gas used and Snowtrace link; human-readable errors for rejections, insufficient funds, wrong network, reverts, RPC failures
- Emergency pause reflected in the UI
- Dark/light theme, responsive down to phone widths
- 65 Foundry tests (100 % line coverage on the contract), 52 frontend tests, backend hash-parity tests

## Tech stack

| Area | Choice |
|---|---|
| Contracts | Solidity 0.8.28 (pragma ^0.8.24), OpenZeppelin 5.1, Foundry 1.8 |
| Frontend | Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS 4, shadcn-style Radix components, Lucide icons |
| Web3 | wagmi 3, viem 2, TanStack Query 5 |
| Forms | React Hook Form + Zod |
| Testing | forge test / forge coverage, Vitest + Testing Library |
| Backend | Node 20+, Express 5, Prisma 6, PostgreSQL, viem |

Decision: RainbowKit was dropped because it pins wagmi 2; a custom wallet dialog and menu were built directly on wagmi 3 connectors instead.

## Avalanche network

| | Fuji Testnet | Mainnet |
|---|---|---|
| Chain ID | `43113` | `43114` |
| RPC | `https://api.avax-test.network/ext/bc/C/rpc` | `https://api.avax.network/ext/bc/C/rpc` |
| Explorer | `https://testnet.snowtrace.io` | `https://snowtrace.io` |
| Faucet | https://core.app/tools/testnet-faucet/ | — |

The app targets exactly one chain, selected by `NEXT_PUBLIC_CHAIN_ID`. If the wallet is on any other chain the UI shows **"Please switch to Avalanche Fuji Testnet."** with a Switch Network button and never sends a transaction.

## Smart contract architecture

`contracts/src/AvalancheTrustEscrow.sol` — inherits `AccessControl`, `Pausable`, `ReentrancyGuard`.

### Functions

| Function | Caller | From status | To status | Notes |
|---|---|---|---|---|
| `createEscrow(seller, deadline, agreementHash)` | anyone (becomes buyer) | — | Created | seller ≠ 0, seller ≠ buyer, 1 h ≤ deadline−now ≤ 365 d |
| `fundEscrow(id)` payable | buyer | Created | Funded | `msg.value > 0`, before deadline |
| `cancelEscrow(id)` | buyer | Created | Cancelled | no funds involved; allowed while paused |
| `submitWork(id, workHash)` | seller | Funded | WorkSubmitted | hash ≠ 0, `now ≤ deadline` |
| `approveWork(id)` | buyer | WorkSubmitted | Completed | pays seller |
| `requestRefund(id)` | buyer | Funded | Refunded | only `now ≥ deadline` |
| `raiseDispute(id, reasonHash)` | buyer or seller | Funded, WorkSubmitted | Disputed | funds stay locked |
| `resolveDispute(id, releaseToSeller)` | escrow's arbitrator with role | Disputed | Completed / Refunded | pays seller or buyer only |
| `pause()` / `unpause()` | PAUSER_ROLE | — | — | freezes everything except cancel |
| `setDefaultArbitrator(addr)` | DEFAULT_ADMIN_ROLE | — | — | affects future escrows only |

Views: `getEscrow`, `getEscrowsByParticipant`, `escrowCount`, `canRefund`, `totalValueLocked`, `defaultArbitrator`, `paused`, `hasRole`.

### Roles

`DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE` (both to `ADMIN_ADDRESS`), `ARBITRATOR_ROLE` (to `ARBITRATOR_ADDRESS`). The arbitrator is **not** the deployer unless you explicitly leave `ARBITRATOR_ADDRESS` unset; the deploy script warns when that happens.

### Events

`EscrowCreated`, `EscrowFunded`, `WorkSubmitted`, `EscrowCompleted`, `DisputeRaised`, `DisputeResolved`, `EscrowRefunded`, `EscrowCancelled`, `DefaultArbitratorUpdated`. All escrow events index `escrowId` as the first topic, which the frontend uses to reconstruct a per-escrow timeline with one log filter.

### Errors

`Unauthorized`, `InvalidStatus`, `InvalidAmount`, `DeadlineExpired`, `DeadlineNotReached`, `InvalidDeadline`, `InvalidAddress`, `EscrowNotFound`, `TransferFailed`, `SameParty`, `InvalidHash`, plus OpenZeppelin's `EnforcedPause` and `AccessControlUnauthorizedAccount`. The frontend maps each to a plain-English message.

### Admin model

Admin **can**: pause, unpause, change the default arbitrator for future escrows, grant/revoke roles.
Admin **cannot**: withdraw or redirect escrow funds, change buyer/seller of an escrow, alter status. There is no withdrawal function of any kind.

## Escrow lifecycle

```text
Created ──fund──► Funded ──submitWork──► WorkSubmitted ──approveWork──► Completed
   │                 │                        │
   │cancel           │requestRefund (deadline)│raiseDispute
   ▼                 ▼                        ▼
Cancelled         Refunded               Disputed ──resolve──► Completed | Refunded
```

**Refund rules (exact):** a refund without arbitration is possible only when the escrow is `Funded` (no work submitted) **and** the deadline has passed. Any other outcome for a funded escrow requires buyer approval (payment) or an arbitrator ruling.

## User roles

| Role | Can |
|---|---|
| Buyer | create, fund, cancel (unfunded), approve work, request refund after deadline, raise dispute |
| Seller | see assigned escrows, submit work before deadline, raise dispute |
| Arbitrator | see disputed escrows assigned to them, inspect hashes/documents, release to buyer or seller |
| Observer | read everything; no actions |

The UI determines the role from the connected wallet and the on-chain escrow, and re-derives it whenever the wallet account changes.

## Security

Summary (details in [docs/SECURITY.md](docs/SECURITY.md)):

- Checks-Effects-Interactions on every payout, `nonReentrant`, revert on failed `call`
- OpenZeppelin AccessControl + Pausable; per-escrow arbitrator snapshot and live role check
- Strict state machine with custom errors; every invalid transition is tested
- No admin withdrawal path; `receive()` rejects direct transfers
- Reentrancy attacker and rejecting-receiver contracts in the test suite
- Frontend simulates every call before the wallet opens, verifies documents against on-chain hashes, and never sends on an unsupported chain

**The contract is not audited.**

## Environment variables

Copy `.env.example` sections into the right place. Never commit real values (`.env*` is ignored everywhere).

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | frontend | `43113` (Fuji) or `43114` (Mainnet) |
| `NEXT_PUBLIC_RPC_URL` | frontend | HTTP RPC endpoint |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | frontend | deployed `AvalancheTrustEscrow` |
| `NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK` | frontend | start block for event scans |
| `NEXT_PUBLIC_EXPLORER_URL` | frontend | Snowtrace base URL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | frontend | optional, enables WalletConnect |
| `NEXT_PUBLIC_API_URL` | frontend | optional backend base URL |
| `DEPLOYER_PRIVATE_KEY` | contracts | deployer key (env only) |
| `ADMIN_ADDRESS`, `ARBITRATOR_ADDRESS` | contracts | role holders |
| `FUJI_RPC_URL`, `AVALANCHE_RPC_URL`, `SNOWTRACE_API_KEY` | contracts | deploy + verify |
| `DATABASE_URL`, `PORT`, `CORS_ORIGINS`, `CHAIN_ID`, `RPC_URL`, `CONTRACT_ADDRESS`, `CONTRACT_DEPLOY_BLOCK` | backend | API + indexer |

## Installation

Prerequisites: Node.js ≥ 20, npm ≥ 10, [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`), Git. PostgreSQL only if you run the backend.

```bash
git clone <repository>
cd avalanchetrust
```

Contracts:

```bash
cd contracts
forge install
forge build
forge test
```

Frontend:

```bash
cd ../frontend
npm install --legacy-peer-deps
cp .env.example .env.local
```

## Development

Start the frontend:

```bash
cd frontend
npm run dev
```

Open http://localhost:3000. Until `NEXT_PUBLIC_CONTRACT_ADDRESS` is set, app pages show a "Contract not configured" notice (no demo data is ever shown).

Local chain workflow (optional, useful for end-to-end testing without faucet AVAX):

```bash
# terminal 1
anvil

# terminal 2 – deploy with Anvil's first account, second account as arbitrator
cd contracts
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
ARBITRATOR_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

Then, in `frontend/.env.local`:

```env
NEXT_PUBLIC_CHAIN_ID=43113
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3   # printed by the deploy script
NEXT_PUBLIC_ENABLE_DEV_WALLET=true
```

Run Anvil as `anvil --chain-id 43113 --block-time 1` so the app treats it as Fuji. wagmi batches reads through Multicall3, which exists on Fuji/Mainnet but not on a fresh Anvil, so copy it over once:

```bash
cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11   "$(cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url https://api.avax-test.network/ext/bc/C/rpc)"   --rpc-url http://127.0.0.1:8545
```
 `NEXT_PUBLIC_ENABLE_DEV_WALLET=true` adds a **Local Dev Wallet** connector that signs with Anvil's unlocked accounts (account 0 = buyer/admin, 1 = arbitrator, 2 = seller). It is compiled out of production builds and never touches real networks. You can also point MetaMask's Fuji entry at the Anvil RPC and use the Anvil private keys.

Quality checks:

```bash
cd frontend
npm run typecheck
npm run lint
npm run test
npm run build
```

## Contract testing

```bash
cd contracts
forge test -vv
forge coverage --report summary
```

Latest run: **65 tests passed, 0 failed**; `AvalancheTrustEscrow.sol` line coverage 100 % (121/121), branch coverage 95.65 %, function coverage 100 %. Suites cover creation, funding, cancel, work, completion, refund, dispute, arbitration, pause/access control, reentrancy, failed transfers, invalid transitions, fund isolation and fuzzing of amounts/deadlines.

## Deployment

```text
Local (Anvil) ──► Fuji Testnet ──► Contract verification ──► Frontend deployment ──► Mainnet preparation
```

### 1. Deploy to Fuji

```bash
cd contracts
cp .env.example .env      # fill DEPLOYER_PRIVATE_KEY, ARBITRATOR_ADDRESS, ADMIN_ADDRESS
source .env               # or export the variables in your shell
forge script script/Deploy.s.sol:Deploy --rpc-url fuji --broadcast --verify -vvv
```

The script prints **Network, Chain ID, Deployer, Admin, Arbitrator, Contract address** and writes `contracts/deployments/43113.json`. The transaction hash is in `contracts/broadcast/Deploy.s.sol/43113/run-latest.json`.

Get test AVAX from the [Fuji faucet](https://core.app/tools/testnet-faucet/).

### 2. Export the ABI to the frontend

```bash
bash contracts/script/export-abi.sh
```

### 3. Configure the frontend

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_CHAIN_ID=43113
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...          # from step 1
NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK=12345678  # block of the deployment tx
```

### 4. Deploy the frontend

Any Node host works (Vercel, Netlify, Docker). Build with `npm run build` and set the same `NEXT_PUBLIC_*` variables in the hosting environment.

### 5. Mainnet

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url avalanche --broadcast --verify -vvv
```

Then set `NEXT_PUBLIC_CHAIN_ID=43114`, `NEXT_PUBLIC_RPC_URL=https://api.avax.network/ext/bc/C/rpc`, `NEXT_PUBLIC_EXPLORER_URL=https://snowtrace.io` and the mainnet contract address. Before mainnet: use a multisig for `ADMIN_ADDRESS`, a dedicated hardware wallet for `ARBITRATOR_ADDRESS`, complete a third-party audit, and run a limited-value pilot.

### Contract address

No live Fuji deployment was performed from this repository (no funded deployer key was available), so no address is published here. After you deploy, record it as:

```text
Avalanche Fuji Contract:
0x...
```

## Contract verification

`foundry.toml` is pre-configured with Routescan's Etherscan-compatible endpoints for Fuji and Mainnet, which power Snowtrace. `--verify` during deployment handles it automatically. To verify an existing deployment:

```bash
cd contracts
forge verify-contract <CONTRACT_ADDRESS> src/AvalancheTrustEscrow.sol:AvalancheTrustEscrow \
  --chain-id 43113 \
  --verifier-url "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" \
  --etherscan-api-key verifyContract \
  --constructor-args $(cast abi-encode "constructor(address,address)" $ADMIN_ADDRESS $ARBITRATOR_ADDRESS)
```

For mainnet use chain id `43114` and the `.../mainnet/evm/43114/etherscan` URL.

Checklist after deploying: **1. Deploy → 2. Verify → 3. Copy contract address → 4. Update frontend `.env.local` → 5. Start application.**

## Frontend configuration

- `frontend/src/config/chains.ts` — network definitions, active chain derived from env
- `frontend/src/config/contract.ts` — address, ABI, deploy block
- `frontend/src/config/wagmi.ts` — connectors and transport
- `frontend/src/config/site.ts` — limits (description lengths, file size, log chunk size)

## Backend (optional)

The frontend works without it (documents then live in the author's browser only). To run it:

```bash
cd backend
npm install
cp .env.example .env         # set DATABASE_URL, CONTRACT_ADDRESS
npx prisma migrate dev       # creates tables
npm run dev                  # API on :4000
npm run indexer              # optional: event indexer → notifications
```

Set `NEXT_PUBLIC_API_URL=http://localhost:4000` in the frontend. Endpoints: `POST/GET /documents`, `POST/GET /escrows`, `POST /users`, `GET /notifications/:address`, `POST /notifications/:id/read`, `GET /health`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Contract not configured" | Set `NEXT_PUBLIC_CONTRACT_ADDRESS` and restart `npm run dev` |
| "Please switch to Avalanche Fuji Testnet" | Wallet is on another chain; click Switch Network (MetaMask will offer to add Fuji) |
| Transaction dialog shows "Invalid escrow state" | Someone else changed the escrow first; refresh. The message explains which state is required |
| "Insufficient AVAX" | Get Fuji AVAX from the faucet; keep some for gas |
| Events list empty / slow | Set `NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK` so scans start at deployment; public RPCs limit `eth_getLogs` ranges |
| `npm install` peer errors in frontend | Use `npm install --legacy-peer-deps` (Vite 8 / Vitest 5 peer ranges) |
| `forge` not found | `foundryup`, then add `~/.foundry/bin` to `PATH` |
| Deploy script says arbitrator == deployer | Set `ARBITRATOR_ADDRESS` for anything beyond local testing |

## Future improvements

- Buyer-approval timeout with automatic release to the seller
- On-chain `expectedAmount` enforced at funding
- Multi-arbitrator quorum / appeal window and arbitration fees
- IPFS/Arweave document storage with content addressing
- ERC-20 support (USDC on Avalanche) alongside native AVAX
- Subgraph-based indexing for large volumes
- Third-party security audit

## License

MIT

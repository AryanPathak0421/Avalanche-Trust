import type { Address, Hash, Hex } from "viem";

/** Mirrors `EscrowStatus` in AvalancheTrustEscrow.sol. Order matters. */
export enum EscrowStatus {
  Created = 0,
  Funded = 1,
  WorkSubmitted = 2,
  Completed = 3,
  Disputed = 4,
  Refunded = 5,
  Cancelled = 6,
}

export interface Escrow {
  id: bigint;
  buyer: Address;
  seller: Address;
  arbitrator: Address;
  amount: bigint;
  createdAt: number;
  fundedAt: number;
  deadline: number;
  completedAt: number;
  disputedAt: number;
  resolvedAt: number;
  status: EscrowStatus;
  agreementHash: Hex;
  workSubmissionHash: Hex;
  disputeReasonHash: Hex;
  disputeRaisedBy: Address;
}

export type EscrowRole = "buyer" | "seller" | "arbitrator" | "observer";

export type EscrowAction =
  | "fund"
  | "cancel"
  | "submitWork"
  | "approveWork"
  | "requestRefund"
  | "raiseDispute"
  | "resolveToSeller"
  | "resolveToBuyer";

export type EscrowEventName =
  | "EscrowCreated"
  | "EscrowFunded"
  | "WorkSubmitted"
  | "EscrowCompleted"
  | "DisputeRaised"
  | "DisputeResolved"
  | "EscrowRefunded"
  | "EscrowCancelled";

export interface EscrowEvent {
  name: EscrowEventName;
  escrowId: bigint;
  txHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  timestamp?: number;
  args: Record<string, string | bigint | boolean | undefined>;
}

export type StatusFilter = "all" | "active" | "completed" | "disputed" | "refunded";

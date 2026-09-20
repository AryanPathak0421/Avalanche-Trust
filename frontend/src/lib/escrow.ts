import type { Address } from "viem";
import { EscrowStatus, type Escrow, type EscrowAction, type EscrowRole, type StatusFilter } from "@/types/escrow";
import { nowSeconds } from "@/lib/format";

/** Raw tuple returned by `getEscrow`, as decoded by viem from the ABI. */
export interface RawEscrow {
  buyer: Address;
  seller: Address;
  arbitrator: Address;
  amount: bigint;
  createdAt: bigint;
  fundedAt: bigint;
  deadline: bigint;
  completedAt: bigint;
  disputedAt: bigint;
  resolvedAt: bigint;
  status: number;
  agreementHash: `0x${string}`;
  workSubmissionHash: `0x${string}`;
  disputeReasonHash: `0x${string}`;
  disputeRaisedBy: Address;
}

export function toEscrow(id: bigint, raw: RawEscrow): Escrow {
  return {
    id,
    buyer: raw.buyer,
    seller: raw.seller,
    arbitrator: raw.arbitrator,
    amount: raw.amount,
    createdAt: Number(raw.createdAt),
    fundedAt: Number(raw.fundedAt),
    deadline: Number(raw.deadline),
    completedAt: Number(raw.completedAt),
    disputedAt: Number(raw.disputedAt),
    resolvedAt: Number(raw.resolvedAt),
    status: raw.status as EscrowStatus,
    agreementHash: raw.agreementHash,
    workSubmissionHash: raw.workSubmissionHash,
    disputeReasonHash: raw.disputeReasonHash,
    disputeRaisedBy: raw.disputeRaisedBy,
  };
}

export const STATUS_LABELS: Record<EscrowStatus, string> = {
  [EscrowStatus.Created]: "Awaiting Funding",
  [EscrowStatus.Funded]: "Funded",
  [EscrowStatus.WorkSubmitted]: "Work Submitted",
  [EscrowStatus.Completed]: "Completed",
  [EscrowStatus.Disputed]: "Disputed",
  [EscrowStatus.Refunded]: "Refunded",
  [EscrowStatus.Cancelled]: "Cancelled",
};

export const ACTIVE_STATUSES = new Set([EscrowStatus.Created, EscrowStatus.Funded, EscrowStatus.WorkSubmitted]);
export const TERMINAL_STATUSES = new Set([EscrowStatus.Completed, EscrowStatus.Refunded, EscrowStatus.Cancelled]);

export function isTerminal(status: EscrowStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isLocked(status: EscrowStatus): boolean {
  return status === EscrowStatus.Funded || status === EscrowStatus.WorkSubmitted || status === EscrowStatus.Disputed;
}

export function getRole(escrow: Escrow, account: Address | undefined): EscrowRole {
  if (!account) return "observer";
  const a = account.toLowerCase();
  if (escrow.buyer.toLowerCase() === a) return "buyer";
  if (escrow.seller.toLowerCase() === a) return "seller";
  if (escrow.arbitrator.toLowerCase() === a) return "arbitrator";
  return "observer";
}

export function counterparty(escrow: Escrow, role: EscrowRole): Address {
  return role === "seller" ? escrow.buyer : escrow.seller;
}

/**
 * Pure mirror of the contract's authorization + state rules. The contract is still the
 * source of truth; this only decides which buttons to render so users never see an
 * action that would revert.
 */
export function getAvailableActions(
  escrow: Escrow,
  account: Address | undefined,
  options: { now?: number; paused?: boolean } = {},
): EscrowAction[] {
  const now = options.now ?? nowSeconds();
  if (options.paused) return [];
  const role = getRole(escrow, account);
  const actions: EscrowAction[] = [];
  const deadlinePassed = now >= escrow.deadline;

  switch (escrow.status) {
    case EscrowStatus.Created:
      if (role === "buyer") {
        if (!deadlinePassed) actions.push("fund");
        actions.push("cancel");
      }
      break;
    case EscrowStatus.Funded:
      if (role === "seller" && now <= escrow.deadline) actions.push("submitWork");
      if (role === "buyer" && deadlinePassed) actions.push("requestRefund");
      if (role === "buyer" || role === "seller") actions.push("raiseDispute");
      break;
    case EscrowStatus.WorkSubmitted:
      if (role === "buyer") actions.push("approveWork");
      if (role === "buyer" || role === "seller") actions.push("raiseDispute");
      break;
    case EscrowStatus.Disputed:
      if (role === "arbitrator") actions.push("resolveToSeller", "resolveToBuyer");
      break;
    default:
      break;
  }
  return actions;
}

export function matchesFilter(escrow: Escrow, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return ACTIVE_STATUSES.has(escrow.status);
    case "completed":
      return escrow.status === EscrowStatus.Completed;
    case "disputed":
      return escrow.status === EscrowStatus.Disputed;
    case "refunded":
      return escrow.status === EscrowStatus.Refunded || escrow.status === EscrowStatus.Cancelled;
  }
}

export function matchesSearch(escrow: Escrow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (q.replace(/^#/, "") === escrow.id.toString()) return true;
  return (
    escrow.buyer.toLowerCase().includes(q) ||
    escrow.seller.toLowerCase().includes(q) ||
    escrow.arbitrator.toLowerCase().includes(q)
  );
}

export interface EscrowStats {
  total: number;
  active: number;
  completed: number;
  disputed: number;
  valueLocked: bigint;
}

export function computeStats(escrows: Escrow[]): EscrowStats {
  return escrows.reduce<EscrowStats>(
    (acc, e) => {
      acc.total += 1;
      if (ACTIVE_STATUSES.has(e.status)) acc.active += 1;
      if (e.status === EscrowStatus.Completed) acc.completed += 1;
      if (e.status === EscrowStatus.Disputed) acc.disputed += 1;
      if (isLocked(e.status)) acc.valueLocked += e.amount;
      return acc;
    },
    { total: 0, active: 0, completed: 0, disputed: 0, valueLocked: 0n },
  );
}

/** Timeline steps for the detail page. */
export type StepState = "done" | "current" | "pending" | "failed" | "skipped";

export interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
  timestamp?: number;
}

export function buildTimeline(escrow: Escrow): TimelineStep[] {
  const s = escrow.status;
  const created: TimelineStep = { key: "created", label: "Escrow Created", state: "done", timestamp: escrow.createdAt };

  if (s === EscrowStatus.Cancelled) {
    return [
      created,
      { key: "cancelled", label: "Cancelled by buyer", state: "failed", timestamp: escrow.resolvedAt },
    ];
  }

  const funded: TimelineStep = {
    key: "funded",
    label: "Payment Funded",
    state: s === EscrowStatus.Created ? "current" : "done",
    timestamp: escrow.fundedAt || undefined,
  };

  if (s === EscrowStatus.Disputed) {
    return [
      created,
      funded,
      ...(escrow.workSubmissionHash !== ZERO
        ? [{ key: "work", label: "Work Submitted", state: "done" as StepState }]
        : []),
      { key: "disputed", label: "Dispute Raised", state: "current", timestamp: escrow.disputedAt },
      { key: "resolution", label: "Arbitrator Resolution", state: "pending" },
    ];
  }

  if (s === EscrowStatus.Refunded) {
    const viaDispute = escrow.disputeRaisedBy !== ZERO_ADDRESS;
    return [
      created,
      funded,
      ...(escrow.workSubmissionHash !== ZERO
        ? [{ key: "work", label: "Work Submitted", state: "done" as StepState }]
        : []),
      ...(viaDispute ? [{ key: "disputed", label: "Dispute Raised", state: "done" as StepState }] : []),
      {
        key: "refunded",
        label: viaDispute ? "Refunded to Buyer by Arbitrator" : "Refunded after Deadline",
        state: "done",
        timestamp: escrow.resolvedAt,
      },
    ];
  }

  if (s === EscrowStatus.Completed && escrow.disputeRaisedBy !== ZERO_ADDRESS) {
    return [
      created,
      funded,
      ...(escrow.workSubmissionHash !== ZERO
        ? [{ key: "work", label: "Work Submitted", state: "done" as StepState }]
        : []),
      { key: "disputed", label: "Dispute Raised", state: "done" },
      { key: "released", label: "Released to Seller by Arbitrator", state: "done", timestamp: escrow.resolvedAt },
    ];
  }

  const work: TimelineStep = {
    key: "work",
    label: "Work Submitted",
    state: s === EscrowStatus.Funded ? "current" : s === EscrowStatus.Created ? "pending" : "done",
  };
  const approval: TimelineStep = {
    key: "approval",
    label: "Buyer Approval",
    state: s === EscrowStatus.WorkSubmitted ? "current" : s === EscrowStatus.Completed ? "done" : "pending",
    timestamp: s === EscrowStatus.Completed ? escrow.completedAt : undefined,
  };
  const released: TimelineStep = {
    key: "released",
    label: "Payment Released",
    state: s === EscrowStatus.Completed ? "done" : "pending",
  };
  return [created, funded, work, approval, released];
}

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

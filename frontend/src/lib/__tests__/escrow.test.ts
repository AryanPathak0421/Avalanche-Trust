import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import {
  buildTimeline,
  computeStats,
  getAvailableActions,
  getRole,
  matchesFilter,
  matchesSearch,
  toEscrow,
} from "@/lib/escrow";
import { EscrowStatus, type Escrow } from "@/types/escrow";

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const ARB = "0x3333333333333333333333333333333333333333";
const STRANGER = "0x4444444444444444444444444444444444444444";
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const NOW = 1_800_000_000;

function make(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: 1n,
    buyer: BUYER,
    seller: SELLER,
    arbitrator: ARB,
    amount: parseEther("2.5"),
    createdAt: NOW - 1000,
    fundedAt: NOW - 500,
    deadline: NOW + 86_400,
    completedAt: 0,
    disputedAt: 0,
    resolvedAt: 0,
    status: EscrowStatus.Funded,
    agreementHash: "0xaa",
    workSubmissionHash: ZERO,
    disputeReasonHash: ZERO,
    disputeRaisedBy: ZERO_ADDR,
    ...overrides,
  };
}

describe("getRole", () => {
  it("identifies roles case-insensitively", () => {
    const e = make();
    expect(getRole(e, BUYER.toUpperCase() as `0x${string}`)).toBe("buyer");
    expect(getRole(e, SELLER)).toBe("seller");
    expect(getRole(e, ARB)).toBe("arbitrator");
    expect(getRole(e, STRANGER)).toBe("observer");
    expect(getRole(e, undefined)).toBe("observer");
  });
});

describe("getAvailableActions", () => {
  it("Created: buyer can fund before deadline and cancel", () => {
    const e = make({ status: EscrowStatus.Created, amount: 0n });
    expect(getAvailableActions(e, BUYER, { now: NOW })).toEqual(["fund", "cancel"]);
    expect(getAvailableActions(e, SELLER, { now: NOW })).toEqual([]);
  });

  it("Created: buyer cannot fund after deadline but can cancel", () => {
    const e = make({ status: EscrowStatus.Created, amount: 0n });
    expect(getAvailableActions(e, BUYER, { now: e.deadline })).toEqual(["cancel"]);
  });

  it("Funded: seller can submit and dispute, buyer can dispute only", () => {
    const e = make();
    expect(getAvailableActions(e, SELLER, { now: NOW })).toEqual(["submitWork", "raiseDispute"]);
    expect(getAvailableActions(e, BUYER, { now: NOW })).toEqual(["raiseDispute"]);
  });

  it("Funded after deadline: buyer can refund, seller cannot submit", () => {
    const e = make();
    expect(getAvailableActions(e, BUYER, { now: e.deadline })).toEqual(["requestRefund", "raiseDispute"]);
    expect(getAvailableActions(e, SELLER, { now: e.deadline + 1 })).toEqual(["raiseDispute"]);
  });

  it("WorkSubmitted: buyer can approve or dispute", () => {
    const e = make({ status: EscrowStatus.WorkSubmitted, workSubmissionHash: "0xbb" });
    expect(getAvailableActions(e, BUYER, { now: NOW })).toEqual(["approveWork", "raiseDispute"]);
    expect(getAvailableActions(e, SELLER, { now: NOW })).toEqual(["raiseDispute"]);
  });

  it("Disputed: only arbitrator can act", () => {
    const e = make({ status: EscrowStatus.Disputed, disputeRaisedBy: BUYER });
    expect(getAvailableActions(e, ARB, { now: NOW })).toEqual(["resolveToSeller", "resolveToBuyer"]);
    expect(getAvailableActions(e, BUYER, { now: NOW })).toEqual([]);
    expect(getAvailableActions(e, SELLER, { now: NOW })).toEqual([]);
  });

  it("terminal states expose nothing", () => {
    for (const status of [EscrowStatus.Completed, EscrowStatus.Refunded, EscrowStatus.Cancelled]) {
      expect(getAvailableActions(make({ status }), BUYER, { now: NOW })).toEqual([]);
    }
  });

  it("paused contract hides everything", () => {
    expect(getAvailableActions(make(), SELLER, { now: NOW, paused: true })).toEqual([]);
  });

  it("observers never see actions", () => {
    expect(getAvailableActions(make(), STRANGER, { now: NOW })).toEqual([]);
  });
});

describe("filters and search", () => {
  it("matchesFilter maps statuses to tabs", () => {
    expect(matchesFilter(make({ status: EscrowStatus.Created }), "active")).toBe(true);
    expect(matchesFilter(make({ status: EscrowStatus.Completed }), "active")).toBe(false);
    expect(matchesFilter(make({ status: EscrowStatus.Completed }), "completed")).toBe(true);
    expect(matchesFilter(make({ status: EscrowStatus.Disputed }), "disputed")).toBe(true);
    expect(matchesFilter(make({ status: EscrowStatus.Cancelled }), "refunded")).toBe(true);
    expect(matchesFilter(make(), "all")).toBe(true);
  });

  it("matchesSearch handles ids and addresses", () => {
    const e = make({ id: 42n });
    expect(matchesSearch(e, "42")).toBe(true);
    expect(matchesSearch(e, "#42")).toBe(true);
    expect(matchesSearch(e, "4")).toBe(false);
    expect(matchesSearch(e, "0x2222")).toBe(true);
    expect(matchesSearch(e, "0X1111")).toBe(true);
    expect(matchesSearch(e, "")).toBe(true);
  });
});

describe("computeStats", () => {
  it("aggregates counts and locked value", () => {
    const stats = computeStats([
      make({ status: EscrowStatus.Funded, amount: parseEther("1") }),
      make({ status: EscrowStatus.Disputed, amount: parseEther("2") }),
      make({ status: EscrowStatus.Completed, amount: parseEther("3") }),
      make({ status: EscrowStatus.Created, amount: 0n }),
    ]);
    expect(stats).toEqual({ total: 4, active: 2, completed: 1, disputed: 1, valueLocked: parseEther("3") });
  });
});

describe("buildTimeline", () => {
  it("happy path marks current step", () => {
    const steps = buildTimeline(make({ status: EscrowStatus.WorkSubmitted }));
    expect(steps.map((s) => `${s.key}:${s.state}`)).toEqual([
      "created:done",
      "funded:done",
      "work:done",
      "approval:current",
      "released:pending",
    ]);
  });

  it("cancelled shows failure", () => {
    const steps = buildTimeline(make({ status: EscrowStatus.Cancelled, resolvedAt: NOW }));
    expect(steps.at(-1)).toMatchObject({ key: "cancelled", state: "failed" });
  });

  it("disputed then refunded via arbitrator", () => {
    const steps = buildTimeline(make({ status: EscrowStatus.Refunded, disputeRaisedBy: BUYER, resolvedAt: NOW }));
    expect(steps.map((s) => s.key)).toEqual(["created", "funded", "disputed", "refunded"]);
    expect(steps.at(-1)?.label).toContain("Arbitrator");
  });
});

describe("toEscrow", () => {
  it("normalises bigints to numbers for timestamps", () => {
    const e = toEscrow(7n, {
      buyer: BUYER,
      seller: SELLER,
      arbitrator: ARB,
      amount: 5n,
      createdAt: 1n,
      fundedAt: 2n,
      deadline: 3n,
      completedAt: 4n,
      disputedAt: 0n,
      resolvedAt: 5n,
      status: 2,
      agreementHash: "0x01",
      workSubmissionHash: "0x02",
      disputeReasonHash: "0x03",
      disputeRaisedBy: ZERO_ADDR,
    });
    expect(e.id).toBe(7n);
    expect(e.deadline).toBe(3);
    expect(e.status).toBe(EscrowStatus.WorkSubmitted);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseEther } from "viem";
import { BUYER, SELLER, resetMockState, wagmiMock } from "@/test/wagmi-mock";
import { EscrowStatus, type Escrow } from "@/types/escrow";

vi.mock("wagmi", () => wagmiMock);

import { EscrowTable } from "@/components/escrow/escrow-table";
import { StatusBadge } from "@/components/escrow/status-badge";

const NOW = Math.floor(Date.now() / 1000);

function make(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: 7n,
    buyer: BUYER,
    seller: SELLER,
    arbitrator: "0x3333333333333333333333333333333333333333",
    amount: parseEther("4.2"),
    createdAt: NOW - 3600,
    fundedAt: NOW - 1800,
    deadline: NOW + 86_400,
    completedAt: 0,
    disputedAt: 0,
    resolvedAt: 0,
    status: EscrowStatus.WorkSubmitted,
    agreementHash: "0x01",
    workSubmissionHash: "0x02",
    disputeReasonHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    disputeRaisedBy: "0x0000000000000000000000000000000000000000",
    ...overrides,
  };
}

describe("EscrowTable", () => {
  beforeEach(() => resetMockState());

  it("renders loading skeletons", () => {
    const { container } = render(<EscrowTable escrows={[]} isLoading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders the empty state", () => {
    render(<EscrowTable escrows={[]} emptyTitle="Nothing here" emptyText="Create one" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Create one")).toBeInTheDocument();
  });

  it("renders rows (desktop) and cards (mobile) with role, status and action hint", () => {
    render(<EscrowTable escrows={[make()]} />);
    // Both layouts are in the DOM; CSS decides visibility.
    expect(screen.getAllByText("#7").length).toBe(2);
    expect(screen.getAllByText("buyer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4.20 AVAX").length).toBe(2);
    expect(screen.getAllByText("Work Submitted").length).toBe(2);
    expect(screen.getAllByText("Action required").length).toBe(2);
    expect(screen.getByRole("link", { name: /open escrow 7/i })).toHaveAttribute("href", "/escrow/7");
  });

  it("shows no action hint for observers", () => {
    render(<EscrowTable escrows={[make({ buyer: "0x5555555555555555555555555555555555555555" })]} />);
    expect(screen.queryByText("Action required")).not.toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("labels every status", () => {
    render(
      <>
        <StatusBadge status={EscrowStatus.Created} />
        <StatusBadge status={EscrowStatus.Disputed} />
        <StatusBadge status={EscrowStatus.Refunded} />
      </>,
    );
    expect(screen.getByText("Awaiting Funding")).toBeInTheDocument();
    expect(screen.getByText("Disputed")).toBeInTheDocument();
    expect(screen.getByText("Refunded")).toBeInTheDocument();
  });
});

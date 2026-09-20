import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseEther } from "viem";
import { BUYER, SELLER, resetMockState, wagmiMock } from "@/test/wagmi-mock";
import { EscrowStatus, type Escrow } from "@/types/escrow";

vi.mock("wagmi", () => wagmiMock);

import { DisputeDialog } from "@/components/escrow/dispute-dialog";

const escrow: Escrow = {
  id: 1024n,
  buyer: BUYER,
  seller: SELLER,
  arbitrator: "0x3333333333333333333333333333333333333333",
  amount: parseEther("4.2"),
  createdAt: 1,
  fundedAt: 2,
  deadline: 9_999_999_999,
  completedAt: 0,
  disputedAt: 0,
  resolvedAt: 0,
  status: EscrowStatus.Funded,
  agreementHash: "0x01",
  workSubmissionHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  disputeReasonHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  disputeRaisedBy: "0x0000000000000000000000000000000000000000",
};

describe("DisputeDialog", () => {
  beforeEach(() => resetMockState());

  it("requires a reason before continuing", async () => {
    const user = userEvent.setup();
    render(<DisputeDialog escrow={escrow} open onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/raise dispute · escrow #1024/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
  });

  it("hashes the reason, shows a confirmation step, and emits the hash", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DisputeDialog escrow={escrow} open onOpenChange={() => {}} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText(/reason/i), "The deliverable does not match the agreed scope.");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/this locks the escrow/i)).toBeInTheDocument();
    expect(screen.getByText("4.20 AVAX")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirm dispute/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

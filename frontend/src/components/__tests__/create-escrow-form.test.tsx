import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BUYER, SELLER, resetMockState, wagmiMock } from "@/test/wagmi-mock";

vi.mock("wagmi", () => wagmiMock);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-contract-status", () => ({
  useContractPaused: () => ({ paused: false }),
  useAccountRoles: () => ({ isArbitrator: false }),
}));
const send = vi.fn();
vi.mock("@/hooks/use-contract-tx", () => ({
  useContractTx: () => ({ state: { phase: "idle" }, send, reset: vi.fn(), isBusy: false }),
}));

import { CreateEscrowForm } from "@/components/escrow/create-escrow-form";

function renderForm() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <CreateEscrowForm />
    </QueryClientProvider>,
  );
}

describe("CreateEscrowForm", () => {
  beforeEach(() => {
    resetMockState();
    send.mockReset();
  });

  it("validates address, amount, and description", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/seller wallet address/i), "not-an-address");
    await user.type(screen.getByLabelText(/amount/i), "0");
    await user.type(screen.getByLabelText(/agreement description/i), "short");
    await user.click(screen.getByRole("button", { name: /review escrow/i }));

    expect(await screen.findByText(/valid avalanche/i)).toBeInTheDocument();
    expect(screen.getByText(/greater than 0 avax/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects the buyer's own wallet as seller", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/seller wallet address/i), BUYER);
    await user.type(screen.getByLabelText(/amount/i), "1");
    await user.type(screen.getByLabelText(/agreement description/i), "A perfectly fine description");
    await user.click(screen.getByRole("button", { name: /review escrow/i }));
    expect(await screen.findByText(/cannot be your own wallet/i)).toBeInTheDocument();
  });

  it("opens the confirmation modal with the summarised deal and sends createEscrow", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/seller wallet address/i), SELLER);
    await user.type(screen.getByLabelText(/amount/i), "2.5");
    await user.type(screen.getByLabelText(/agreement description/i), "Design a landing page with three revisions.");
    await user.click(screen.getByRole("button", { name: /review escrow/i }));

    expect(await screen.findByText(/you are about to create an escrow/i)).toBeInTheDocument();
    expect(screen.getByText("2.5 AVAX (deposited in the next step)")).toBeInTheDocument();
    expect(screen.getByText("Avalanche Fuji")).toBeInTheDocument();
    expect(screen.getByText(/0x2222…2222|0x222222…222222/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const req = send.mock.calls[0][0];
    expect(req.functionName).toBe("createEscrow");
    expect(req.args[0]).toBe(SELLER);
    expect(typeof req.args[1]).toBe("bigint");
    expect(req.args[2]).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

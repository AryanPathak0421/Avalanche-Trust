import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionDialog } from "@/components/transaction/transaction-dialog";
import type { TxState } from "@/hooks/use-contract-tx";

const HASH = "0x83aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa91a" as const;

function renderDialog(state: TxState, extra: Partial<React.ComponentProps<typeof TransactionDialog>> = {}) {
  return render(
    <TransactionDialog
      open
      onOpenChange={() => {}}
      state={state}
      title="Fund escrow"
      successMessage="2.50 AVAX funded successfully"
      {...extra}
    />,
  );
}

describe("TransactionDialog", () => {
  it("shows wallet confirmation prompt", () => {
    renderDialog({ phase: "confirming", gasEstimate: 52_000n });
    expect(screen.getByText(/confirm transaction in your wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/estimated gas: 52000/i)).toBeInTheDocument();
  });

  it("shows pending state with hash link", () => {
    renderDialog({ phase: "pending", hash: HASH });
    expect(screen.getByText(/transaction pending/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for avalanche confirmation/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /0x83aaaa/i });
    expect(link).toHaveAttribute("href", `https://testnet.snowtrace.io/tx/${HASH}`);
  });

  it("shows success with explorer link and block", () => {
    renderDialog({
      phase: "success",
      hash: HASH,
      receipt: { blockNumber: 1234n, gasUsed: 51_000n, status: "success" } as never,
    });
    expect(screen.getByText(/transaction confirmed/i)).toBeInTheDocument();
    expect(screen.getByText("2.50 AVAX funded successfully")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view on avalanche explorer/i })).toHaveAttribute(
      "href",
      `https://testnet.snowtrace.io/tx/${HASH}`,
    );
    expect(screen.getByRole("link", { name: "1234" })).toBeInTheDocument();
  });

  it("shows human-readable error and retry for retryable failures", () => {
    const onRetry = vi.fn();
    renderDialog(
      {
        phase: "error",
        error: {
          code: "UserRejectedRequest",
          title: "Transaction rejected",
          message: "You rejected the request in your wallet. Nothing was sent.",
          retryable: true,
          raw: "execution reverted: 0xdeadbeef",
        },
      },
      { onRetry },
    );
    expect(screen.getByText("Transaction rejected")).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("hides retry for non-retryable errors", () => {
    renderDialog({
      phase: "error",
      error: { code: "InvalidStatus", title: "Invalid escrow state", message: "Nope", retryable: false },
    });
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});

"use client";

import { useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { formatEther, type Hex } from "viem";
import { Ban, CheckCircle2, Coins, Gavel, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransactionDialog } from "@/components/transaction/transaction-dialog";
import { DisputeDialog } from "@/components/escrow/dispute-dialog";
import { SubmitWorkDialog } from "@/components/escrow/submit-work-dialog";
import { useContractTx, type TxRequest } from "@/hooks/use-contract-tx";
import { useContractPaused } from "@/hooks/use-contract-status";
import { getAvailableActions, getRole } from "@/lib/escrow";
import { formatAvax, formatDate, isPast, parseAvax } from "@/lib/format";
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK } from "@/config/chains";
import { EscrowStatus, type Escrow, type EscrowAction } from "@/types/escrow";

interface EscrowActionsProps {
  escrow: Escrow;
  /** Suggested amount (from the off-chain agreement) when funding. */
  suggestedAmount?: string;
  onChanged?: () => void;
}

interface PendingAction {
  action: EscrowAction;
  request: TxRequest;
  title: string;
  success: string;
  confirmText?: string;
  variant?: "default" | "destructive" | "success";
}

export function EscrowActions({ escrow, suggestedAmount, onChanged }: EscrowActionsProps) {
  const { address } = useAccount();
  const { paused } = useContractPaused();
  const tx = useContractTx();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState(suggestedAmount ?? "");
  const [fundError, setFundError] = useState<string | null>(null);
  const { data: balance } = useBalance({ address, chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address } });

  const role = getRole(escrow, address);
  const actions = getAvailableActions(escrow, address, { paused });
  const id = escrow.id;

  function queue(action: PendingAction) {
    setPending(action);
    setConfirmOpen(true);
  }

  async function execute(action: PendingAction) {
    setConfirmOpen(false);
    setTxOpen(true);
    const receipt = await tx.send(action.request);
    if (receipt?.status === "success") onChanged?.();
  }

  function openFund() {
    setFundAmount(suggestedAmount ?? "");
    setFundError(null);
    setFundOpen(true);
  }

  function submitFund() {
    let value: bigint;
    try {
      value = parseAvax(fundAmount);
    } catch {
      setFundError("Enter a valid AVAX amount.");
      return;
    }
    if (value <= 0n) {
      setFundError("Amount must be greater than zero.");
      return;
    }
    if (balance && value >= balance.value) {
      setFundError(
        `Insufficient balance. You have ${formatAvax(balance.value)}; you need ${formatAvax(value)} plus gas.`,
      );
      return;
    }
    setFundOpen(false);
    queue({
      action: "fund",
      title: "Fund escrow",
      success: `${formatAvax(value)} funded successfully`,
      confirmText: `You are about to lock ${formatAvax(value)} in escrow #${id.toString()} on ${ACTIVE_NETWORK.name}. Funds are only released by buyer approval, a deadline refund or arbitration.`,
      request: { functionName: "fundEscrow", args: [id], value, context: "fund" },
    });
  }

  const buttons: Record<EscrowAction, () => void> = {
    fund: openFund,
    cancel: () =>
      queue({
        action: "cancel",
        title: "Cancel escrow",
        success: "Escrow cancelled",
        confirmText: "This permanently cancels the unfunded escrow. No funds are involved.",
        variant: "destructive",
        request: { functionName: "cancelEscrow", args: [id], context: "cancel" },
      }),
    submitWork: () => setWorkOpen(true),
    approveWork: () =>
      queue({
        action: "approveWork",
        title: "Approve work & release payment",
        success: `${formatAvax(escrow.amount)} released to seller`,
        confirmText: `Approving releases ${formatAvax(escrow.amount)} to the seller immediately. This cannot be undone.`,
        variant: "success",
        request: { functionName: "approveWork", args: [id], context: "approveWork" },
      }),
    requestRefund: () =>
      queue({
        action: "requestRefund",
        title: "Request refund",
        success: `${formatAvax(escrow.amount)} refunded to your wallet`,
        confirmText: `The deadline (${formatDate(escrow.deadline)}) passed without a submission. ${formatAvax(escrow.amount)} will be returned to you.`,
        request: { functionName: "requestRefund", args: [id], context: "requestRefund" },
      }),
    raiseDispute: () => setDisputeOpen(true),
    resolveToSeller: () =>
      queue({
        action: "resolveToSeller",
        title: "Release to seller",
        success: `${formatAvax(escrow.amount)} released to seller`,
        confirmText: `As arbitrator you are ruling in favour of the seller. ${formatAvax(escrow.amount)} will be sent to the seller.`,
        variant: "success",
        request: { functionName: "resolveDispute", args: [id, true], context: "resolveDispute" },
      }),
    resolveToBuyer: () =>
      queue({
        action: "resolveToBuyer",
        title: "Release to buyer",
        success: `${formatAvax(escrow.amount)} refunded to buyer`,
        confirmText: `As arbitrator you are ruling in favour of the buyer. ${formatAvax(escrow.amount)} will be refunded to the buyer.`,
        request: { functionName: "resolveDispute", args: [id, false], context: "resolveDispute" },
      }),
  };

  const LABELS: Record<EscrowAction, { label: string; icon: React.ReactNode; variant?: "default" | "outline" | "destructive" | "success" | "secondary" }> = {
    fund: { label: "Deposit AVAX", icon: <Coins /> },
    cancel: { label: "Cancel Escrow", icon: <Ban />, variant: "outline" },
    submitWork: { label: "Submit Work", icon: <Upload /> },
    approveWork: { label: "Approve & Release", icon: <CheckCircle2 />, variant: "success" },
    requestRefund: { label: "Request Refund", icon: <RotateCcw /> },
    raiseDispute: { label: "Raise Dispute", icon: <Gavel />, variant: "outline" },
    resolveToSeller: { label: "Release to Seller", icon: <CheckCircle2 />, variant: "success" },
    resolveToBuyer: { label: "Release to Buyer", icon: <RotateCcw />, variant: "destructive" },
  };

  return (
    <div className="flex flex-col gap-3">
      {paused && (
        <Alert variant="warning">
          <AlertTitle>Contract paused</AlertTitle>
          <AlertDescription>Actions are disabled until the administrator resumes the contract.</AlertDescription>
        </Alert>
      )}
      {!address && <p className="text-sm text-muted-foreground">Connect your wallet to act on this escrow.</p>}
      {address && role === "observer" && (
        <p className="text-sm text-muted-foreground">You are viewing this escrow as an observer. No actions available.</p>
      )}
      {address && role !== "observer" && actions.length === 0 && !paused && (
        <p className="text-sm text-muted-foreground">{idleMessage(escrow, role)}</p>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a} variant={LABELS[a].variant} onClick={buttons[a]} disabled={tx.isBusy}>
              {LABELS[a].icon}
              {LABELS[a].label}
            </Button>
          ))}
        </div>
      )}

      {/* Fund amount dialog */}
      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit AVAX into escrow #{id.toString()}</DialogTitle>
            <DialogDescription>
              Deadline {formatDate(escrow.deadline)}. Wallet balance: {formatAvax(balance?.value)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fund-amount">Amount (AVAX)</Label>
            <Input
              id="fund-amount"
              inputMode="decimal"
              placeholder="2.50"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              aria-invalid={!!fundError}
            />
            {fundError && <p className="text-xs text-destructive">{fundError}</p>}
            {balance && (
              <p className="text-xs text-muted-foreground">
                Max usable: about {Number(formatEther(balance.value)).toFixed(4)} AVAX minus gas.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitFund}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generic confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            <DialogDescription>Network: {ACTIVE_NETWORK.name}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">{pending?.confirmText}</p>
          <p className="text-xs text-muted-foreground">Gas is estimated by your wallet before you sign.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button variant={pending?.variant ?? "default"} onClick={() => pending && execute(pending)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DisputeDialog
        escrow={escrow}
        open={disputeOpen}
        onOpenChange={setDisputeOpen}
        onConfirm={(reasonHash: Hex) => {
          setDisputeOpen(false);
          void execute({
            action: "raiseDispute",
            title: "Raise dispute",
            success: "Dispute raised. Funds are locked pending arbitration.",
            request: { functionName: "raiseDispute", args: [id, reasonHash], context: "raiseDispute" },
          });
        }}
      />

      <SubmitWorkDialog
        escrow={escrow}
        open={workOpen}
        onOpenChange={setWorkOpen}
        onConfirm={(workHash: Hex) => {
          setWorkOpen(false);
          void execute({
            action: "submitWork",
            title: "Submit work",
            success: "Work submitted. Waiting for buyer approval.",
            request: { functionName: "submitWork", args: [id, workHash], context: "submitWork" },
          });
        }}
      />

      <TransactionDialog
        open={txOpen}
        onOpenChange={(o) => {
          setTxOpen(o);
          if (!o) tx.reset();
        }}
        state={tx.state}
        title={pending?.title ?? "Transaction"}
        successMessage={pending?.success ?? "Done"}
        onRetry={() => pending && execute(pending)}
      />
    </div>
  );
}

function idleMessage(escrow: Escrow, role: "buyer" | "seller" | "arbitrator"): string {
  switch (escrow.status) {
    case EscrowStatus.Created:
      return role === "seller"
        ? "Waiting for the buyer to deposit AVAX."
        : isPast(escrow.deadline)
          ? "The deadline passed before funding. You can still cancel this escrow."
          : "Waiting for funding.";
    case EscrowStatus.Funded:
      return role === "buyer"
        ? `Waiting for the seller to submit work before ${formatDate(escrow.deadline)}.`
        : isPast(escrow.deadline)
          ? "The deadline has passed; work can no longer be submitted. The buyer may request a refund."
          : "Waiting.";
    case EscrowStatus.WorkSubmitted:
      return role === "seller" ? "Waiting for the buyer to approve your work." : "Waiting.";
    case EscrowStatus.Disputed:
      return role === "arbitrator" ? "Waiting." : "Under review by the arbitrator. Funds remain locked.";
    case EscrowStatus.Completed:
      return "This escrow is complete. Payment was released to the seller.";
    case EscrowStatus.Refunded:
      return "This escrow was refunded to the buyer.";
    case EscrowStatus.Cancelled:
      return "This escrow was cancelled before funding.";
  }
}

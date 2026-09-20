"use client";

import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TxHashLink } from "@/components/transaction/tx-hash-link";
import { getExplorerBlockUrl, getExplorerTxUrl } from "@/lib/explorer";
import { ACTIVE_NETWORK } from "@/config/chains";
import type { TxState } from "@/hooks/use-contract-tx";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: TxState;
  title: string;
  /** Short human sentence describing what succeeded, e.g. "2.50 AVAX funded successfully". */
  successMessage: string;
  onRetry?: () => void;
  onDone?: () => void;
}

export function TransactionDialog({
  open,
  onOpenChange,
  state,
  title,
  successMessage,
  onRetry,
  onDone,
}: TransactionDialogProps) {
  const busy = state.phase === "estimating" || state.phase === "confirming" || state.phase === "pending";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent hideClose={busy} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Network: {ACTIVE_NETWORK.name}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4 text-center">
          {state.phase === "estimating" && (
            <>
              <Loader2 className="size-10 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Simulating transaction and estimating gas…</p>
            </>
          )}

          {state.phase === "confirming" && (
            <>
              <Wallet className="size-10 text-primary" />
              <div>
                <p className="font-medium">Confirm transaction in your wallet.</p>
                {state.gasEstimate !== undefined && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estimated gas: {state.gasEstimate.toString()} units (estimate only, final fee set by network)
                  </p>
                )}
              </div>
            </>
          )}

          {state.phase === "pending" && (
            <>
              <Loader2 className="size-10 animate-spin text-primary" />
              <div>
                <p className="font-medium">Transaction pending…</p>
                <p className="text-sm text-muted-foreground">Waiting for Avalanche confirmation.</p>
              </div>
              {state.hash && <TxHashLink hash={state.hash} />}
            </>
          )}

          {state.phase === "success" && (
            <>
              <CheckCircle2 className="size-12 text-success" />
              <div>
                <p className="text-lg font-semibold">Transaction confirmed ✓</p>
                <p className="mt-1 text-sm text-muted-foreground">{successMessage}</p>
              </div>
              <dl className="w-full rounded-md border border-border bg-muted/40 p-3 text-left text-xs">
                {state.hash && (
                  <div className="flex items-center justify-between gap-2 py-1">
                    <dt className="text-muted-foreground">Tx</dt>
                    <dd>
                      <TxHashLink hash={state.hash} />
                    </dd>
                  </div>
                )}
                {state.receipt && (
                  <div className="flex items-center justify-between gap-2 py-1">
                    <dt className="text-muted-foreground">Block</dt>
                    <dd>
                      <a
                        className="font-mono text-primary hover:underline"
                        href={getExplorerBlockUrl(state.receipt.blockNumber)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {state.receipt.blockNumber.toString()}
                      </a>
                    </dd>
                  </div>
                )}
                {state.receipt && (
                  <div className="flex items-center justify-between gap-2 py-1">
                    <dt className="text-muted-foreground">Gas used</dt>
                    <dd className="font-mono">{state.receipt.gasUsed.toString()}</dd>
                  </div>
                )}
              </dl>
            </>
          )}

          {state.phase === "error" && state.error && (
            <>
              <XCircle className="size-12 text-destructive" />
              <div>
                <p className="text-lg font-semibold">{state.error.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{state.error.message}</p>
              </div>
              {state.hash && <TxHashLink hash={state.hash} />}
              {state.error.raw && (
                <details className="w-full text-left">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Technical details</summary>
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap break-all">
                    {state.error.raw.slice(0, 1200)}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {state.phase === "success" && (
            <>
              {state.hash && (
                <Button variant="outline" asChild>
                  <a href={getExplorerTxUrl(state.hash)} target="_blank" rel="noopener noreferrer">
                    View on Avalanche Explorer
                  </a>
                </Button>
              )}
              <Button onClick={onDone ?? (() => onOpenChange(false))}>Done</Button>
            </>
          )}
          {state.phase === "error" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {state.error?.retryable && onRetry && <Button onClick={onRetry}>Try again</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

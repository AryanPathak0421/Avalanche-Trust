"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ArrowRight, CheckCircle2, Gavel, Lock, RotateCcw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NetworkGuard } from "@/components/wallet/network-guard";
import { AddressDisplay } from "@/components/transaction/address-display";
import { TransactionDialog } from "@/components/transaction/transaction-dialog";
import { DocumentViewer } from "@/components/escrow/document-viewer";
import { StatusBadge } from "@/components/escrow/status-badge";
import { useAccountRoles, useContractPaused } from "@/hooks/use-contract-status";
import { useDisputedEscrows } from "@/hooks/use-escrows";
import { useContractTx } from "@/hooks/use-contract-tx";
import { formatAvax, formatDate, formatRelative } from "@/lib/format";
import { ACTIVE_NETWORK } from "@/config/chains";
import type { Escrow } from "@/types/escrow";

interface Decision {
  escrow: Escrow;
  releaseToSeller: boolean;
}

function ArbitratorContent() {
  const { address } = useAccount();
  const { isArbitrator, isLoading: rolesLoading } = useAccountRoles();
  const { paused } = useContractPaused();
  const { open, resolved, isLoading, refetch } = useDisputedEscrows(isArbitrator ? address : undefined);
  const tx = useContractTx();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);

  const valueUnderDispute = useMemo(() => open.reduce((acc, e) => acc + e.amount, 0n), [open]);

  async function execute(d: Decision) {
    setConfirmOpen(false);
    setTxOpen(true);
    const receipt = await tx.send({
      functionName: "resolveDispute",
      args: [d.escrow.id, d.releaseToSeller],
      context: "resolveDispute",
    });
    if (receipt?.status === "success") await refetch();
  }

  if (rolesLoading) return <Skeleton className="h-40 w-full" />;

  if (!isArbitrator) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <ShieldOff className="size-10 text-muted-foreground" />
          <h3 className="font-semibold">Arbitrator access only</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            The connected wallet does not hold the ARBITRATOR_ROLE on the escrow contract. Access is enforced
            on-chain; this page only mirrors it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Open Disputes", value: open.length.toString(), icon: Gavel },
          { label: "Resolved Disputes", value: resolved.length.toString(), icon: CheckCircle2 },
          { label: "Total Value Under Dispute", value: formatAvax(valueUnderDispute), icon: Lock },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <Icon className="size-4" />
              </div>
              {isLoading ? <Skeleton className="h-7 w-20" /> : <span className="text-2xl font-semibold">{value}</span>}
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Open disputes</h2>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && open.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">No open disputes assigned to you.</CardContent>
          </Card>
        )}
        {open.map((e) => (
          <Card key={e.id.toString()} className="border-destructive/30">
            <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/escrow/${e.id.toString()}`} className="font-semibold hover:underline">
                    Escrow #{e.id.toString()}
                  </Link>
                  <Badge variant="destructive">UNDER REVIEW</Badge>
                  <span className="text-xs text-muted-foreground">Raised {formatRelative(e.disputedAt)}</span>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Buyer</dt>
                    <dd>
                      <AddressDisplay address={e.buyer} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Seller</dt>
                    <dd>
                      <AddressDisplay address={e.seller} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Amount</dt>
                    <dd className="font-semibold">{formatAvax(e.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Raised by</dt>
                    <dd>
                      <AddressDisplay address={e.disputeRaisedBy} withExplorer={false} />
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({e.disputeRaisedBy.toLowerCase() === e.buyer.toLowerCase() ? "buyer" : "seller"})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Deadline</dt>
                    <dd>{formatDate(e.deadline)}</dd>
                  </div>
                </dl>
                <div className="grid gap-3 md:grid-cols-2">
                  <DocumentViewer hash={e.agreementHash} title="Agreement" />
                  <DocumentViewer hash={e.disputeReasonHash} title="Dispute reason" />
                  <DocumentViewer hash={e.workSubmissionHash} title="Work submission" emptyText="No work was submitted." />
                </div>
              </div>
              <div className="flex flex-row gap-2 lg:flex-col">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={paused || tx.isBusy}
                  onClick={() => {
                    setDecision({ escrow: e, releaseToSeller: false });
                    setConfirmOpen(true);
                  }}
                >
                  <RotateCcw /> Release to Buyer
                </Button>
                <Button
                  variant="success"
                  className="flex-1"
                  disabled={paused || tx.isBusy}
                  onClick={() => {
                    setDecision({ escrow: e, releaseToSeller: true });
                    setConfirmOpen(true);
                  }}
                >
                  <CheckCircle2 /> Release to Seller
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Resolved disputes</h2>
        {!isLoading && resolved.length === 0 && <p className="text-sm text-muted-foreground">Nothing resolved yet.</p>}
        {resolved.map((e) => (
          <Card key={e.id.toString()}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">Escrow #{e.id.toString()}</span>
                <StatusBadge status={e.status} />
                <span className="text-muted-foreground">{formatAvax(e.amount)}</span>
                <span className="text-muted-foreground">Resolved {formatDate(e.resolvedAt)}</span>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/escrow/${e.id.toString()}`}>
                  View <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm resolution</DialogTitle>
            <DialogDescription>Network: {ACTIVE_NETWORK.name}. This ruling is final and executes immediately.</DialogDescription>
          </DialogHeader>
          {decision && (
            <p className="text-sm">
              Release <strong>{formatAvax(decision.escrow.amount)}</strong> from escrow #{decision.escrow.id.toString()} to the{" "}
              <strong>{decision.releaseToSeller ? "seller" : "buyer"}</strong> (
              <span className="font-mono">{(decision.releaseToSeller ? decision.escrow.seller : decision.escrow.buyer).slice(0, 10)}…</span>
              )?
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant={decision?.releaseToSeller ? "success" : "destructive"} onClick={() => decision && execute(decision)}>
              Confirm ruling
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionDialog
        open={txOpen}
        onOpenChange={(o) => {
          setTxOpen(o);
          if (!o) tx.reset();
        }}
        state={tx.state}
        title="Resolve dispute"
        successMessage={
          decision
            ? `${formatAvax(decision.escrow.amount)} released to the ${decision.releaseToSeller ? "seller" : "buyer"}`
            : "Resolved"
        }
        onRetry={() => decision && execute(decision)}
      />
    </div>
  );
}

export default function ArbitratorPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Arbitrator Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rulings can only send locked funds to the buyer or the seller of the disputed escrow.
        </p>
      </div>
      <NetworkGuard title="Connect the arbitrator wallet">
        <ArbitratorContent />
      </NetworkGuard>
    </div>
  );
}

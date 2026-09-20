"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ArrowRight, Gavel, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NetworkGuard } from "@/components/wallet/network-guard";
import { AddressDisplay } from "@/components/transaction/address-display";
import { StatusBadge } from "@/components/escrow/status-badge";
import { useMyEscrows } from "@/hooks/use-escrows";
import { useAccountRoles } from "@/hooks/use-contract-status";
import { formatAvax, formatRelative } from "@/lib/format";
import { EscrowStatus, type Escrow } from "@/types/escrow";

function DisputeCard({ escrow }: { escrow: Escrow }) {
  const resolved = escrow.status !== EscrowStatus.Disputed;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Dispute · Escrow #{escrow.id.toString()}</span>
            {resolved ? <StatusBadge status={escrow.status} /> : <Badge variant="destructive">UNDER REVIEW</Badge>}
          </div>
          <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <span>
              Raised by <AddressDisplay address={escrow.disputeRaisedBy} withExplorer={false} withCopy={false} />
            </span>
            <span>Amount {formatAvax(escrow.amount)}</span>
            <span>Reason: available through verified document hash</span>
            <span>
              {resolved ? `Resolved ${formatRelative(escrow.resolvedAt)}` : `Arbitrator ${escrow.arbitrator.slice(0, 8)}…`}
            </span>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/escrow/${escrow.id.toString()}`}>
            View escrow <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DisputesContent() {
  const { escrows, isLoading } = useMyEscrows();
  const { isArbitrator } = useAccountRoles();
  const disputes = useMemo(
    () => escrows.filter((e) => e.disputeRaisedBy !== "0x0000000000000000000000000000000000000000"),
    [escrows],
  );
  const open = disputes.filter((e) => e.status === EscrowStatus.Disputed);
  const closed = disputes.filter((e) => e.status !== EscrowStatus.Disputed);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (disputes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <ShieldAlert className="size-10 text-muted-foreground" />
          <h3 className="font-semibold">No disputes</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            None of your escrows are disputed. A dispute can be raised from an escrow&apos;s detail page while it is
            funded or work has been submitted.
          </p>
          {isArbitrator && (
            <Button variant="outline" asChild>
              <Link href="/arbitrator">
                <Gavel /> Open arbitrator dashboard
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Open ({open.length})</h2>
        {open.length === 0 && <p className="text-sm text-muted-foreground">No open disputes.</p>}
        {open.map((e) => (
          <DisputeCard key={e.id.toString()} escrow={e} />
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Resolved ({closed.length})</h2>
        {closed.length === 0 && <p className="text-sm text-muted-foreground">No resolved disputes.</p>}
        {closed.map((e) => (
          <DisputeCard key={e.id.toString()} escrow={e} />
        ))}
      </section>
    </div>
  );
}

export default function DisputesPage() {
  const { address } = useAccount();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Disputes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Disputes involving {address ? "your wallet" : "you"}. Funds stay locked in the contract until an arbitrator rules.
        </p>
      </div>
      <NetworkGuard>
        <DisputesContent />
      </NetworkGuard>
    </div>
  );
}

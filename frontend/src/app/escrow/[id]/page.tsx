"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/escrow/status-badge";
import { EscrowTimeline } from "@/components/escrow/escrow-timeline";
import { EscrowActions } from "@/components/escrow/escrow-actions";
import { EscrowEvents } from "@/components/escrow/escrow-events";
import { DocumentViewer } from "@/components/escrow/document-viewer";
import { AddressDisplay } from "@/components/transaction/address-display";
import { useEscrow } from "@/hooks/use-escrows";
import { getRole } from "@/lib/escrow";
import { formatAvax, formatDate, formatRelative, isPast } from "@/lib/format";
import { parseContractError } from "@/lib/errors";
import { isZeroHash } from "@/lib/hashing";
import { getExplorerAddressUrl } from "@/lib/explorer";
import { ACTIVE_CHAIN_ID } from "@/config/chains";
import { CONTRACT_ADDRESS, IS_CONTRACT_CONFIGURED } from "@/config/contract";
import { EscrowStatus } from "@/types/escrow";

function parseId(raw: string): bigint | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const id = BigInt(raw);
  return id > 0n ? id : undefined;
}

export default function EscrowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = parseId(rawId);
  const { address } = useAccount();
  const { escrow, isLoading, isError, error, refetch, isFetching } = useEscrow(id);
  const [suggestedAmount, setSuggestedAmount] = useState<string | undefined>();

  useEffect(() => {
    if (id === undefined) return;
    try {
      setSuggestedAmount(window.localStorage.getItem(`avalanchetrust:amount:${ACTIVE_CHAIN_ID}:${id.toString()}`) ?? undefined);
    } catch {
      setSuggestedAmount(undefined);
    }
  }, [id]);

  if (!IS_CONTRACT_CONFIGURED) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="warning">
          <AlertTitle>Contract not configured</AlertTitle>
          <AlertDescription>Set NEXT_PUBLIC_CONTRACT_ADDRESS to view escrows.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (id === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Invalid escrow ID</AlertTitle>
          <AlertDescription>Escrow IDs are positive integers, e.g. /escrow/12.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const role = escrow ? getRole(escrow, address) : "observer";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft /> Back to dashboard
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      )}

      {isError && (
        <Alert variant="warning">
          <AlertTitle>Could not load escrow #{id.toString()}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{parseContractError(error).message}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {escrow && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-2xl">Escrow #{escrow.id.toString()}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Created {formatDate(escrow.createdAt)} · You are{" "}
                    <span className="font-medium text-foreground">
                      {role === "observer" ? "an observer" : `the ${role}`}
                    </span>
                  </p>
                </div>
                <StatusBadge status={escrow.status} className="text-sm" />
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Field label="Amount">
                  <span className="text-xl font-semibold">{escrow.amount > 0n ? formatAvax(escrow.amount) : "Not funded yet"}</span>
                  {escrow.amount === 0n && suggestedAmount && (
                    <span className="text-xs text-muted-foreground">Agreed: {suggestedAmount} AVAX</span>
                  )}
                </Field>
                <Field label="Deadline">
                  <span className="font-medium">{formatDate(escrow.deadline)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(escrow.deadline)}
                    {isPast(escrow.deadline) && escrow.status === EscrowStatus.Funded && (
                      <Badge variant="warning" className="ml-2">
                        Refund available
                      </Badge>
                    )}
                  </span>
                </Field>
                <Field label="Buyer">
                  <AddressDisplay address={escrow.buyer} />
                </Field>
                <Field label="Seller">
                  <AddressDisplay address={escrow.seller} />
                </Field>
                <Field label="Arbitrator">
                  <AddressDisplay address={escrow.arbitrator} />
                </Field>
                <Field label="Contract">
                  {CONTRACT_ADDRESS && (
                    <a
                      href={getExplorerAddressUrl(CONTRACT_ADDRESS)}
                      className="font-mono text-sm text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Snowtrace
                    </a>
                  )}
                </Field>
                {escrow.fundedAt > 0 && (
                  <Field label="Funded">
                    <span>{formatDate(escrow.fundedAt)}</span>
                  </Field>
                )}
                {escrow.resolvedAt > 0 && (
                  <Field label="Closed">
                    <span>{formatDate(escrow.resolvedAt)}</span>
                  </Field>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <EscrowActions escrow={escrow} suggestedAmount={suggestedAmount} onChanged={() => refetch()} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <DocumentViewer hash={escrow.agreementHash} title="Agreement" emptyText="No agreement hash was recorded." />
                <DocumentViewer
                  hash={escrow.workSubmissionHash}
                  title="Work submission"
                  emptyText="The seller has not submitted work yet."
                />
                {!isZeroHash(escrow.disputeReasonHash) && (
                  <DocumentViewer hash={escrow.disputeReasonHash} title="Dispute reason" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <EscrowEvents escrowId={escrow.id} />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <EscrowTimeline escrow={escrow} />
              </CardContent>
            </Card>
            {escrow.status === EscrowStatus.Disputed && (
              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="text-base">Dispute</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Raised by </span>
                    <AddressDisplay address={escrow.disputeRaisedBy} withExplorer={false} />
                  </p>
                  <p>
                    <span className="text-muted-foreground">Status </span>
                    <Badge variant="destructive">UNDER REVIEW</Badge>
                  </p>
                  <p className="text-muted-foreground">
                    Funds stay locked until the arbitrator releases them to the buyer or the seller.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

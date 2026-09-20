"use client";

import { Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TxHashLink } from "@/components/transaction/tx-hash-link";
import { useEscrowEvents } from "@/hooks/use-escrow-events";
import { formatAvax, formatDate, shortAddress, shortHash } from "@/lib/format";
import { parseContractError } from "@/lib/errors";
import type { EscrowEvent } from "@/types/escrow";

function describe(ev: EscrowEvent): string {
  const a = ev.args;
  switch (ev.name) {
    case "EscrowCreated":
      return `Escrow created by ${shortAddress(String(a.buyer))} for seller ${shortAddress(String(a.seller))}`;
    case "EscrowFunded":
      return `Funded with ${formatAvax(a.amount as bigint)}`;
    case "WorkSubmitted":
      return `Work submitted (hash ${shortHash(String(a.workHash))})`;
    case "EscrowCompleted":
      return `Completed: ${formatAvax(a.amount as bigint)} released to seller`;
    case "DisputeRaised":
      return `Dispute raised by ${shortAddress(String(a.raisedBy))}`;
    case "DisputeResolved":
      return `Dispute resolved: ${formatAvax(a.amount as bigint)} to ${shortAddress(String(a.winner))}`;
    case "EscrowRefunded":
      return `Refunded ${formatAvax(a.amount as bigint)} to buyer`;
    case "EscrowCancelled":
      return "Escrow cancelled by buyer";
  }
}

export function EscrowEvents({ escrowId }: { escrowId: bigint }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useEscrowEvents(escrowId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-primary" />
          On-chain activity
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()} loading={isFetching} aria-label="Refresh events">
          <RefreshCw />
        </Button>
      </div>
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {isError && (
        <div className="rounded-md border border-border p-4 text-sm">
          <p className="text-muted-foreground">{parseContractError(error).message}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!isLoading && !isError && data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No events found yet.</p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.map((ev) => (
            <li key={`${ev.txHash}-${ev.logIndex}`} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{ev.name}</p>
                <p className="text-xs text-muted-foreground">{describe(ev)}</p>
              </div>
              <div className="flex flex-col items-start gap-0.5 sm:items-end">
                <TxHashLink hash={ev.txHash} />
                <span className="text-xs text-muted-foreground">
                  {ev.timestamp ? formatDate(ev.timestamp) : `Block ${ev.blockNumber.toString()}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

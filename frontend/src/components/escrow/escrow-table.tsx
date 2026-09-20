"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ArrowRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/escrow/status-badge";
import { AddressDisplay } from "@/components/transaction/address-display";
import { counterparty, getAvailableActions, getRole } from "@/lib/escrow";
import { formatAvax, formatDate, formatRelative } from "@/lib/format";
import type { Escrow } from "@/types/escrow";

interface EscrowTableProps {
  escrows: Escrow[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;
}

function ActionHint({ escrow }: { escrow: Escrow }) {
  const { address } = useAccount();
  const actions = getAvailableActions(escrow, address);
  if (actions.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="default" className="capitalize">
      {actions.length === 1 ? actions[0].replace(/([A-Z])/g, " $1") : "Action required"}
    </Badge>
  );
}

export function EscrowTable({ escrows, isLoading, emptyTitle = "No escrows yet", emptyText, emptyAction }: EscrowTableProps) {
  const { address } = useAccount();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (escrows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="size-10 text-muted-foreground" />
          <h3 className="font-semibold">{emptyTitle}</h3>
          {emptyText && <p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>}
          {emptyAction}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {escrows.map((e) => {
              const role = getRole(e, address);
              return (
                <TableRow key={e.id.toString()}>
                  <TableCell className="font-mono">#{e.id.toString()}</TableCell>
                  <TableCell className="capitalize">{role}</TableCell>
                  <TableCell>
                    <AddressDisplay address={counterparty(e, role)} withExplorer={false} />
                  </TableCell>
                  <TableCell className="font-medium">{e.amount > 0n ? formatAvax(e.amount) : "Unfunded"}</TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell title={formatDate(e.deadline)}>{formatRelative(e.deadline)}</TableCell>
                  <TableCell>{formatDate(e.createdAt)}</TableCell>
                  <TableCell>
                    <ActionHint escrow={e} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/escrow/${e.id.toString()}`} aria-label={`Open escrow ${e.id.toString()}`}>
                        <ArrowRight />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {escrows.map((e) => {
          const role = getRole(e, address);
          return (
            <li key={e.id.toString()}>
              <Link href={`/escrow/${e.id.toString()}`} className="block">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">#{e.id.toString()}</span>
                      <StatusBadge status={e.status} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{role}</span>
                      <span className="font-medium">{e.amount > 0n ? formatAvax(e.amount) : "Unfunded"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <AddressDisplay address={counterparty(e, role)} withExplorer={false} withCopy={false} />
                      <span>Due {formatRelative(e.deadline)}</span>
                    </div>
                    <ActionHint escrow={e} />
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

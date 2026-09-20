"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NetworkGuard } from "@/components/wallet/network-guard";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { EscrowTable } from "@/components/escrow/escrow-table";
import { useMyEscrows } from "@/hooks/use-escrows";
import { computeStats, matchesFilter, matchesSearch } from "@/lib/escrow";
import { parseContractError } from "@/lib/errors";
import type { StatusFilter } from "@/types/escrow";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "Disputed" },
  { value: "refunded", label: "Refunded" },
];

function DashboardContent() {
  const { escrows, isLoading, isError, error, refetch } = useMyEscrows();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const stats = useMemo(() => computeStats(escrows), [escrows]);
  const visible = useMemo(
    () => escrows.filter((e) => matchesFilter(e, filter) && matchesSearch(e, query)),
    [escrows, filter, query],
  );

  return (
    <div className="flex flex-col gap-6">
      <StatsCards stats={stats} isLoading={isLoading} />

      {isError && (
        <Alert variant="warning">
          <AlertTitle>Could not load escrows</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{parseContractError(error).message}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by escrow ID or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search escrows"
          />
        </div>
      </div>

      <EscrowTable
        escrows={visible}
        isLoading={isLoading}
        emptyTitle={escrows.length === 0 ? "No escrows yet" : "No escrows match"}
        emptyText={
          escrows.length === 0
            ? "Create your first escrow to lock AVAX for a seller, or ask a buyer to add your address as the seller."
            : "Try a different filter or search term."
        }
        emptyAction={
          escrows.length === 0 ? (
            <Button asChild>
              <Link href="/create">
                <Plus /> Create Escrow
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything shown here is read live from the escrow smart contract.
          </p>
        </div>
        <Button asChild>
          <Link href="/create">
            <Plus /> Create Escrow
          </Link>
        </Button>
      </div>
      <NetworkGuard>
        <DashboardContent />
      </NetworkGuard>
    </div>
  );
}

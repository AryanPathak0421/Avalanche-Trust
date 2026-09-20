import type { Metadata } from "next";
import { NetworkGuard } from "@/components/wallet/network-guard";
import { CreateEscrowForm } from "@/components/escrow/create-escrow-form";

export const metadata: Metadata = { title: "Create Escrow" };

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Create Escrow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the deal, then deposit AVAX. The seller is paid only when you approve or an arbitrator rules.
        </p>
      </div>
      <NetworkGuard title="Connect a wallet to create an escrow">
        <CreateEscrowForm />
      </NetworkGuard>
    </div>
  );
}

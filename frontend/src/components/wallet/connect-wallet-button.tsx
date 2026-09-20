"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useBalance, useConnect, useDisconnect, type Connector } from "wagmi";
import { AlertTriangle, ChevronDown, LayoutDashboard, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddressDisplay } from "@/components/transaction/address-display";
import { useNetwork } from "@/hooks/use-network";
import { formatAvax, shortAddress } from "@/lib/format";
import { parseContractError } from "@/lib/errors";
import { ACTIVE_CHAIN_ID } from "@/config/chains";

function connectorLabel(connector: Connector) {
  if (connector.id === "injected") return "Browser Wallet";
  if (connector.id === "mock") return "Local Dev Wallet (Anvil)";
  return connector.name;
}

export function ConnectWalletButton() {
  const { address, isConnected, connector: activeConnector } = useAccount();
  const { connectors, connectAsync, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const network = useNetwork();
  const { data: balance } = useBalance({
    address,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address && network.isSupported, refetchInterval: 20_000 },
  });
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // De-duplicate: MetaMask and injected can be the same wallet.
  const seen = new Set<string>();
  const visibleConnectors = connectors.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  async function handleConnect(connector: Connector) {
    setPendingId(connector.uid);
    try {
      await connectAsync({ connector, chainId: ACTIVE_CHAIN_ID });
      setOpen(false);
    } catch {
      // Error surfaced below via `error`.
    } finally {
      setPendingId(null);
    }
  }

  if (!isConnected || !address) {
    return (
      <>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Wallet />
          <span className="hidden sm:inline">Connect Wallet</span>
          <span className="sm:hidden">Connect</span>
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Connect Avalanche Wallet</DialogTitle>
              <DialogDescription>Choose a wallet to continue. You will be asked to approve the connection.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {visibleConnectors.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No wallet detected. Install{" "}
                  <a className="text-primary underline" href="https://metamask.io" target="_blank" rel="noreferrer">
                    MetaMask
                  </a>{" "}
                  to continue.
                </p>
              )}
              {visibleConnectors.map((connector) => (
                <Button
                  key={connector.uid}
                  variant="outline"
                  className="h-12 justify-between"
                  loading={isPending && pendingId === connector.uid}
                  disabled={isPending}
                  onClick={() => handleConnect(connector)}
                >
                  <span>{connectorLabel(connector)}</span>
                  <Wallet className="text-muted-foreground" />
                </Button>
              ))}
              {error && (
                <p className="text-xs text-destructive" role="alert">
                  {parseContractError(error).message}
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 font-mono">
          {network.isWrongNetwork ? (
            <AlertTriangle className="text-warning" />
          ) : (
            <span className="size-2 rounded-full bg-success" aria-hidden />
          )}
          {shortAddress(address)}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Wallet Address</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <AddressDisplay address={address} full className="text-xs" />
          {activeConnector && <p className="mt-1 text-xs text-muted-foreground">via {activeConnector.name}</p>}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Network</DropdownMenuLabel>
        <div className="px-2 pb-2 text-sm">
          {network.isWrongNetwork ? (
            <div className="flex flex-col gap-2">
              <span className="text-warning">Unsupported network (chain {network.chainId})</span>
              <Button size="sm" onClick={network.switchNetwork} loading={network.isSwitching}>
                Switch to {network.targetChainName}
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              {network.targetChainName}
            </span>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Balance</DropdownMenuLabel>
        <div className="px-2 pb-2 font-mono text-sm">
          {network.isSupported ? formatAvax(balance?.value) : "—"}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard />
            My Escrows
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => disconnect()} className="text-destructive focus:text-destructive">
          <LogOut />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

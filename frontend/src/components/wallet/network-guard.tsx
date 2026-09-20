"use client";

import type { ReactNode } from "react";
import { AlertTriangle, PauseCircle, Settings2, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { useNetwork } from "@/hooks/use-network";
import { useContractPaused } from "@/hooks/use-contract-status";
import { parseContractError } from "@/lib/errors";

/** Banner shown site-wide when the wallet is on the wrong chain. */
export function WrongNetworkBanner() {
  const network = useNetwork();
  if (!network.isWrongNetwork) return null;
  return (
    <div className="border-b border-warning/30 bg-warning-bg text-warning">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="size-4" />
          Please switch to {network.targetChainName}.
        </span>
        <div className="flex items-center gap-2">
          {network.switchError && <span className="text-xs">{parseContractError(network.switchError).message}</span>}
          <Button size="sm" variant="outline" onClick={network.switchNetwork} loading={network.isSwitching}>
            Switch Network
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Banner shown when the contract admin has paused the escrow contract. */
export function PausedBanner() {
  const { paused } = useContractPaused();
  if (!paused) return null;
  return (
    <div className="border-b border-destructive/30 bg-accent text-accent-foreground">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-sm">
        <PauseCircle className="size-4" />
        The escrow contract is currently paused. Creating, funding, releasing and dispute resolution are disabled
        until the administrator resumes it.
      </div>
    </div>
  );
}

interface NetworkGuardProps {
  children: ReactNode;
  /** Shown as heading of the connect prompt. */
  title?: string;
}

/**
 * Wraps app pages: renders children only when a wallet is connected on the supported chain
 * and the contract address is configured. Otherwise shows the right call to action.
 */
export function NetworkGuard({ children, title = "Connect Avalanche Wallet" }: NetworkGuardProps) {
  const network = useNetwork();

  if (!network.isConfigured) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <Settings2 className="size-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Contract not configured</h2>
          <p className="text-sm text-muted-foreground">
            Set <code className="rounded bg-muted px-1">NEXT_PUBLIC_CONTRACT_ADDRESS</code> to the deployed
            AvalancheTrustEscrow address and restart the app. See the README for deployment steps.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!network.isConnected) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <Wallet className="size-10 text-primary" />
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Connect a wallet on {network.targetChainName} to view and manage your escrows. All state is read directly
            from the smart contract.
          </p>
          <ConnectWalletButton />
        </CardContent>
      </Card>
    );
  }

  if (network.isWrongNetwork) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <AlertTriangle className="size-10 text-warning" />
          <h2 className="text-xl font-semibold">Wrong network</h2>
          <p className="text-sm text-muted-foreground">Please switch to {network.targetChainName}.</p>
          {network.switchError && (
            <Alert variant="warning">
              <AlertTitle>Could not switch automatically</AlertTitle>
              <AlertDescription>{parseContractError(network.switchError).message}</AlertDescription>
            </Alert>
          )}
          <Button onClick={network.switchNetwork} loading={network.isSwitching}>
            Switch Network
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

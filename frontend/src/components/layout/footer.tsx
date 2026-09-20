import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { getExplorerAddressUrl } from "@/lib/explorer";
import { CONTRACT_ADDRESS } from "@/config/contract";
import { ACTIVE_NETWORK } from "@/config/chains";
import { shortAddress } from "@/lib/format";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="font-semibold">AvalancheTrust</span>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Trustless escrow for AVAX. Funds are held exclusively by an open-source smart contract on the Avalanche
            C-Chain. This software has not undergone a third-party security audit.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="font-medium">Product</span>
            <Link className="text-muted-foreground hover:text-foreground" href="/dashboard">
              Dashboard
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" href="/create">
              Create Escrow
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" href="/disputes">
              Disputes
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-medium">Network</span>
            <span className="text-muted-foreground">{ACTIVE_NETWORK.name}</span>
            <span className="text-muted-foreground">Chain ID {ACTIVE_NETWORK.chain.id}</span>
            {CONTRACT_ADDRESS ? (
              <a
                className="font-mono text-muted-foreground hover:text-foreground"
                href={getExplorerAddressUrl(CONTRACT_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Contract {shortAddress(CONTRACT_ADDRESS)}
              </a>
            ) : (
              <span className="text-muted-foreground">Contract not configured</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-medium">Resources</span>
            <a
              className="text-muted-foreground hover:text-foreground"
              href="https://docs.avax.network"
              target="_blank"
              rel="noopener noreferrer"
            >
              Avalanche Docs
            </a>
            <a
              className="text-muted-foreground hover:text-foreground"
              href="https://core.app/tools/testnet-faucet/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fuji Faucet
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

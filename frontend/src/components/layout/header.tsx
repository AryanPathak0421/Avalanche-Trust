"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Logo } from "@/components/layout/logo";
import { useAccountRoles } from "@/hooks/use-contract-status";
import { ACTIVE_NETWORK } from "@/config/chains";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/create", label: "Create Escrow" },
  { href: "/disputes", label: "Disputes" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { isArbitrator } = useAccountRoles();
  const links = isArbitrator ? [...NAV, { href: "/arbitrator", label: "Arbitrator" }] : NAV;

  return (
    <header className="sticky top-0 z-40 border-b border-border glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2" aria-label="AvalancheTrust home">
            <Logo className="size-7" />
            <span className="hidden text-base font-semibold tracking-tight sm:inline">AvalancheTrust</span>
            {ACTIVE_NETWORK.isTestnet && (
              <Badge variant="warning" className="hidden sm:inline-flex">
                Testnet
              </Badge>
            )}
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  pathname.startsWith(item.href) && "bg-muted text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <ConnectWalletButton />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-border bg-card md:hidden" aria-label="Mobile">
          <div className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                  pathname.startsWith(item.href) && "bg-muted text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

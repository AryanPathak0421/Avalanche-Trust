import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Eye,
  FileCheck2,
  Gavel,
  Lock,
  Mountain,
  PauseCircle,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SITE } from "@/config/site";
import { ACTIVE_NETWORK } from "@/config/chains";

export function Hero() {
  return (
    <section className="relative overflow-hidden hero-glow">
      <div className="absolute inset-0 grid-fade" aria-hidden />
      <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center md:py-32">
        <Badge variant="outline" className="mb-6 gap-2 py-1 pr-3">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          Live on {ACTIVE_NETWORK.name}
        </Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Trustless Escrow. <span className="text-primary">Powered by Avalanche.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">{SITE.description}</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/create">
              Create Escrow
              <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/dashboard">Launch App</Link>
          </Button>
        </div>
        <dl className="mt-16 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ["Non-custodial", "Only the contract holds funds"],
            ["Sub-second finality", "Avalanche consensus"],
            ["Open source", "Verifiable on Snowtrace"],
          ].map(([title, sub]) => (
            <div key={title} className="rounded-lg border border-border bg-card/60 p-4 text-left glass">
              <dt className="text-sm font-semibold">{title}</dt>
              <dd className="text-xs text-muted-foreground">{sub}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Lock, title: "Non-custodial", text: "AVAX is locked in the smart contract. No company, backend or admin can move it." },
  { icon: Eye, title: "Transparent", text: "Every state change is an on-chain event you can verify on the Avalanche explorer." },
  { icon: ShieldCheck, title: "Smart-contract secured", text: "OpenZeppelin primitives, reentrancy guards and a strict state machine." },
  { icon: Mountain, title: "Avalanche powered", text: "Low fees and near-instant finality on the Avalanche C-Chain." },
  { icon: Gavel, title: "Dispute resolution", text: "A designated arbitrator can only route funds to the buyer or the seller." },
  { icon: FileCheck2, title: "On-chain verification", text: "Agreements and deliverables are committed by cryptographic hash." },
];

export function Features() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight">Built for serious transactions</h2>
        <p className="mt-3 text-muted-foreground">
          Every rule that governs your funds is enforced by code, not by trust in a middleman.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <CardContent className="p-6">
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  ["Create Deal", "Buyer sets the seller, deadline and agreement. The agreement hash is stored on-chain."],
  ["Fund Escrow", "Buyer deposits AVAX. The contract locks it; nobody can withdraw it arbitrarily."],
  ["Complete Work", "Seller delivers and records the deliverable hash before the deadline."],
  ["Approve", "Buyer reviews and approves the work, or raises a dispute for arbitration."],
  ["Release Payment", "The contract pays the seller directly. No intermediary touches the funds."],
];

export function HowItWorks() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-3 text-muted-foreground">Five steps, all enforced by the escrow contract.</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-5">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="relative flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
              {i < STEPS.length - 1 && (
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-muted-foreground md:hidden">
                  <ArrowDown className="size-4" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function WhyAvalanche() {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-4 py-20 lg:grid-cols-2 lg:items-center">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Why Avalanche</h2>
        <p className="mt-4 text-muted-foreground">
          Escrow only works if settlement is fast, cheap and final. The Avalanche C-Chain is fully EVM compatible,
          so AvalancheTrust uses battle-tested Solidity tooling while benefiting from Avalanche consensus.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {[
            [Zap, "Transactions finalize in about a second, so payment release is immediate."],
            [Mountain, "Low, predictable fees make small escrows economical."],
            [Workflow, "EVM compatibility: MetaMask, viem, wagmi and OpenZeppelin work out of the box."],
            [Eye, "Snowtrace explorer provides public, verifiable history for every escrow."],
          ].map(([Icon, text], i) => {
            const IconComponent = Icon as typeof Zap;
            return (
              <li key={i} className="flex items-start gap-3">
                <IconComponent className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{text as string}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <Card className="bg-gradient-to-br from-card to-muted">
        <CardContent className="p-8">
          <dl className="grid grid-cols-2 gap-6">
            {[
              ["Chain", ACTIVE_NETWORK.name],
              ["Chain ID", String(ACTIVE_NETWORK.chain.id)],
              ["Native token", "AVAX"],
              ["Explorer", "Snowtrace"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}

const SECURITY = [
  [ShieldCheck, "OpenZeppelin AccessControl, Pausable and ReentrancyGuard"],
  [Lock, "Checks-Effects-Interactions on every payout, with revert on failed transfer"],
  [Workflow, "Strict state machine: invalid transitions are impossible by construction"],
  [Gavel, "Arbitrator can only route funds to buyer or seller, never to itself"],
  [PauseCircle, "Emergency pause halts creation, funding and releases; it never moves funds"],
  [Eye, "No admin withdrawal function exists. Custom errors surface exact failure reasons"],
];

export function Security() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight">Security engineering</h2>
          <p className="mt-3 text-muted-foreground">
            The contract follows audit-style engineering practices and ships with a comprehensive Foundry test
            suite. It has not been audited by a third party; treat mainnet use accordingly.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map(([Icon, text], i) => {
            const IconComponent = Icon as typeof ShieldCheck;
            return (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
                <IconComponent className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{text as string}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

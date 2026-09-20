"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance } from "wagmi";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isAddress, parseEventLogs, type Hex } from "viem";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TransactionDialog } from "@/components/transaction/transaction-dialog";
import { useContractTx } from "@/hooks/use-contract-tx";
import { useContractPaused } from "@/hooks/use-contract-status";
import { buildDocument } from "@/lib/hashing";
import { attachEscrowMetadata, storeDocument } from "@/lib/documents";
import { formatAvax, formatDateLong, parseAvax, shortAddress } from "@/lib/format";
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK } from "@/config/chains";
import { LIMITS } from "@/config/site";
import { escrowContract } from "@/config/contract";

function buildSchema(self: string | undefined) {
  return z.object({
    seller: z
      .string()
      .trim()
      .refine((v) => Boolean(isAddress(v)), "Enter a valid Avalanche (0x…) wallet address.")
      .refine((v) => !self || v.toLowerCase() !== self.toLowerCase(), "Seller cannot be your own wallet."),
    amount: z
      .string()
      .trim()
      .refine((v) => {
        try {
          return parseAvax(v) > 0n;
        } catch {
          return false;
        }
      }, "Enter an amount greater than 0 AVAX."),
    deadline: z.string().refine((v) => {
      const t = Math.floor(new Date(v).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      return t >= now + LIMITS.minDeadlineSeconds && t <= now + LIMITS.maxDeadlineSeconds;
    }, "Deadline must be at least 1 hour and at most 1 year from now."),
    description: z
      .string()
      .trim()
      .min(LIMITS.descriptionMin, `Describe the agreement in at least ${LIMITS.descriptionMin} characters.`)
      .max(LIMITS.descriptionMax, `Keep the description under ${LIMITS.descriptionMax} characters.`),
  });
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>;

function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateEscrowForm() {
  const router = useRouter();
  const { address } = useAccount();
  const { paused } = useContractPaused();
  const { data: balance } = useBalance({ address, chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address } });
  const tx = useContractTx();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ values: FormValues; hash: Hex } | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(buildSchema(address)),
    defaultValues: { seller: "", amount: "", deadline: defaultDeadline(), description: "" },
    mode: "onBlur",
  });

  async function prepare(values: FormValues) {
    const text = `${values.description}\n\nAgreed amount: ${values.amount} AVAX`;
    const { doc, hash } = await buildDocument("agreement", text, file);
    await storeDocument(hash, doc);
    setConfirm({ values, hash });
  }

  async function submit() {
    if (!confirm) return;
    const deadline = BigInt(Math.floor(new Date(confirm.values.deadline).getTime() / 1000));
    setTxOpen(true);
    const receipt = await tx.send({
      functionName: "createEscrow",
      args: [confirm.values.seller as `0x${string}`, deadline, confirm.hash],
      context: "create",
    });
    if (receipt?.status === "success") {
      const logs = parseEventLogs({ abi: escrowContract.abi, logs: receipt.logs, eventName: "EscrowCreated" });
      const id = logs[0]?.args.escrowId;
      if (id !== undefined) {
        setCreatedId(id);
        // Persist the description under the escrow id too, so the detail page can suggest the amount.
        await attachEscrowMetadata({
          escrowId: id.toString(),
          txHash: receipt.transactionHash,
          agreementHash: confirm.hash,
        });
        try {
          window.localStorage.setItem(
            `avalanchetrust:amount:${ACTIVE_CHAIN_ID}:${id.toString()}`,
            confirm.values.amount,
          );
        } catch {
          /* ignore */
        }
      }
      toast.success("Escrow created", { description: "Next step: deposit AVAX to activate it." });
    }
  }

  const values = confirm?.values;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>New escrow agreement</CardTitle>
          <CardDescription>
            You are the buyer. After creation you will deposit the AVAX in a second transaction. Only a hash of the
            agreement is stored on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(prepare)} className="grid gap-5" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="seller">Seller wallet address</Label>
              <Input
                id="seller"
                placeholder="0x…"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!form.formState.errors.seller}
                {...form.register("seller")}
              />
              {form.formState.errors.seller && <p className="text-xs text-destructive">{form.formState.errors.seller.message}</p>}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount (AVAX)</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="2.50"
                  aria-invalid={!!form.formState.errors.amount}
                  {...form.register("amount")}
                />
                {form.formState.errors.amount ? (
                  <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Wallet balance: {formatAvax(balance?.value)}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input id="deadline" type="datetime-local" aria-invalid={!!form.formState.errors.deadline} {...form.register("deadline")} />
                {form.formState.errors.deadline ? (
                  <p className="text-xs text-destructive">{form.formState.errors.deadline.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Seller must submit work before this time.</p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Agreement description</Label>
              <Textarea
                id="description"
                placeholder="Scope of work, deliverables, acceptance criteria…"
                aria-invalid={!!form.formState.errors.description}
                {...form.register("description")}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {form.formState.errors.description ? (
                  <span className="text-destructive">{form.formState.errors.description.message}</span>
                ) : (
                  <span>Stored off-chain; its keccak256 hash is committed on-chain.</span>
                )}
                <span>
                  {form.watch("description").length}/{LIMITS.descriptionMax}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="document">Optional document</Label>
              <Input
                id="document"
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > LIMITS.maxDocumentBytes) {
                    setFileError("File must be 5 MB or smaller.");
                    setFile(null);
                    return;
                  }
                  setFileError(null);
                  setFile(f);
                }}
              />
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="lg" loading={form.formState.isSubmitting} disabled={paused || !address}>
                Review escrow
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={!!confirm && !txOpen} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You are about to create an escrow.</DialogTitle>
            <DialogDescription>Review the details. Creation itself does not move funds.</DialogDescription>
          </DialogHeader>
          {values && (
            <dl className="grid gap-3 text-sm">
              {[
                ["Seller", <span key="s" className="font-mono" title={values.seller}>{shortAddress(values.seller, 6)}</span>],
                ["Amount", `${values.amount} AVAX (deposited in the next step)`],
                ["Deadline", formatDateLong(Math.floor(new Date(values.deadline).getTime() / 1000))],
                ["Network", ACTIVE_NETWORK.shortName],
                ["Agreement hash", <span key="h" className="break-all font-mono text-xs">{confirm?.hash}</span>],
              ].map(([k, v]) => (
                <div key={k as string} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k as string}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button onClick={submit}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionDialog
        open={txOpen}
        onOpenChange={(o) => {
          setTxOpen(o);
          if (!o) tx.reset();
        }}
        state={tx.state}
        title="Create escrow"
        successMessage={createdId !== null ? `Escrow #${createdId.toString()} created` : "Escrow created"}
        onRetry={submit}
        onDone={() => {
          setTxOpen(false);
          if (createdId !== null) router.push(`/escrow/${createdId.toString()}`);
        }}
      />
    </>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LIMITS } from "@/config/site";
import { buildDocument } from "@/lib/hashing";
import { storeDocument } from "@/lib/documents";
import { formatAvax } from "@/lib/format";
import type { Escrow } from "@/types/escrow";
import type { Hex } from "viem";

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(LIMITS.disputeReasonMin, `Please provide at least ${LIMITS.disputeReasonMin} characters.`)
    .max(LIMITS.disputeReasonMax, `Keep the reason under ${LIMITS.disputeReasonMax} characters.`),
});
type FormValues = z.infer<typeof schema>;

interface DisputeDialogProps {
  escrow: Escrow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reasonHash: Hex) => void;
}

export function DisputeDialog({ escrow, open, onOpenChange, onConfirm }: DisputeDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [preparedHash, setPreparedHash] = useState<Hex | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });

  function reset() {
    form.reset();
    setFile(null);
    setFileError(null);
    setStep("form");
    setPreparedHash(null);
  }

  async function prepare(values: FormValues) {
    const { doc, hash } = await buildDocument("dispute", values.reason, file, escrow.id.toString());
    await storeDocument(hash, doc);
    setPreparedHash(hash);
    setStep("confirm");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise Dispute · Escrow #{escrow.id.toString()}</DialogTitle>
          <DialogDescription>
            Disputing freezes {formatAvax(escrow.amount)} until the arbitrator resolves it. Only the reason&apos;s
            cryptographic hash is stored on-chain.
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <form id="dispute-form" onSubmit={form.handleSubmit(prepare)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Describe what went wrong and what outcome you expect."
                aria-invalid={!!form.formState.errors.reason}
                {...form.register("reason")}
              />
              {form.formState.errors.reason && (
                <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidence">Supporting document (optional)</Label>
              <Input
                id="evidence"
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
              <p className="text-xs text-muted-foreground">
                The file is hashed in your browser and never uploaded to the blockchain.
              </p>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>
                This locks the escrow. Normal completion and refunds are disabled until the arbitrator rules.
              </AlertDescription>
            </Alert>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Escrow</dt>
                <dd>#{escrow.id.toString()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Amount locked</dt>
                <dd>{formatAvax(escrow.amount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reason hash</dt>
                <dd className="break-all font-mono text-xs">{preparedHash}</dd>
              </div>
            </dl>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === "form" ? (
            <Button type="submit" form="dispute-form" loading={form.formState.isSubmitting}>
              Continue
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => preparedHash && onConfirm(preparedHash)}>
              Confirm dispute
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

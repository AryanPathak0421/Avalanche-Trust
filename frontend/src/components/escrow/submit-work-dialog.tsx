"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Hex } from "viem";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/config/site";
import { buildDocument } from "@/lib/hashing";
import { storeDocument } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import type { Escrow } from "@/types/escrow";

const schema = z.object({
  note: z.string().trim().min(1, "Describe the deliverable or paste a link.").max(LIMITS.workNoteMax),
});
type FormValues = z.infer<typeof schema>;

interface SubmitWorkDialogProps {
  escrow: Escrow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (workHash: Hex) => void;
}

export function SubmitWorkDialog({ escrow, open, onOpenChange, onConfirm }: SubmitWorkDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { note: "" } });

  async function submit(values: FormValues) {
    const { doc, hash } = await buildDocument("work", values.note, file, escrow.id.toString());
    await storeDocument(hash, doc);
    onConfirm(hash);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          form.reset();
          setFile(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Work · Escrow #{escrow.id.toString()}</DialogTitle>
          <DialogDescription>
            Record your deliverable before the deadline ({formatDate(escrow.deadline)}). Only its hash goes on-chain;
            share the actual deliverable with the buyer directly.
          </DialogDescription>
        </DialogHeader>
        <form id="work-form" onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="note">Deliverable description or link</Label>
            <Textarea
              id="note"
              placeholder="e.g. Final designs delivered via https://… (v3, 12 files)"
              aria-invalid={!!form.formState.errors.note}
              {...form.register("note")}
            />
            {form.formState.errors.note && <p className="text-xs text-destructive">{form.formState.errors.note.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="deliverable">Deliverable file (optional)</Label>
            <Input
              id="deliverable"
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
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="work-form" loading={form.formState.isSubmitting}>
            Submit work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

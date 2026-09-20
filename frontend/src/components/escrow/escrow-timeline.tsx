import { Check, Circle, Dot, X } from "lucide-react";
import { buildTimeline, type StepState } from "@/lib/escrow";
import { formatDate } from "@/lib/format";
import type { Escrow } from "@/types/escrow";
import { cn } from "@/lib/utils";

const ICONS: Record<StepState, React.ReactNode> = {
  done: <Check className="size-3.5" />,
  current: <Dot className="size-5" />,
  pending: <Circle className="size-3" />,
  failed: <X className="size-3.5" />,
  skipped: <Circle className="size-3" />,
};

const STYLES: Record<StepState, string> = {
  done: "border-success bg-success text-white",
  current: "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
  pending: "border-border bg-card text-muted-foreground",
  failed: "border-destructive bg-destructive text-white",
  skipped: "border-border bg-card text-muted-foreground",
};

export function EscrowTimeline({ escrow }: { escrow: Escrow }) {
  const steps = buildTimeline(escrow);
  return (
    <ol className="relative flex flex-col gap-0" aria-label="Escrow progress">
      {steps.map((step, i) => (
        <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && (
            <span
              className={cn(
                "absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px",
                step.state === "done" ? "bg-success" : "bg-border",
              )}
              aria-hidden
            />
          )}
          <span
            className={cn(
              "z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2",
              STYLES[step.state],
            )}
            aria-hidden
          >
            {ICONS[step.state]}
          </span>
          <div className="flex flex-col pt-0.5">
            <span className={cn("text-sm font-medium", step.state === "pending" && "text-muted-foreground")}>
              {step.label}
            </span>
            {step.timestamp ? <span className="text-xs text-muted-foreground">{formatDate(step.timestamp)}</span> : null}
            {step.state === "current" && <span className="text-xs text-primary">In progress</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

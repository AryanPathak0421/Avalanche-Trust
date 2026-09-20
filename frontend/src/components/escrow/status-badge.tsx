import { Badge, type BadgeProps } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/escrow";
import { EscrowStatus } from "@/types/escrow";

const VARIANTS: Record<EscrowStatus, BadgeProps["variant"]> = {
  [EscrowStatus.Created]: "muted",
  [EscrowStatus.Funded]: "info",
  [EscrowStatus.WorkSubmitted]: "warning",
  [EscrowStatus.Completed]: "success",
  [EscrowStatus.Disputed]: "destructive",
  [EscrowStatus.Refunded]: "secondary",
  [EscrowStatus.Cancelled]: "muted",
};

export function StatusBadge({ status, className }: { status: EscrowStatus; className?: string }) {
  return (
    <Badge variant={VARIANTS[status]} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

import { Activity, CheckCircle2, Gavel, Layers, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAvax } from "@/lib/format";
import type { EscrowStats } from "@/lib/escrow";

export function StatsCards({ stats, isLoading }: { stats: EscrowStats; isLoading?: boolean }) {
  const items = [
    { label: "Total Escrows", value: stats.total.toString(), icon: Layers },
    { label: "Active Escrows", value: stats.active.toString(), icon: Activity },
    { label: "Completed", value: stats.completed.toString(), icon: CheckCircle2 },
    { label: "Disputed", value: stats.disputed.toString(), icon: Gavel },
    { label: "Total Value Locked", value: formatAvax(stats.valueLocked), icon: Lock },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {items.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{label}</span>
              <Icon className="size-4" />
            </div>
            {isLoading ? <Skeleton className="h-7 w-20" /> : <span className="text-2xl font-semibold tracking-tight">{value}</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

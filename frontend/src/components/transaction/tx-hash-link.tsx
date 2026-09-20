import { ExternalLink } from "lucide-react";
import { getExplorerTxUrl } from "@/lib/explorer";
import { shortHash } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

interface TxHashLinkProps {
  hash: string;
  className?: string;
  full?: boolean;
}

export function TxHashLink({ hash, className, full }: TxHashLinkProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-xs", className)}>
      <a
        href={getExplorerTxUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline break-all"
      >
        {full ? hash : shortHash(hash)}
        <ExternalLink className="size-3 shrink-0" />
      </a>
      <CopyButton value={hash} label="Copy transaction hash" />
    </span>
  );
}

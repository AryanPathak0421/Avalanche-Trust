import { ExternalLink } from "lucide-react";
import { getExplorerAddressUrl } from "@/lib/explorer";
import { shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

interface AddressDisplayProps {
  address: string;
  full?: boolean;
  className?: string;
  label?: string;
  withCopy?: boolean;
  withExplorer?: boolean;
}

export function AddressDisplay({
  address,
  full = false,
  className,
  label,
  withCopy = true,
  withExplorer = true,
}: AddressDisplayProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-sm", className)}>
      {label && <span className="mr-1 font-sans text-xs text-muted-foreground">{label}</span>}
      <span className={cn(full && "break-all")} title={address}>
        {full ? address : shortAddress(address)}
      </span>
      {withExplorer && (
        <a
          href={getExplorerAddressUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary"
          aria-label="View address on explorer"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
      {withCopy && <CopyButton value={address} label="Copy address" />}
    </span>
  );
}

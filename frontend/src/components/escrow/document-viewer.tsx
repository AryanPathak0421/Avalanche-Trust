"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, ShieldCheck } from "lucide-react";
import type { Hex } from "viem";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/ui/copy-button";
import { fetchDocument } from "@/lib/documents";
import { isZeroHash } from "@/lib/hashing";
import { formatDate, shortHash } from "@/lib/format";

interface DocumentViewerProps {
  hash: Hex;
  title: string;
  emptyText?: string;
}

/**
 * Shows the off-chain content behind an on-chain hash, but only when the content re-hashes
 * to exactly that value. Otherwise it shows the hash alone, so nothing unverified is displayed.
 */
export function DocumentViewer({ hash, title, emptyText = "Not provided" }: DocumentViewerProps) {
  const enabled = !isZeroHash(hash);
  const { data, isLoading } = useQuery({
    queryKey: ["document", hash],
    queryFn: () => fetchDocument(hash),
    enabled,
    staleTime: Infinity,
  });

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="inline-flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-primary" />
          {title}
        </h4>
        {enabled && (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground" title={hash}>
            {shortHash(hash, 8)}
            <CopyButton value={hash} label="Copy hash" />
          </span>
        )}
      </div>
      {!enabled && <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>}
      {enabled && isLoading && <Skeleton className="mt-3 h-16 w-full" />}
      {enabled && !isLoading && data && (
        <div className="mt-3 space-y-2">
          <Badge variant="success">
            <ShieldCheck className="size-3" />
            Content verified against on-chain hash ({data.source === "backend" ? "shared" : "this browser"})
          </Badge>
          <p className="whitespace-pre-wrap text-sm">{data.payload.text}</p>
          {data.payload.fileName && (
            <p className="text-xs text-muted-foreground">
              Attached file: {data.payload.fileName} · file hash {shortHash(data.payload.fileHash ?? "", 8)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Authored {formatDate(data.payload.createdAt)}</p>
        </div>
      )}
      {enabled && !isLoading && !data && (
        <p className="mt-2 text-sm text-muted-foreground">
          Available through verified document hash. The full content is not available to this browser; the party
          who authored it can verify their copy against the hash above.
        </p>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M16 6.5 26 24h-5.2l-4.8-8.6L11.2 24H6L16 6.5Z" fill="white" />
      <path d="M13.2 24 16 19l2.8 5h-5.6Z" fill="white" fillOpacity="0.75" />
    </svg>
  );
}

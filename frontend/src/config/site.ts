export const SITE = {
  name: "AvalancheTrust",
  tagline: "Trustless Escrow. Powered by Avalanche.",
  description:
    "Secure AVAX payments between buyers and sellers with transparent, programmable smart contracts.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

/** Optional off-chain metadata API. When unset, documents are kept in the browser only. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export const LIMITS = {
  descriptionMin: 10,
  descriptionMax: 2000,
  disputeReasonMin: 10,
  disputeReasonMax: 2000,
  workNoteMax: 2000,
  maxDocumentBytes: 5 * 1024 * 1024,
  /** Mirrors the contract's MIN_DEADLINE_DELTA / MAX_DEADLINE_DELTA. */
  minDeadlineSeconds: 60 * 60,
  maxDeadlineSeconds: 365 * 24 * 60 * 60,
  /** Public Avalanche RPCs cap eth_getLogs ranges; keep chunks conservative. */
  logChunkSize: 2000n,
  multicallChunk: 50,
} as const;

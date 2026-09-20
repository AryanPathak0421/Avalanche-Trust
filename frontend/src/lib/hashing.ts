import { keccak256, stringToHex, type Hex } from "viem";

/**
 * Canonical document format hashed on-chain.
 * Both text and an optional attached file are covered by the single hash, so the
 * on-chain `bytes32` commits to everything the user submitted.
 */
export interface DocumentPayload {
  kind: "agreement" | "work" | "dispute";
  escrowId?: string;
  text: string;
  fileName?: string;
  fileHash?: Hex;
  createdAt: number;
}

export function hashText(text: string): Hex {
  return keccak256(stringToHex(text));
}

export async function hashFile(file: File): Promise<Hex> {
  const buffer = await file.arrayBuffer();
  return keccak256(new Uint8Array(buffer));
}

/** Deterministic serialization: sorted keys so the same payload always yields the same hash. */
export function serializeDocument(doc: DocumentPayload): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(doc).sort()) {
    const value = (doc as unknown as Record<string, unknown>)[key];
    if (value !== undefined) ordered[key] = value;
  }
  return JSON.stringify(ordered);
}

export function hashDocument(doc: DocumentPayload): Hex {
  return hashText(serializeDocument(doc));
}

export async function buildDocument(
  kind: DocumentPayload["kind"],
  text: string,
  file?: File | null,
  escrowId?: string,
): Promise<{ doc: DocumentPayload; hash: Hex }> {
  const doc: DocumentPayload = {
    kind,
    escrowId,
    text: text.trim(),
    createdAt: Math.floor(Date.now() / 1000),
  };
  if (file) {
    doc.fileName = file.name;
    doc.fileHash = await hashFile(file);
  }
  return { doc, hash: hashDocument(doc) };
}

export const ZERO_HASH: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function isZeroHash(hash: string | undefined): boolean {
  return !hash || hash === ZERO_HASH;
}

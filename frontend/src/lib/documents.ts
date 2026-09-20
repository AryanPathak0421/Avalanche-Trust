import type { Hex } from "viem";
import { API_URL } from "@/config/site";
import { ACTIVE_CHAIN_ID } from "@/config/chains";
import { hashDocument, type DocumentPayload } from "@/lib/hashing";

/**
 * Off-chain document store.
 *
 * The chain only holds keccak256 hashes. The full text lives either in the optional
 * backend (shared between parties) or, when no backend is configured, in this browser's
 * localStorage (visible only to the author). Every document read back is re-hashed and
 * compared to the requested hash, so tampered or mismatched content is never displayed.
 */

const STORAGE_PREFIX = `avalanchetrust:doc:${ACTIVE_CHAIN_ID}:`;

export interface StoredDocument {
  hash: Hex;
  payload: DocumentPayload;
  source: "backend" | "local";
}

function localKey(hash: Hex) {
  return `${STORAGE_PREFIX}${hash.toLowerCase()}`;
}

function readLocal(hash: Hex): DocumentPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localKey(hash));
    return raw ? (JSON.parse(raw) as DocumentPayload) : null;
  } catch {
    return null;
  }
}

function writeLocal(hash: Hex, payload: DocumentPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localKey(hash), JSON.stringify(payload));
  } catch {
    // Storage full or disabled; the hash is still on-chain and the user still has their file.
  }
}

export const isBackendConfigured = API_URL.length > 0;

export async function storeDocument(hash: Hex, payload: DocumentPayload): Promise<StoredDocument["source"]> {
  writeLocal(hash, payload);
  if (!isBackendConfigured) return "local";
  try {
    const res = await fetch(`${API_URL}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: ACTIVE_CHAIN_ID, hash, payload }),
    });
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    return "backend";
  } catch {
    return "local";
  }
}

export async function fetchDocument(hash: Hex): Promise<StoredDocument | null> {
  if (isBackendConfigured) {
    try {
      const res = await fetch(`${API_URL}/documents/${ACTIVE_CHAIN_ID}/${hash}`);
      if (res.ok) {
        const body = (await res.json()) as { payload: DocumentPayload };
        if (hashDocument(body.payload) === hash) {
          return { hash, payload: body.payload, source: "backend" };
        }
      }
    } catch {
      // fall through to local
    }
  }
  const local = readLocal(hash);
  if (local && hashDocument(local) === hash) {
    return { hash, payload: local, source: "local" };
  }
  return null;
}

/** Links an escrow id to a document hash after creation, so the backend can index it. */
export async function attachEscrowMetadata(input: {
  escrowId: string;
  txHash: Hex;
  agreementHash: Hex;
  title?: string;
}): Promise<void> {
  if (!isBackendConfigured) return;
  try {
    await fetch(`${API_URL}/escrows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: ACTIVE_CHAIN_ID, ...input }),
    });
  } catch {
    // Non-critical: the chain remains the source of truth.
  }
}

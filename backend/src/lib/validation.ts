import { isAddress, keccak256, stringToHex, type Hex } from "viem";
import { z } from "zod";

export const hexHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex hash")
  .transform((v) => v.toLowerCase() as Hex);

export const address = z
  .string()
  .refine((v) => isAddress(v), "Expected an EVM address")
  .transform((v) => v.toLowerCase());

export const chainId = z.coerce.number().int().refine((v) => v === 43113 || v === 43114 || v === 31337, "Unsupported chain");

export const documentPayload = z.object({
  kind: z.enum(["agreement", "work", "dispute"]),
  escrowId: z.string().regex(/^\d+$/).optional(),
  text: z.string().min(1).max(20_000),
  fileName: z.string().max(255).optional(),
  fileHash: hexHash.optional(),
  createdAt: z.number().int().nonnegative(),
});
export type DocumentPayload = z.infer<typeof documentPayload>;

export const storeDocumentBody = z.object({
  chainId,
  hash: hexHash,
  payload: documentPayload,
});

export const escrowMetadataBody = z.object({
  chainId,
  escrowId: z.string().regex(/^\d+$/),
  agreementHash: hexHash,
  txHash: hexHash.optional(),
  title: z.string().max(140).optional(),
});

export const registerUserBody = z.object({
  walletAddress: address,
  displayName: z.string().max(80).optional(),
  email: z.string().email().optional(),
});

/**
 * Must match `serializeDocument` + `hashDocument` in the frontend exactly:
 * JSON with keys sorted, undefined dropped, then keccak256 of the UTF-8 bytes.
 */
export function serializeDocument(doc: DocumentPayload): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(doc).sort()) {
    const value = (doc as unknown as Record<string, unknown>)[key];
    if (value !== undefined) ordered[key] = value;
  }
  return JSON.stringify(ordered);
}

export function hashDocument(doc: DocumentPayload): Hex {
  return keccak256(stringToHex(serializeDocument(doc)));
}

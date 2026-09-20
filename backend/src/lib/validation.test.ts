import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { hashDocument, serializeDocument, storeDocumentBody } from "./validation.js";

describe("document hashing parity", () => {
  it("matches the frontend algorithm (sorted keys, undefined dropped, keccak256 utf8)", () => {
    const doc = { kind: "agreement" as const, text: "hello", createdAt: 1, fileName: undefined };
    expect(serializeDocument(doc)).toBe('{"createdAt":1,"kind":"agreement","text":"hello"}');
    expect(hashDocument(doc)).toBe(keccak256(stringToHex('{"createdAt":1,"kind":"agreement","text":"hello"}')));
  });

  it("rejects malformed bodies", () => {
    expect(storeDocumentBody.safeParse({ chainId: 1, hash: "0x00", payload: {} }).success).toBe(false);
    expect(
      storeDocumentBody.safeParse({
        chainId: 43113,
        hash: "0x" + "ab".repeat(32),
        payload: { kind: "work", text: "x", createdAt: 5 },
      }).success,
    ).toBe(true);
  });
});

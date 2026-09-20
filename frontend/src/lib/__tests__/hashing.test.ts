import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { buildDocument, hashDocument, hashText, isZeroHash, serializeDocument, ZERO_HASH } from "@/lib/hashing";
import { getExplorerAddressUrl, getExplorerBlockUrl, getExplorerTxUrl } from "@/lib/explorer";

describe("hashing", () => {
  it("hashText is keccak256 of utf8 bytes", () => {
    expect(hashText("hello")).toBe(keccak256(stringToHex("hello")));
  });

  it("serialization is key-order independent and drops undefined", () => {
    const a = serializeDocument({ kind: "agreement", text: "x", createdAt: 1, fileName: undefined });
    const b = serializeDocument({ createdAt: 1, text: "x", kind: "agreement" });
    expect(a).toBe(b);
    expect(hashDocument({ kind: "agreement", text: "x", createdAt: 1 })).toBe(
      hashDocument({ createdAt: 1, kind: "agreement", text: "x" }),
    );
  });

  it("buildDocument includes the file hash when a file is attached", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "proof.txt", { type: "text/plain" });
    const { doc, hash } = await buildDocument("dispute", "  reason  ", file, "5");
    expect(doc.text).toBe("reason");
    expect(doc.fileName).toBe("proof.txt");
    expect(doc.fileHash).toBe(keccak256(new Uint8Array([1, 2, 3])));
    expect(hash).toBe(hashDocument(doc));
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("isZeroHash", () => {
    expect(isZeroHash(ZERO_HASH)).toBe(true);
    expect(isZeroHash(undefined)).toBe(true);
    expect(isZeroHash("0x01")).toBe(false);
  });
});

describe("explorer urls", () => {
  it("builds Fuji urls by default and accepts overrides", () => {
    expect(getExplorerTxUrl("0xabc")).toBe("https://testnet.snowtrace.io/tx/0xabc");
    expect(getExplorerAddressUrl("0xdef")).toBe("https://testnet.snowtrace.io/address/0xdef");
    expect(getExplorerBlockUrl(12n)).toBe("https://testnet.snowtrace.io/block/12");
    expect(getExplorerTxUrl("0xabc", "https://snowtrace.io")).toBe("https://snowtrace.io/tx/0xabc");
  });
});

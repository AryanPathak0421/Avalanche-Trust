import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { formatAvax, formatDateLong, parseAvax, shortAddress, shortHash } from "@/lib/format";

describe("format helpers", () => {
  it("shortens addresses and hashes", () => {
    expect(shortAddress("0x7a12345678901234567890123456789012f291F2")).toBe("0x7a12…91F2");
    expect(shortHash("0x83abcdef0000000000000000000000000000000000000000000000000000091a")).toBe("0x83abcd…00091a");
    expect(shortAddress(undefined)).toBe("");
  });

  it("formats AVAX with two to four decimals", () => {
    expect(formatAvax(parseEther("2.5"))).toBe("2.50 AVAX");
    expect(formatAvax(parseEther("0.12345678"))).toBe("0.1235 AVAX");
    expect(formatAvax(undefined)).toBe("—");
  });

  it("parses AVAX strings", () => {
    expect(parseAvax(" 1.5 ")).toBe(parseEther("1.5"));
    expect(() => parseAvax("abc")).toThrow();
  });

  it("formats long dates", () => {
    expect(formatDateLong(Date.UTC(2026, 8, 30) / 1000)).toMatch(/September 2026/);
  });
});

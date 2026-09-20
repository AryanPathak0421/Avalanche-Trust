import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, toFunctionSelector } from "viem";
import { parseContractError } from "@/lib/errors";

describe("parseContractError", () => {
  it("maps user rejection", () => {
    const err = new UserRejectedRequestError(new Error("User rejected the request."));
    const parsed = parseContractError(err, "fund");
    expect(parsed.code).toBe("UserRejectedRequest");
    expect(parsed.retryable).toBe(true);
    expect(parsed.message).toMatch(/rejected/i);
  });

  it("maps custom revert names to context-specific messages", () => {
    const revert = new ContractFunctionRevertedError({
      abi: [{ type: "error", name: "InvalidStatus", inputs: [] }],
      functionName: "fundEscrow",
      data: toFunctionSelector("InvalidStatus()"),
    });
    const wrapped = new BaseError("execution reverted", { cause: revert });
    const parsed = parseContractError(wrapped, "fund");
    expect(parsed.code).toBe("InvalidStatus");
    expect(parsed.message).toBe("This escrow cannot be funded because it is no longer in the Created state.");
  });

  it("falls back to regex matching on plain error text", () => {
    expect(parseContractError(new Error("reverted with Unauthorized()"), "approveWork").code).toBe("Unauthorized");
    expect(parseContractError(new Error("DeadlineExpired"), "submitWork").message).toMatch(/refund/i);
    expect(parseContractError("EnforcedPause").code).toBe("ContractPaused");
  });

  it("maps insufficient funds", () => {
    const parsed = parseContractError(new Error("insufficient funds for gas * price + value"));
    expect(parsed.code).toBe("InsufficientFunds");
  });

  it("maps wrong network and RPC failures", () => {
    expect(parseContractError(new Error("Chain mismatch: expected 43113")).code).toBe("WrongNetwork");
    expect(parseContractError(new Error("HTTP request failed. Failed to fetch")).code).toBe("RpcFailure");
    expect(parseContractError(new Error("HTTP request failed. Failed to fetch")).retryable).toBe(true);
  });

  it("returns a safe unknown message for anything else", () => {
    const parsed = parseContractError({ weird: true });
    expect(parsed.code).toBe("Unknown");
    expect(parsed.message.length).toBeGreaterThan(0);
  });
});

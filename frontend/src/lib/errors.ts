import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, InsufficientFundsError } from "viem";
import { ACTIVE_NETWORK } from "@/config/chains";

export type ParsedErrorCode =
  | "UserRejectedRequest"
  | "InsufficientFunds"
  | "WrongNetwork"
  | "InvalidStatus"
  | "Unauthorized"
  | "DeadlineExpired"
  | "DeadlineNotReached"
  | "InvalidDeadline"
  | "InvalidAmount"
  | "InvalidAddress"
  | "InvalidHash"
  | "SameParty"
  | "EscrowNotFound"
  | "TransferFailed"
  | "ContractPaused"
  | "AccessControl"
  | "GasEstimationFailed"
  | "RpcFailure"
  | "TransactionFailed"
  | "NotConfigured"
  | "Unknown";

export interface ParsedError {
  code: ParsedErrorCode;
  title: string;
  message: string;
  /** Whether the user can sensibly retry the same action. */
  retryable: boolean;
  raw?: string;
}

/** Context lets the parser tailor revert messages to the action the user attempted. */
export type ErrorContext =
  | "fund"
  | "create"
  | "submitWork"
  | "approveWork"
  | "requestRefund"
  | "raiseDispute"
  | "resolveDispute"
  | "cancel"
  | "generic";

const STATUS_MESSAGES: Record<ErrorContext, string> = {
  fund: "This escrow cannot be funded because it is no longer in the Created state.",
  create: "The contract rejected the escrow creation due to its current state.",
  submitWork: "Work can only be submitted while the escrow is Funded.",
  approveWork: "Work can only be approved after the seller has submitted it.",
  requestRefund: "A refund is only possible while the escrow is Funded and the deadline has passed.",
  raiseDispute: "A dispute can only be raised while the escrow is Funded or Work Submitted.",
  resolveDispute: "This escrow is not currently in the Disputed state.",
  cancel: "Only unfunded escrows can be cancelled.",
  generic: "This action is not allowed in the escrow's current state.",
};

const REVERT_MESSAGES: Record<string, (ctx: ErrorContext) => Omit<ParsedError, "raw">> = {
  Unauthorized: () => ({
    code: "Unauthorized",
    title: "Not authorized",
    message: "The connected wallet is not permitted to perform this action on this escrow.",
    retryable: false,
  }),
  InvalidStatus: (ctx) => ({
    code: "InvalidStatus",
    title: "Invalid escrow state",
    message: STATUS_MESSAGES[ctx],
    retryable: false,
  }),
  InvalidAmount: () => ({
    code: "InvalidAmount",
    title: "Invalid amount",
    message: "The amount must be greater than zero.",
    retryable: true,
  }),
  DeadlineExpired: (ctx) => ({
    code: "DeadlineExpired",
    title: "Deadline passed",
    message:
      ctx === "submitWork"
        ? "The deadline has passed, so work can no longer be submitted. The buyer may now request a refund."
        : "The escrow deadline has already passed, so this action is no longer available.",
    retryable: false,
  }),
  DeadlineNotReached: () => ({
    code: "DeadlineNotReached",
    title: "Deadline not reached",
    message: "A refund can only be requested after the escrow deadline has passed.",
    retryable: false,
  }),
  InvalidDeadline: () => ({
    code: "InvalidDeadline",
    title: "Invalid deadline",
    message: "The deadline must be at least 1 hour and at most 365 days in the future.",
    retryable: true,
  }),
  InvalidAddress: () => ({
    code: "InvalidAddress",
    title: "Invalid address",
    message: "The provided address is not valid.",
    retryable: true,
  }),
  InvalidHash: () => ({
    code: "InvalidHash",
    title: "Invalid document hash",
    message: "The submitted document hash is empty.",
    retryable: true,
  }),
  SameParty: () => ({
    code: "SameParty",
    title: "Buyer and seller must differ",
    message: "You cannot create an escrow with your own wallet as the seller.",
    retryable: true,
  }),
  EscrowNotFound: () => ({
    code: "EscrowNotFound",
    title: "Escrow not found",
    message: "No escrow exists with that ID on this network.",
    retryable: false,
  }),
  TransferFailed: () => ({
    code: "TransferFailed",
    title: "Transfer failed",
    message:
      "The recipient rejected the AVAX transfer. Funds remain locked in the escrow; a dispute can route them elsewhere.",
    retryable: false,
  }),
  EnforcedPause: () => ({
    code: "ContractPaused",
    title: "Contract paused",
    message: "The escrow contract is currently paused by the administrator. Please try again later.",
    retryable: true,
  }),
  AccessControlUnauthorizedAccount: () => ({
    code: "AccessControl",
    title: "Missing role",
    message: "The connected wallet does not hold the role required for this action.",
    retryable: false,
  }),
};

function extractRevertName(error: unknown): string | undefined {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.data?.errorName ?? revert.reason;
    }
  }
  const text = errorText(error);
  const match = text.match(
    /\b(Unauthorized|InvalidStatus|InvalidAmount|DeadlineExpired|DeadlineNotReached|InvalidDeadline|InvalidAddress|InvalidHash|SameParty|EscrowNotFound|TransferFailed|EnforcedPause|AccessControlUnauthorizedAccount)\b/,
  );
  return match?.[1];
}

function errorText(error: unknown): string {
  if (error instanceof BaseError) return `${error.shortMessage}\n${error.details ?? ""}\n${error.message}`;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function parseContractError(error: unknown, ctx: ErrorContext = "generic"): ParsedError {
  const raw = errorText(error);
  const lower = raw.toLowerCase();

  if (
    error instanceof UserRejectedRequestError ||
    (error instanceof BaseError && error.walk((e) => e instanceof UserRejectedRequestError)) ||
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return {
      code: "UserRejectedRequest",
      title: "Transaction rejected",
      message: "You rejected the request in your wallet. Nothing was sent.",
      retryable: true,
      raw,
    };
  }

  const revertName = extractRevertName(error);
  if (revertName && REVERT_MESSAGES[revertName]) {
    return { ...REVERT_MESSAGES[revertName](ctx), raw };
  }

  if (
    error instanceof InsufficientFundsError ||
    (error instanceof BaseError && error.walk((e) => e instanceof InsufficientFundsError)) ||
    lower.includes("insufficient funds") ||
    lower.includes("insufficient balance")
  ) {
    return {
      code: "InsufficientFunds",
      title: "Insufficient AVAX",
      message: "Your wallet does not hold enough AVAX to cover the amount plus network gas.",
      retryable: true,
      raw,
    };
  }

  if (lower.includes("chain mismatch") || lower.includes("wrong network") || lower.includes("unsupported chain")) {
    return {
      code: "WrongNetwork",
      title: "Wrong network",
      message: `Please switch to ${ACTIVE_NETWORK.name} and try again.`,
      retryable: true,
      raw,
    };
  }

  if (lower.includes("gas") && (lower.includes("estimate") || lower.includes("out of gas"))) {
    return {
      code: "GasEstimationFailed",
      title: "Gas estimation failed",
      message: "The network could not estimate gas for this transaction. It would most likely revert.",
      retryable: true,
      raw,
    };
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("http request failed") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return {
      code: "RpcFailure",
      title: "Network unavailable",
      message: "The Avalanche RPC endpoint did not respond. Check your connection and retry.",
      retryable: true,
      raw,
    };
  }

  if (lower.includes("reverted") || lower.includes("execution reverted")) {
    return {
      code: "TransactionFailed",
      title: "Transaction reverted",
      message: "The smart contract rejected this transaction. " + STATUS_MESSAGES[ctx],
      retryable: false,
      raw,
    };
  }

  return {
    code: "Unknown",
    title: "Something went wrong",
    message: "The request could not be completed. Please try again.",
    retryable: true,
    raw,
  };
}

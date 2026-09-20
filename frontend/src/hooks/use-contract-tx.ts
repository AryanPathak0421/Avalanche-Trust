"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import type { Hash, PublicClient, TransactionReceipt, WalletClient } from "viem";
import { escrowContract } from "@/config/contract";
import { ACTIVE_CHAIN_ID } from "@/config/chains";
import { parseContractError, type ErrorContext, type ParsedError } from "@/lib/errors";
import { useInvalidateEscrows } from "@/hooks/use-escrow-events";
import { useNetwork } from "@/hooks/use-network";

export type TxPhase = "idle" | "estimating" | "confirming" | "pending" | "success" | "error";

export interface TxState {
  phase: TxPhase;
  hash?: Hash;
  receipt?: TransactionReceipt;
  error?: ParsedError;
  gasEstimate?: bigint;
}

type WriteFunction =
  | "createEscrow"
  | "fundEscrow"
  | "cancelEscrow"
  | "submitWork"
  | "approveWork"
  | "requestRefund"
  | "raiseDispute"
  | "resolveDispute";

export interface TxRequest {
  functionName: WriteFunction;
  args: readonly unknown[];
  value?: bigint;
  context: ErrorContext;
}

/**
 * Drives one contract write through: simulate (catches reverts before the wallet opens),
 * wallet confirmation, pending, receipt. Refreshes escrow queries on success.
 */
export function useContractTx() {
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ACTIVE_CHAIN_ID });
  const { address } = useAccount();
  const network = useNetwork();
  const invalidate = useInvalidateEscrows();

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const estimate = useCallback(
    async (req: TxRequest): Promise<bigint | undefined> => {
      if (!publicClient || !address) return undefined;
      try {
        const params = {
          ...escrowContract,
          functionName: req.functionName,
          args: req.args,
          value: req.value,
          account: address,
        } as unknown as Parameters<PublicClient["estimateContractGas"]>[0];
        return await publicClient.estimateContractGas(params);
      } catch {
        return undefined;
      }
    },
    [publicClient, address],
  );

  const send = useCallback(
    async (req: TxRequest): Promise<TransactionReceipt | undefined> => {
      if (!network.isConfigured) {
        setState({ phase: "error", error: parseContractError("NotConfigured", req.context) });
        return undefined;
      }
      if (!network.isConnected || !address || !walletClient || !publicClient) {
        setState({
          phase: "error",
          error: { code: "Unknown", title: "Wallet not connected", message: "Connect your Avalanche wallet first.", retryable: true },
        });
        return undefined;
      }
      if (!network.isSupported) {
        setState({ phase: "error", error: parseContractError("wrong network", req.context) });
        return undefined;
      }

      try {
        setState({ phase: "estimating" });
        const simulateParams = {
          ...escrowContract,
          functionName: req.functionName,
          args: req.args,
          value: req.value,
          account: address,
          chain: walletClient.chain,
        } as unknown as Parameters<PublicClient["simulateContract"]>[0];
        const { request } = await publicClient.simulateContract(simulateParams);
        const gasEstimate = await estimate(req);

        setState({ phase: "confirming", gasEstimate });
        const hash = await walletClient.writeContract(request as unknown as Parameters<WalletClient["writeContract"]>[0]);

        setState({ phase: "pending", hash, gasEstimate });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

        if (receipt.status !== "success") {
          setState({
            phase: "error",
            hash,
            receipt,
            error: {
              code: "TransactionFailed",
              title: "Transaction reverted",
              message: "The transaction was mined but reverted on-chain.",
              retryable: false,
            },
          });
          return receipt;
        }

        await invalidate();
        setState({ phase: "success", hash, receipt, gasEstimate });
        return receipt;
      } catch (err) {
        setState((prev) => ({ ...prev, phase: "error", error: parseContractError(err, req.context) }));
        return undefined;
      }
    },
    [network, address, walletClient, publicClient, estimate, invalidate],
  );

  return { state, send, estimate, reset, isBusy: ["estimating", "confirming", "pending"].includes(state.phase) };
}

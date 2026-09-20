"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { escrowContract, IS_CONTRACT_CONFIGURED } from "@/config/contract";
import { ACTIVE_CHAIN_ID } from "@/config/chains";
import { toEscrow, type RawEscrow } from "@/lib/escrow";
import { EscrowStatus, type Escrow } from "@/types/escrow";

const REFETCH_MS = 15_000;

function useEscrowBatch(ids: bigint[], enabled = true) {
  const query = useReadContracts({
    contracts: ids.map((id) => ({
      ...escrowContract,
      functionName: "getEscrow" as const,
      args: [id] as const,
      chainId: ACTIVE_CHAIN_ID,
    })),
    query: { enabled: IS_CONTRACT_CONFIGURED && enabled && ids.length > 0, refetchInterval: REFETCH_MS },
  });

  const escrows = useMemo<Escrow[]>(() => {
    if (!query.data) return [];
    return query.data.flatMap((result, i) =>
      result.status === "success" && result.result ? [toEscrow(ids[i], result.result as RawEscrow)] : [],
    );
  }, [query.data, ids]);

  return { escrows, ...query };
}

/** Single escrow by id, refreshed periodically so on-chain state stays current after refresh. */
export function useEscrow(id: bigint | undefined) {
  const query = useReadContract({
    ...escrowContract,
    functionName: "getEscrow",
    args: id !== undefined ? [id] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: IS_CONTRACT_CONFIGURED && id !== undefined, refetchInterval: REFETCH_MS, retry: 1 },
  });
  const escrow = useMemo(
    () => (query.data && id !== undefined ? toEscrow(id, query.data as RawEscrow) : undefined),
    [query.data, id],
  );
  return { escrow, ...query };
}

/** All escrows where the connected (or given) address is buyer or seller. */
export function useMyEscrows(address?: Address) {
  const { address: connected } = useAccount();
  const account = address ?? connected;

  const idsQuery = useReadContract({
    ...escrowContract,
    functionName: "getEscrowsByParticipant",
    args: account ? [account] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: IS_CONTRACT_CONFIGURED && !!account, refetchInterval: REFETCH_MS },
  });

  const ids = useMemo(() => [...((idsQuery.data as readonly bigint[] | undefined) ?? [])].reverse(), [idsQuery.data]);
  const batch = useEscrowBatch(ids);

  return {
    escrows: batch.escrows,
    isLoading: idsQuery.isLoading || (ids.length > 0 && batch.isLoading),
    isError: idsQuery.isError || batch.isError,
    error: idsQuery.error ?? batch.error,
    refetch: async () => {
      await idsQuery.refetch();
      await batch.refetch();
    },
  };
}

/**
 * Every escrow on the contract (ids 1..escrowCount). Used by the arbitrator view.
 * Escrow ids are sequential, so a count is enough to enumerate them via multicall.
 */
export function useAllEscrows(enabled = true) {
  const countQuery = useReadContract({
    ...escrowContract,
    functionName: "escrowCount",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: IS_CONTRACT_CONFIGURED && enabled, refetchInterval: REFETCH_MS },
  });
  const count = Number((countQuery.data as bigint | undefined) ?? 0n);
  const ids = useMemo(() => Array.from({ length: count }, (_, i) => BigInt(count - i)), [count]);
  const batch = useEscrowBatch(ids, enabled);

  return {
    escrows: batch.escrows,
    isLoading: countQuery.isLoading || (count > 0 && batch.isLoading),
    isError: countQuery.isError || batch.isError,
    error: countQuery.error ?? batch.error,
    refetch: async () => {
      await countQuery.refetch();
      await batch.refetch();
    },
  };
}

export function useDisputedEscrows(arbitrator?: Address) {
  const all = useAllEscrows(!!arbitrator);
  const escrows = useMemo(() => {
    const mine = arbitrator
      ? all.escrows.filter((e) => e.arbitrator.toLowerCase() === arbitrator.toLowerCase())
      : all.escrows;
    return {
      open: mine.filter((e) => e.status === EscrowStatus.Disputed),
      resolved: mine.filter(
        (e) =>
          e.disputeRaisedBy !== "0x0000000000000000000000000000000000000000" &&
          e.status !== EscrowStatus.Disputed,
      ),
    };
  }, [all.escrows, arbitrator]);
  return { ...escrows, isLoading: all.isLoading, isError: all.isError, refetch: all.refetch };
}

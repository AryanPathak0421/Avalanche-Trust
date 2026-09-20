"use client";

import { useCallback, useEffect } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatLog, numberToHex, parseEventLogs, type Log, type RpcLog } from "viem";

function formatLogs(raw: RpcLog[]): Log[] {
  return raw.map((l) => formatLog(l));
}
import { escrowContract, CONTRACT_DEPLOY_BLOCK, IS_CONTRACT_CONFIGURED } from "@/config/contract";
import { ACTIVE_CHAIN_ID } from "@/config/chains";
import { LIMITS } from "@/config/site";
import type { EscrowEvent, EscrowEventName } from "@/types/escrow";

const EVENT_NAMES: EscrowEventName[] = [
  "EscrowCreated",
  "EscrowFunded",
  "WorkSubmitted",
  "EscrowCompleted",
  "DisputeRaised",
  "DisputeResolved",
  "EscrowRefunded",
  "EscrowCancelled",
];

function toEscrowEvent(log: Log & { eventName: string; args: Record<string, unknown> }): EscrowEvent | null {
  if (!EVENT_NAMES.includes(log.eventName as EscrowEventName)) return null;
  const args = log.args;
  const escrowId = args.escrowId;
  if (typeof escrowId !== "bigint" || !log.transactionHash || log.blockNumber === null || log.logIndex === null) {
    return null;
  }
  const cleanArgs: EscrowEvent["args"] = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" || typeof v === "bigint" || typeof v === "boolean") cleanArgs[k] = v;
  }
  return {
    name: log.eventName as EscrowEventName,
    escrowId,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    args: cleanArgs,
  };
}

export function eventsQueryKey(escrowId: bigint | undefined) {
  return ["escrow-events", ACTIVE_CHAIN_ID, escrowContract.address, escrowId?.toString() ?? "all"] as const;
}

/**
 * Reconstructs the activity timeline of one escrow from contract logs, scanning from the
 * deploy block in RPC-friendly chunks, then keeps it fresh with a live event subscription.
 */
export function useEscrowEvents(escrowId: bigint | undefined) {
  const client = usePublicClient({ chainId: ACTIVE_CHAIN_ID });
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: eventsQueryKey(escrowId),
    enabled: IS_CONTRACT_CONFIGURED && !!client && escrowId !== undefined,
    staleTime: 30_000,
    queryFn: async (): Promise<EscrowEvent[]> => {
      if (!client || escrowId === undefined) return [];
      const latest = await client.getBlockNumber();
      const events: EscrowEvent[] = [];
      const chunk = LIMITS.logChunkSize;

      // Every escrow event indexes `escrowId` as its first topic, so a single topic filter
      // narrows the scan to this escrow regardless of event type.
      const idTopic = numberToHex(escrowId, { size: 32 });

      for (let from = CONTRACT_DEPLOY_BLOCK; from <= latest; from += chunk) {
        const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
        const rawLogs = await client.request({
          method: "eth_getLogs",
          params: [
            {
              address: escrowContract.address,
              fromBlock: numberToHex(from),
              toBlock: numberToHex(to),
              topics: [null, idTopic],
            },
          ],
        });
        const parsed = parseEventLogs({ abi: escrowContract.abi, logs: formatLogs(rawLogs) });
        for (const log of parsed) {
          const ev = toEscrowEvent(log as unknown as Parameters<typeof toEscrowEvent>[0]);
          if (ev) events.push(ev);
        }
      }

      const blocks = new Map<bigint, number>();
      for (const ev of events) {
        if (!blocks.has(ev.blockNumber)) {
          const block = await client.getBlock({ blockNumber: ev.blockNumber });
          blocks.set(ev.blockNumber, Number(block.timestamp));
        }
        ev.timestamp = blocks.get(ev.blockNumber);
      }

      return events.sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber),
      );
    },
  });

  const onLogs = useCallback(
    (logs: Log[]) => {
      const parsed = parseEventLogs({ abi: escrowContract.abi, logs });
      const relevant = parsed.some((l) => (l.args as { escrowId?: bigint }).escrowId === escrowId);
      if (relevant) void queryClient.invalidateQueries({ queryKey: eventsQueryKey(escrowId) });
    },
    [escrowId, queryClient],
  );

  useWatchContractEvent({
    ...escrowContract,
    chainId: ACTIVE_CHAIN_ID,
    enabled: IS_CONTRACT_CONFIGURED && escrowId !== undefined,
    onLogs,
    poll: true,
    pollingInterval: 8_000,
  });

  return query;
}

/** Invalidate all escrow reads after a confirmed transaction. */
export function useInvalidateEscrows() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["readContract"] });
    await queryClient.invalidateQueries({ queryKey: ["readContracts"] });
    await queryClient.invalidateQueries({ queryKey: ["escrow-events"] });
    await queryClient.invalidateQueries({ queryKey: ["balance"] });
  }, [queryClient]);
}

/** Global live listener: refreshes escrow queries whenever the contract emits anything. */
export function useLiveEscrowRefresh() {
  const invalidate = useInvalidateEscrows();
  useWatchContractEvent({
    ...escrowContract,
    chainId: ACTIVE_CHAIN_ID,
    enabled: IS_CONTRACT_CONFIGURED,
    onLogs: () => void invalidate(),
    poll: true,
    pollingInterval: 10_000,
  });
  useEffect(() => () => undefined, []);
}

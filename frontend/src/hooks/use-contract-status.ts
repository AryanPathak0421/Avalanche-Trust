"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { keccak256, stringToHex, type Address } from "viem";
import { escrowContract, IS_CONTRACT_CONFIGURED } from "@/config/contract";
import { ACTIVE_CHAIN_ID } from "@/config/chains";

export const ARBITRATOR_ROLE = keccak256(stringToHex("ARBITRATOR_ROLE"));
export const PAUSER_ROLE = keccak256(stringToHex("PAUSER_ROLE"));
export const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function useContractPaused() {
  const query = useReadContract({
    ...escrowContract,
    functionName: "paused",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: IS_CONTRACT_CONFIGURED, refetchInterval: 30_000 },
  });
  return { paused: query.data ?? false, ...query };
}

export function useAccountRoles(address?: Address) {
  const { address: connected } = useAccount();
  const account = address ?? connected;

  const query = useReadContracts({
    contracts: [
      { ...escrowContract, functionName: "hasRole", args: [ARBITRATOR_ROLE, account!], chainId: ACTIVE_CHAIN_ID },
      { ...escrowContract, functionName: "hasRole", args: [PAUSER_ROLE, account!], chainId: ACTIVE_CHAIN_ID },
      { ...escrowContract, functionName: "hasRole", args: [DEFAULT_ADMIN_ROLE, account!], chainId: ACTIVE_CHAIN_ID },
    ],
    query: { enabled: IS_CONTRACT_CONFIGURED && !!account },
  });

  const [arb, pauser, admin] = query.data ?? [];
  return {
    isArbitrator: arb?.result === true,
    isPauser: pauser?.result === true,
    isAdmin: admin?.result === true,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useContractGlobals() {
  const query = useReadContracts({
    contracts: [
      { ...escrowContract, functionName: "totalValueLocked", chainId: ACTIVE_CHAIN_ID },
      { ...escrowContract, functionName: "escrowCount", chainId: ACTIVE_CHAIN_ID },
      { ...escrowContract, functionName: "defaultArbitrator", chainId: ACTIVE_CHAIN_ID },
    ],
    query: { enabled: IS_CONTRACT_CONFIGURED, refetchInterval: 30_000 },
  });
  const [tvl, count, arbitrator] = query.data ?? [];
  return {
    totalValueLocked: (tvl?.result as bigint | undefined) ?? 0n,
    escrowCount: (count?.result as bigint | undefined) ?? 0n,
    defaultArbitrator: arbitrator?.result as Address | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

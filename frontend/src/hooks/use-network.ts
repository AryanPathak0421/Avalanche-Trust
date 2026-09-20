"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK, isSupportedChain } from "@/config/chains";
import { IS_CONTRACT_CONFIGURED } from "@/config/contract";

export interface NetworkState {
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | undefined;
  isSupported: boolean;
  isWrongNetwork: boolean;
  isConfigured: boolean;
  /** True only when the wallet is connected, on the right chain and the contract is configured. */
  isReady: boolean;
  targetChainId: number;
  targetChainName: string;
  switchNetwork: () => void;
  isSwitching: boolean;
  switchError: Error | null;
}

export function useNetwork(): NetworkState {
  const { chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  const isSupported = isSupportedChain(chainId);
  const isWrongNetwork = isConnected && !isSupported;

  return {
    isConnected,
    isConnecting: isConnecting || isReconnecting,
    chainId,
    isSupported,
    isWrongNetwork,
    isConfigured: IS_CONTRACT_CONFIGURED,
    isReady: isConnected && isSupported && IS_CONTRACT_CONFIGURED,
    targetChainId: ACTIVE_CHAIN_ID,
    targetChainName: ACTIVE_NETWORK.name,
    switchNetwork: () => switchChain({ chainId: ACTIVE_CHAIN_ID }),
    isSwitching: isPending,
    switchError: error ?? null,
  };
}

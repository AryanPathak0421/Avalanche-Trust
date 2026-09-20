import { avalanche, avalancheFuji } from "wagmi/chains";
import type { Chain } from "viem";

export const FUJI_CHAIN_ID = 43113;
export const MAINNET_CHAIN_ID = 43114;
export const LOCAL_CHAIN_ID = 31337;

export type SupportedChainId = typeof FUJI_CHAIN_ID | typeof MAINNET_CHAIN_ID;

interface NetworkDefinition {
  chain: Chain;
  name: string;
  shortName: string;
  explorerUrl: string;
  defaultRpcUrl: string;
  isTestnet: boolean;
}

export const NETWORKS: Record<SupportedChainId, NetworkDefinition> = {
  [FUJI_CHAIN_ID]: {
    chain: avalancheFuji,
    name: "Avalanche Fuji Testnet",
    shortName: "Avalanche Fuji",
    explorerUrl: "https://testnet.snowtrace.io",
    defaultRpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    isTestnet: true,
  },
  [MAINNET_CHAIN_ID]: {
    chain: avalanche,
    name: "Avalanche C-Chain",
    shortName: "Avalanche",
    explorerUrl: "https://snowtrace.io",
    defaultRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    isTestnet: false,
  },
};

function parseChainId(raw: string | undefined): SupportedChainId {
  const parsed = Number(raw ?? FUJI_CHAIN_ID);
  if (parsed === MAINNET_CHAIN_ID) return MAINNET_CHAIN_ID;
  return FUJI_CHAIN_ID;
}

/** The single chain this deployment of the app targets. */
export const ACTIVE_CHAIN_ID: SupportedChainId = parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID);

export const ACTIVE_NETWORK = NETWORKS[ACTIVE_CHAIN_ID];

export const ACTIVE_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || ACTIVE_NETWORK.defaultRpcUrl;

export const ACTIVE_EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL || ACTIVE_NETWORK.explorerUrl).replace(/\/$/, "");

/** Chain object with the configured RPC substituted in, so wagmi/viem use it everywhere. */
export const activeChain: Chain = {
  ...ACTIVE_NETWORK.chain,
  rpcUrls: {
    ...ACTIVE_NETWORK.chain.rpcUrls,
    default: { http: [ACTIVE_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Snowtrace", url: ACTIVE_EXPLORER_URL },
  },
};

export function isSupportedChain(chainId: number | undefined): chainId is SupportedChainId {
  return chainId === ACTIVE_CHAIN_ID;
}

import { createConfig, http, cookieStorage, createStorage, type CreateConnectorFn } from "wagmi";
import { injected, metaMask, mock, walletConnect } from "wagmi/connectors";
import type { Address } from "viem";
import { activeChain, ACTIVE_RPC_URL } from "@/config/chains";
import { SITE } from "@/config/site";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/**
 * Development-only wallet backed by a local Anvil node's unlocked accounts.
 * Transactions are forwarded to the RPC as `eth_sendTransaction`, so they are real
 * on-chain transactions on the local chain. Never enabled in production builds.
 */
const DEV_WALLET_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEV_WALLET === "true";
const ANVIL_ACCOUNTS: readonly [Address, ...Address[]] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
];

function buildConnectors() {
  const connectors: CreateConnectorFn[] = [
    metaMask({ dappMetadata: { name: SITE.name, url: SITE.url } }),
    injected({ shimDisconnect: true }),
  ];
  if (DEV_WALLET_ENABLED) {
    connectors.push(mock({ accounts: ANVIL_ACCOUNTS, features: { reconnect: true, defaultConnected: true } }));
  }
  if (walletConnectProjectId) {
    connectors.push(
      walletConnect({
        projectId: walletConnectProjectId,
        showQrModal: true,
        metadata: {
          name: SITE.name,
          description: SITE.description,
          url: SITE.url,
          icons: [`${SITE.url}/icon.svg`],
        },
      }),
    );
  }
  return connectors;
}

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: buildConnectors(),
  transports: {
    [activeChain.id]: http(ACTIVE_RPC_URL, { batch: true }),
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

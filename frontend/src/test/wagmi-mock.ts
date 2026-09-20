import { vi } from "vitest";
import type { Address } from "viem";

/**
 * Shared wagmi mock used by component tests. Tests call `vi.mock("wagmi", () => wagmiMock)`
 * and tweak `mockState` before rendering.
 */
export const BUYER: Address = "0x1111111111111111111111111111111111111111";
export const SELLER: Address = "0x2222222222222222222222222222222222222222";

export const mockState = {
  address: BUYER as Address | undefined,
  isConnected: true,
  chainId: 43113 as number | undefined,
  balance: 10n ** 19n, // 10 AVAX
  switchChain: vi.fn(),
  isSwitching: false,
};

export function resetMockState() {
  mockState.address = BUYER;
  mockState.isConnected = true;
  mockState.chainId = 43113;
  mockState.balance = 10n ** 19n;
  mockState.switchChain = vi.fn();
  mockState.isSwitching = false;
}

export const wagmiMock = {
  useAccount: () => ({
    address: mockState.isConnected ? mockState.address : undefined,
    isConnected: mockState.isConnected,
    isConnecting: false,
    isReconnecting: false,
    chainId: mockState.isConnected ? mockState.chainId : undefined,
    connector: mockState.isConnected ? { name: "MetaMask", id: "metaMask" } : undefined,
  }),
  useSwitchChain: () => ({ switchChain: mockState.switchChain, isPending: mockState.isSwitching, error: null }),
  useBalance: () => ({ data: { value: mockState.balance, decimals: 18, symbol: "AVAX" } }),
  useConnect: () => ({ connectors: [], connectAsync: vi.fn(), isPending: false, error: null }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useReadContract: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useReadContracts: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  usePublicClient: () => undefined,
  useWalletClient: () => ({ data: undefined }),
  useWatchContractEvent: () => undefined,
  useChainId: () => mockState.chainId,
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
  createConfig: () => ({}),
  http: () => ({}),
  cookieStorage: {},
  createStorage: () => ({}),
  cookieToInitialState: () => undefined,
};

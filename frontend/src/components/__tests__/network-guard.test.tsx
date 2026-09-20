import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { mockState, resetMockState, wagmiMock } from "@/test/wagmi-mock";

vi.mock("wagmi", () => wagmiMock);
vi.mock("@/config/contract", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/config/contract")>();
  return { ...original, IS_CONTRACT_CONFIGURED: true, CONTRACT_ADDRESS: "0x9999999999999999999999999999999999999999" };
});

import { NetworkGuard, WrongNetworkBanner } from "@/components/wallet/network-guard";

describe("NetworkGuard", () => {
  beforeEach(() => resetMockState());

  it("renders children when connected on Fuji", () => {
    render(
      <NetworkGuard>
        <p>protected content</p>
      </NetworkGuard>,
    );
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("prompts to connect when no wallet is connected", () => {
    mockState.isConnected = false;
    render(
      <NetworkGuard>
        <p>protected content</p>
      </NetworkGuard>,
    );
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /connect avalanche wallet/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /connect/i }).length).toBeGreaterThan(0);
  });

  it("shows wrong-network state with a switch button", () => {
    mockState.chainId = 1;
    render(
      <NetworkGuard>
        <p>protected content</p>
      </NetworkGuard>,
    );
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByText(/please switch to avalanche fuji testnet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /switch network/i }));
    expect(mockState.switchChain).toHaveBeenCalledWith({ chainId: 43113 });
  });
});

describe("WrongNetworkBanner", () => {
  beforeEach(() => resetMockState());

  it("is hidden on the supported chain", () => {
    const { container } = render(<WrongNetworkBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears on an unsupported chain", () => {
    mockState.chainId = 56;
    render(<WrongNetworkBanner />);
    expect(screen.getByText(/please switch to avalanche fuji testnet/i)).toBeInTheDocument();
  });
});

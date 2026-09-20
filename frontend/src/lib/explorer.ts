import { ACTIVE_EXPLORER_URL } from "@/config/chains";

export function getExplorerTxUrl(txHash: string, explorerUrl: string = ACTIVE_EXPLORER_URL): string {
  return `${explorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string, explorerUrl: string = ACTIVE_EXPLORER_URL): string {
  return `${explorerUrl}/address/${address}`;
}

export function getExplorerBlockUrl(block: bigint | number, explorerUrl: string = ACTIVE_EXPLORER_URL): string {
  return `${explorerUrl}/block/${block.toString()}`;
}

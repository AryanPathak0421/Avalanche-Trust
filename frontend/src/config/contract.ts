import { isAddress, type Address } from "viem";
import { avalancheTrustEscrowAbi } from "@/contracts/AvalancheTrustEscrow.abi";

const rawAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

/** Contract address for the active chain, or `undefined` if the app is not configured yet. */
export const CONTRACT_ADDRESS: Address | undefined = isAddress(rawAddress) ? (rawAddress as Address) : undefined;

export const IS_CONTRACT_CONFIGURED = CONTRACT_ADDRESS !== undefined;

/** Block at which the contract was deployed; event queries start here. */
export const CONTRACT_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK ?? "0");

export const escrowContract = {
  address: CONTRACT_ADDRESS ?? ("0x0000000000000000000000000000000000000000" as Address),
  abi: avalancheTrustEscrowAbi,
} as const;

export { avalancheTrustEscrowAbi };

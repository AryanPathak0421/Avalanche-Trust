import { createPublicClient, http, parseAbi, parseEventLogs, type Address, type Log } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";
import { prisma } from "./lib/prisma.js";

/**
 * Event indexer: tails AvalancheTrustEscrow events and turns them into notifications for
 * registered wallets. Read-only. Can be restarted at any time; progress is stored in
 * IndexerCursor so blocks are never processed twice.
 *
 * Env: RPC_URL, CHAIN_ID (43113|43114), CONTRACT_ADDRESS, CONTRACT_DEPLOY_BLOCK, POLL_MS
 */

const abi = parseAbi([
  "event EscrowCreated(uint256 indexed escrowId, address indexed buyer, address indexed seller, uint256 deadline, bytes32 agreementHash, address arbitrator)",
  "event EscrowFunded(uint256 indexed escrowId, uint256 amount)",
  "event WorkSubmitted(uint256 indexed escrowId, bytes32 workHash)",
  "event EscrowCompleted(uint256 indexed escrowId, uint256 amount)",
  "event DisputeRaised(uint256 indexed escrowId, bytes32 reasonHash, address indexed raisedBy)",
  "event DisputeResolved(uint256 indexed escrowId, address winner, uint256 amount)",
  "event EscrowRefunded(uint256 indexed escrowId, uint256 amount)",
  "event EscrowCancelled(uint256 indexed escrowId)",
  "function getEscrow(uint256) view returns ((address buyer,address seller,address arbitrator,uint256 amount,uint64 createdAt,uint64 fundedAt,uint64 deadline,uint64 completedAt,uint64 disputedAt,uint64 resolvedAt,uint8 status,bytes32 agreementHash,bytes32 workSubmissionHash,bytes32 disputeReasonHash,address disputeRaisedBy))",
]);

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 43113);
const CONTRACT = (process.env.CONTRACT_ADDRESS ?? "") as Address;
const START_BLOCK = BigInt(process.env.CONTRACT_DEPLOY_BLOCK ?? "0");
const POLL_MS = Number(process.env.POLL_MS ?? 8000);
const CHUNK = 2000n;

if (!CONTRACT) {
  console.error("CONTRACT_ADDRESS is required");
  process.exit(1);
}

const chain = CHAIN_ID === 43114 ? avalanche : avalancheFuji;
const client = createPublicClient({ chain, transport: http(process.env.RPC_URL) });

const MESSAGES: Record<string, (id: string) => string> = {
  EscrowCreated: (id) => `You were added as the seller on escrow #${id}.`,
  EscrowFunded: (id) => `Escrow #${id} has been funded. You can now submit work.`,
  WorkSubmitted: (id) => `Work was submitted on escrow #${id}. Please review and approve.`,
  EscrowCompleted: (id) => `Escrow #${id} completed and payment was released.`,
  DisputeRaised: (id) => `A dispute was raised on escrow #${id}.`,
  DisputeResolved: (id) => `The dispute on escrow #${id} was resolved.`,
  EscrowRefunded: (id) => `Escrow #${id} was refunded.`,
  EscrowCancelled: (id) => `Escrow #${id} was cancelled.`,
};

/** Which parties should hear about each event. */
function recipients(eventName: string, buyer: string, seller: string): string[] {
  switch (eventName) {
    case "EscrowCreated":
    case "EscrowFunded":
      return [seller];
    case "WorkSubmitted":
      return [buyer];
    default:
      return [buyer, seller];
  }
}

async function notify(log: Log, eventName: string, escrowId: bigint) {
  const escrow = await client.readContract({ address: CONTRACT, abi, functionName: "getEscrow", args: [escrowId] });
  const wallets = recipients(eventName, escrow.buyer.toLowerCase(), escrow.seller.toLowerCase());
  const users = await prisma.user.findMany({ where: { walletAddress: { in: wallets } } });
  for (const user of users) {
    await prisma.notification.upsert({
      where: { txHash_event_userId: { txHash: log.transactionHash!, event: eventName, userId: user.id } },
      create: {
        userId: user.id,
        chainId: CHAIN_ID,
        escrowId: escrowId.toString(),
        event: eventName,
        txHash: log.transactionHash!,
        message: MESSAGES[eventName]?.(escrowId.toString()) ?? eventName,
      },
      update: {},
    });
  }
  if (eventName === "DisputeRaised") {
    await prisma.disputeMetadata.upsert({
      where: {
        chainId_escrowId_reasonHash: { chainId: CHAIN_ID, escrowId: escrowId.toString(), reasonHash: escrow.disputeReasonHash },
      },
      create: {
        chainId: CHAIN_ID,
        escrowId: escrowId.toString(),
        reasonHash: escrow.disputeReasonHash,
        raisedBy: escrow.disputeRaisedBy.toLowerCase(),
      },
      update: {},
    });
  }
}

async function tick() {
  const cursor = await prisma.indexerCursor.findUnique({
    where: { chainId_contract: { chainId: CHAIN_ID, contract: CONTRACT.toLowerCase() } },
  });
  let from = cursor ? cursor.lastBlock + 1n : START_BLOCK;
  const latest = await client.getBlockNumber();

  while (from <= latest) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await client.getLogs({ address: CONTRACT, fromBlock: from, toBlock: to });
    const parsed = parseEventLogs({ abi, logs });
    for (const log of parsed) {
      const escrowId = (log.args as { escrowId?: bigint }).escrowId;
      if (escrowId === undefined) continue;
      await notify(log, log.eventName, escrowId);
    }
    await prisma.indexerCursor.upsert({
      where: { chainId_contract: { chainId: CHAIN_ID, contract: CONTRACT.toLowerCase() } },
      create: { chainId: CHAIN_ID, contract: CONTRACT.toLowerCase(), lastBlock: to },
      update: { lastBlock: to },
    });
    if (parsed.length) console.log(`Indexed ${parsed.length} events in blocks ${from}-${to}`);
    from = to + 1n;
  }
}

async function main() {
  console.log(`Indexer started for ${CONTRACT} on chain ${CHAIN_ID}`);
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("Indexer tick failed:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void main();

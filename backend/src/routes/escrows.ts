import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { chainId, escrowMetadataBody } from "../lib/validation.js";

export const escrowsRouter = Router();

/** POST /escrows — link an on-chain escrow id to its agreement hash / title. */
escrowsRouter.post("/", async (req, res) => {
  const parsed = escrowMetadataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }
  const { chainId: cid, escrowId, agreementHash, txHash, title } = parsed.data;
  const row = await prisma.escrowMetadata.upsert({
    where: { chainId_escrowId: { chainId: cid, escrowId } },
    create: { chainId: cid, escrowId, agreementHash, createdTxHash: txHash, title },
    update: { title: title ?? undefined },
  });
  res.status(201).json(row);
});

/** GET /escrows/:chainId/:escrowId */
escrowsRouter.get("/:chainId/:escrowId", async (req, res) => {
  const cid = chainId.safeParse(req.params.chainId);
  if (!cid.success || !/^\d+$/.test(req.params.escrowId)) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }
  const row = await prisma.escrowMetadata.findUnique({
    where: { chainId_escrowId: { chainId: cid.data, escrowId: req.params.escrowId } },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

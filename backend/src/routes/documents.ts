import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { chainId, hashDocument, hexHash, storeDocumentBody } from "../lib/validation.js";

export const documentsRouter = Router();

/**
 * POST /documents
 * Stores the full text behind an on-chain hash. The server recomputes the hash and refuses
 * anything that does not match, so the store can never serve content that contradicts the chain.
 */
documentsRouter.post("/", async (req, res) => {
  const parsed = storeDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }
  const { chainId: cid, hash, payload } = parsed.data;
  if (hashDocument(payload) !== hash) {
    res.status(422).json({ error: "Payload does not hash to the supplied value" });
    return;
  }
  const doc = await prisma.document.upsert({
    where: { chainId_hash: { chainId: cid, hash } },
    create: { chainId: cid, hash, kind: payload.kind, payload, fileName: payload.fileName, fileHash: payload.fileHash },
    update: {},
  });
  res.status(201).json({ id: doc.id, hash: doc.hash });
});

/** GET /documents/:chainId/:hash */
documentsRouter.get("/:chainId/:hash", async (req, res) => {
  const cid = chainId.safeParse(req.params.chainId);
  const hash = hexHash.safeParse(req.params.hash);
  if (!cid.success || !hash.success) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }
  const doc = await prisma.document.findUnique({ where: { chainId_hash: { chainId: cid.data, hash: hash.data } } });
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ hash: doc.hash, kind: doc.kind, payload: doc.payload, createdAt: doc.createdAt });
});

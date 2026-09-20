import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { address, registerUserBody } from "../lib/validation.js";

export const notificationsRouter = Router();

/** POST /users — register (or update) a wallet so the indexer can address notifications to it. */
notificationsRouter.post("/users", async (req, res) => {
  const parsed = registerUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }
  const { walletAddress, displayName, email } = parsed.data;
  const user = await prisma.user.upsert({
    where: { walletAddress },
    create: { walletAddress, displayName, email },
    update: { displayName: displayName ?? undefined, email: email ?? undefined },
  });
  res.status(201).json({ id: user.id, walletAddress: user.walletAddress });
});

/** GET /notifications/:address?unread=true */
notificationsRouter.get("/notifications/:address", async (req, res) => {
  const addr = address.safeParse(req.params.address);
  if (!addr.success) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { walletAddress: addr.data } });
  if (!user) {
    res.json([]);
    return;
  }
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, ...(req.query.unread === "true" ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(rows);
});

/** POST /notifications/:id/read */
notificationsRouter.post("/notifications/:id/read", async (req, res) => {
  const updated = await prisma.notification.updateMany({ where: { id: req.params.id }, data: { read: true } });
  res.json({ updated: updated.count });
});

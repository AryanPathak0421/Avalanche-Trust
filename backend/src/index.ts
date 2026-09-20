import express from "express";
import cors from "cors";
import helmet from "helmet";
import { documentsRouter } from "./routes/documents.js";
import { escrowsRouter } from "./routes/escrows.js";
import { notificationsRouter } from "./routes/notifications.js";

/**
 * AvalancheTrust metadata API.
 *
 * Deliberately has NO private keys, NO signing capability and NO write access to the
 * blockchain. It stores off-chain documents (verified against their on-chain hashes),
 * escrow titles, dispute notes and notifications. Financial state always comes from the chain.
 */
const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim());

app.use(helmet());
app.use(cors({ origin: ORIGINS }));
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => res.json({ ok: true, custody: "none" }));
app.use("/documents", documentsRouter);
app.use("/escrows", escrowsRouter);
app.use("/", notificationsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

app.listen(PORT, () => {
  console.log(`AvalancheTrust backend listening on :${PORT} (allowed origins: ${ORIGINS.join(", ")})`);
});

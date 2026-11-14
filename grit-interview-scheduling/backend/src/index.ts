// ─────────────────────────────────────────────────────────────────────────────
// GRIT Interview Scheduling API — Express server (port 4000).
// ─────────────────────────────────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import { general } from "./routes/general.js";
import { booking } from "./routes/booking.js";
import { slots } from "./routes/slots.js";
import { interviews } from "./routes/interviews.js";
import { outcomes } from "./routes/outcomes.js";
import { badges } from "./routes/badges.js";
import { ai } from "./routes/ai.js";
import { admin } from "./routes/admin.js";

const PORT = Number(process.env.PORT ?? 4000);
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check — used by the eval pipeline to wait for the server.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "grit-backend", time: new Date().toISOString() });
});

app.use("/api", general);
app.use("/api", booking);
// Resource routers define their sub-paths relative to the resource root.
app.use("/api/slots", slots);
app.use("/api/interviews", interviews);
app.use("/api/outcomes", outcomes);
app.use("/api/badges", badges);
app.use("/api/ai", ai);
app.use("/api/admin", admin);

// Uniform 404 + error handling
app.use("/api", (_req, res) => res.status(404).json({ ok: false, error: "Unknown API route." }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[grit-backend]", err);
  res.status(500).json({ ok: false, error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`[grit-backend] listening on http://localhost:${PORT}`);
});

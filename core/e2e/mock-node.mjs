#!/usr/bin/env node
/**
 * Mock PDP node for e2e tests. Implements /health, /preflight, /start.
 * On /start: returns 202 then POSTs to Core /jobs/:job_id/complete with SUCCESS
 * (no Docker, no DB). Uses CORE_URL and PORT env.
 */
import express from "express";

const CORE_URL = (process.env.CORE_URL || "http://localhost:3000").replace(/\/$/, "");
const PORT = Number(process.env.PORT) || 4002;

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/preflight", (_req, res) => {
  res.json({ ok: true });
});

app.post("/start", (req, res) => {
  const { job_id, attempt_id } = req.body || {};
  if (!job_id || !attempt_id) {
    return res.status(400).json({ error: "Missing job_id or attempt_id" });
  }
  res.status(202).json({ accepted: true });

  // After a short delay, report success to Core (simulates node finishing compute)
  const metrics = { wall_seconds: 0.5, cpu_seconds: 0.5, memory_mb_peak: 512 };
  const cuUsed = metrics.cpu_seconds * 0.001 + metrics.wall_seconds * metrics.memory_mb_peak * 0.00001;
  const completeBody = {
    job_id,
    attempt_id,
    status: "SUCCESS",
    metrics,
    cu_used: Math.max(0.001, cuUsed),
    result_cid: "stdout:e2e-mock-" + Date.now(),
  };

  setTimeout(async () => {
    try {
      const r = await fetch(`${CORE_URL}/jobs/${job_id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeBody),
      });
      if (!r.ok) {
        console.error("Mock node: complete failed", r.status, await r.text());
      }
    } catch (e) {
      console.error("Mock node: complete request error", e.message);
    }
  }, 300);
});

const server = app.listen(PORT, () => {
  console.log(`Mock node listening on http://localhost:${PORT}`);
});

process.on("SIGINT", () => { server.close(); process.exit(0); });
process.on("SIGTERM", () => { server.close(); process.exit(0); });

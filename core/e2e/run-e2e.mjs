#!/usr/bin/env node
/**
 * E2E test: client -> Core API -> Node API -> Core API -> client.
 *
 * Two modes (env-driven, no hardcoded domains):
 *
 * 1. Live: set LIVE_CORE_URL (and optionally LIVE_NODE_ID, LIVE_DATASET_ID).
 *    No spawning; hits your live Core and node (e.g. compute.abhayu.com).
 *    Example: LIVE_CORE_URL=https://core.abhayu.com LIVE_NODE_ID=node-001 LIVE_DATASET_ID=1 node e2e/run-e2e.mjs
 *
 * 2. Mock (default): spawns Core + mock node on random ports, no live infra.
 *    Run: node e2e/run-e2e.mjs  (from core/) or npm run e2e
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(__dirname, "..");

function randomPort(min = 3000, max = 65535) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const LIVE_CORE_URL = process.env.LIVE_CORE_URL ? process.env.LIVE_CORE_URL.replace(/\/$/, "") : null;
const LIVE_NODE_ID = process.env.LIVE_NODE_ID || "node-001";
const LIVE_DATASET_ID = process.env.LIVE_DATASET_ID || "1";

const CORE_PORT = randomPort(3000, 3100);
const NODE_PORT = randomPort(4000, 4100);
const CORE_URL = LIVE_CORE_URL || `http://127.0.0.1:${CORE_PORT}`;
const NODE_URL = `http://127.0.0.1:${NODE_PORT}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url, label, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`${label} did not become ready: ${url}`);
}

async function run() {
  let coreProc = null;
  let nodeProc = null;
  const isLive = !!LIVE_CORE_URL;

  const cleanup = () => {
    if (coreProc) coreProc.kill("SIGTERM");
    if (nodeProc) nodeProc.kill("SIGTERM");
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  if (isLive) {
    console.log("Live E2E: Core", LIVE_CORE_URL, "| nodeid", LIVE_NODE_ID, "| cid dataset:" + LIVE_DATASET_ID);
    await waitFor(`${CORE_URL}/health`, "Core");
  } else {
    console.log("Mock E2E: Core port", CORE_PORT, "| Mock node port", NODE_PORT);
    console.log("Starting Core...");
    coreProc = spawn("node", [path.join(coreDir, "dist", "index.js")], {
      cwd: coreDir,
      env: {
        ...process.env,
        PORT: String(CORE_PORT),
        NODES: JSON.stringify({ "node-001": NODE_URL }),
        ESCROW_PROVIDER: "memory",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    coreProc.stdout?.on("data", (d) => process.stdout.write(d));
    coreProc.stderr?.on("data", (d) => process.stderr.write(d));
    coreProc.on("error", (err) => {
      console.error("Core failed to start:", err.message);
      process.exit(1);
    });

    console.log("Starting mock node...");
    nodeProc = spawn("node", [path.join(__dirname, "mock-node.mjs")], {
      env: { ...process.env, PORT: String(NODE_PORT), CORE_URL },
      stdio: ["ignore", "pipe", "pipe"],
    });
    nodeProc.stdout?.on("data", (d) => process.stdout.write(d));
    nodeProc.stderr?.on("data", (d) => process.stderr.write(d));
    nodeProc.on("error", (err) => {
      console.error("Mock node failed to start:", err.message);
      cleanup();
      process.exit(1);
    });

    await sleep(500);
    await waitFor(`${CORE_URL}/health`, "Core");
    await waitFor(`${NODE_URL}/health`, "Mock node");
  }

  const submitBody = {
    nodeid: isLive ? LIVE_NODE_ID : "node-001",
    cid: `dataset:${isLive ? LIVE_DATASET_ID : "1"}`,
    compute_requirements: { cpu_cores: 1, memory_mb: 512 },
    docker: { image: "alpine:3.18", command: ["sh", "-c", "wc -c < /data/input; echo done"] },
    timeout_by: 120,
    max_cost_cu: 100,
  };
  console.log("Submitting job to Core...");
  const submitRes = await fetch(`${CORE_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submitBody),
  });
  if (!submitRes.ok) {
    const t = await submitRes.text();
    throw new Error(`Submit failed ${submitRes.status}: ${t}`);
  }
  const submitJson = await submitRes.json();
  const jobId = submitJson.job_id;
  if (!jobId) throw new Error("No job_id in submit response");

  const maxPoll = isLive ? 120 : 30;
  const pollInterval = isLive ? 2000 : 500;
  console.log("Polling job", jobId, "(max", maxPoll, "polls)...");
  let job;
  for (let i = 0; i < maxPoll; i++) {
    const r = await fetch(`${CORE_URL}/jobs/${jobId}`);
    if (!r.ok) throw new Error(`GET job failed ${r.status}`);
    job = await r.json();
    if (job.status === "SUCCEEDED" || job.status === "FAILED_CONTAINER" || job.status === "FAILED_NODE" || job.status === "FAILED_PREFLIGHT") {
      break;
    }
    await sleep(pollInterval);
  }

  if (!isLive) {
    cleanup();
    await sleep(200);
  }

  if (!job) throw new Error("Job never reached terminal state");
  if (job.status !== "SUCCEEDED") {
    throw new Error(`Job ended with status ${job.status}: ${JSON.stringify(job.error || job)}`);
  }
  if (!job.result_cid) throw new Error("Job SUCCEEDED but missing result_cid");

  console.log("E2E passed: job", jobId, "SUCCEEDED, result_cid:", job.result_cid);
  if (job.result_url) {
    console.log("  result_url:", job.result_url);
    const resultRes = await fetch(job.result_url);
    if (!resultRes.ok) throw new Error(`result_url fetch failed: ${resultRes.status} ${await resultRes.text().then((t) => t.slice(0, 200))}`);
    const resultText = await resultRes.text();
    console.log("  result body (first 200 chars):", resultText.slice(0, 200));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * E2E test: client -> Core API -> Node API -> Core API -> client.
 * Uses memory escrow (no onchain). Starts Core and a mock node, submits a job,
 * polls until SUCCEEDED, asserts result_cid.
 *
 * Run from repo root: node core/e2e/run-e2e.mjs
 * Or from core/: node e2e/run-e2e.mjs (ensure core is built: npm run build)
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(__dirname, "..");
const CORE_PORT = 3000;
const NODE_PORT = 4002;
const CORE_URL = `http://localhost:${CORE_PORT}`;
const NODE_URL = `http://localhost:${NODE_PORT}`;

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

  const cleanup = () => {
    if (coreProc) coreProc.kill("SIGTERM");
    if (nodeProc) nodeProc.kill("SIGTERM");
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

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

  console.log("Submitting job to Core...");
  const submitBody = {
    nodeid: "node-001",
    cid: "dataset:1",
    compute_requirements: { cpu_cores: 1, memory_mb: 512 },
    docker: { image: "alpine:3.18", command: ["echo", "e2e"] },
    timeout_by: 60,
    max_cost_cu: 100,
  };
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

  console.log("Polling job", jobId, "...");
  const maxPoll = 30;
  let job;
  for (let i = 0; i < maxPoll; i++) {
    const r = await fetch(`${CORE_URL}/jobs/${jobId}`);
    if (!r.ok) throw new Error(`GET job failed ${r.status}`);
    job = await r.json();
    if (job.status === "SUCCEEDED" || job.status === "FAILED_CONTAINER" || job.status === "FAILED_NODE" || job.status === "FAILED_PREFLIGHT") {
      break;
    }
    await sleep(500);
  }

  cleanup();
  await sleep(200);

  if (!job) throw new Error("Job never reached terminal state");
  if (job.status !== "SUCCEEDED") {
    throw new Error(`Job ended with status ${job.status}: ${JSON.stringify(job.error || job)}`);
  }
  if (!job.result_cid) throw new Error("Job SUCCEEDED but missing result_cid");

  console.log("E2E passed: job", jobId, "SUCCEEDED, result_cid:", job.result_cid);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

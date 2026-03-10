#!/usr/bin/env node
/**
 * Client E2E: run against Core + mock node (spawned) or live Core.
 * Mock: spawns Core (memory escrow) + mock node, then runs client run with --client-address default.
 * Live: set CORE_URL (and LIVE_CLIENT_ADDRESS if needed), run with real job file.
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, "..");
const coreDir = path.resolve(clientDir, "..", "core");

const LIVE_CORE_URL = process.env.LIVE_CORE_URL ? process.env.LIVE_CORE_URL.replace(/\/$/, "") : null;
const CORE_PORT = 3020 + Math.floor(Math.random() * 100);
const NODE_PORT = 4020 + Math.floor(Math.random() * 100);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url, label, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`${label} not ready: ${url}`);
}

async function run() {
  let coreProc = null;
  let nodeProc = null;
  const isLive = !!LIVE_CORE_URL;
  const coreUrl = isLive ? LIVE_CORE_URL : `http://127.0.0.1:${CORE_PORT}`;

  const cleanup = () => {
    if (coreProc) coreProc.kill("SIGTERM");
    if (nodeProc) nodeProc.kill("SIGTERM");
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  if (!isLive) {
    console.log("Spawning Core (memory escrow) and mock node...");
    coreProc = spawn("node", [path.join(coreDir, "dist", "index.js")], {
      cwd: coreDir,
      env: {
        ...process.env,
        PORT: String(CORE_PORT),
        NODES: JSON.stringify({ "node-001": `http://127.0.0.1:${NODE_PORT}` }),
        ESCROW_PROVIDER: "memory",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    coreProc.stdout?.on("data", (d) => process.stdout.write(d));
    coreProc.stderr?.on("data", (d) => process.stderr.write(d));

    nodeProc = spawn("node", [path.join(coreDir, "e2e", "mock-node.mjs")], {
      env: { ...process.env, PORT: String(NODE_PORT), CORE_URL: `http://127.0.0.1:${CORE_PORT}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    nodeProc.stdout?.on("data", (d) => process.stdout.write(d));
    nodeProc.stderr?.on("data", (d) => process.stderr.write(d));

    await sleep(800);
    await waitFor(`${coreUrl}/health`, "Core");
    await waitFor(`http://127.0.0.1:${NODE_PORT}/health`, "Mock node");
  }

  const jobFile = path.join(clientDir, "examples", "docker-compute-job.yaml");
  const args = [
    "run",
    "--compute-provider", "node-001",
    "--dataset-id", isLive ? (process.env.LIVE_DATASET_ID || "1") : "1",
    "--job-file", jobFile,
    "--client-address", "default",
    "--core-url", coreUrl,
  ];

  console.log("Running fil-compute", args.join(" "));
  const child = spawn("node", [path.join(clientDir, "bin", "fil-compute.mjs"), ...args], {
    cwd: clientDir,
    env: { ...process.env, CORE_URL: coreUrl },
    stdio: "inherit",
  });

  const code = await new Promise((resolve) => child.on("close", resolve));
  if (!isLive) cleanup();
  process.exit(code ?? 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

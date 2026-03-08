#!/usr/bin/env node
/**
 * Test the node agent without Core.
 * 1. Start node with: SKIP_CORE_CALLBACK=1 npm start (or npm run dev)
 * 2. Run: node scripts/test-node-standalone.mjs [dataset_id]
 *
 * Uses dataset:1 if no arg. Replace with a real dataset_id that exists on your PDP.
 */
const NODE_URL = process.env.NODE_URL || "http://localhost:4000";
const datasetId = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
const cid = `dataset:${datasetId}`;

const preflightBody = {
  job_id: "test-job-standalone",
  cid,
  compute_requirements: { cpu_cores: 1, memory_mb: 512 },
};

const startBody = {
  job_id: "test-job-standalone",
  attempt_id: "attempt-1",
  cid,
  compute_requirements: { cpu_cores: 1, memory_mb: 512 },
  docker: {
    image: "alpine:3.18",
    command: ["sh", "-c", "echo 'Input size:'; wc -c < /data/input; echo 'done'"],
  },
  timeout_by: 120,
};

async function main() {
  console.log("1. GET", `${NODE_URL}/health`);
  const health = await fetch(`${NODE_URL}/health`);
  console.log("   ", health.status, await health.json());

  console.log("\n2. POST", `${NODE_URL}/preflight`, "cid=" + cid);
  const pf = await fetch(`${NODE_URL}/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preflightBody),
  });
  const pfJson = await pf.json();
  console.log("   ", pf.status, pfJson);
  if (!pfJson.ok) {
    console.log("   Preflight failed (e.g. dataset not on this node). Use a valid dataset_id.");
    return;
  }

  console.log("\n3. POST", `${NODE_URL}/start`);
  const start = await fetch(`${NODE_URL}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(startBody),
  });
  console.log("   ", start.status, await start.json());
  console.log("\n   Node will run retrieve + docker, then log complete payload (SKIP_CORE_CALLBACK=1).");
  console.log("   Watch node stdout for [SKIP_CORE_CALLBACK] Would POST to Core: ...");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

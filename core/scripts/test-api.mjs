#!/usr/bin/env node
/**
 * Quick test for Core API. Start the server first: npm run dev
 * Run: node scripts/test-api.mjs   (from core/)
 */
const BASE = process.env.CORE_URL || "http://localhost:3000";

const jobPayload = {
  nodeid: "node-001",
  cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  compute_requirements: { cpu_cores: 2, memory_mb: 4096 },
  docker: { image: "alpine:3.18", command: ["echo", "hello"] },
  timeout_by: 300,
  max_cost_cu: 100,
  client_request_id: "test-req-1",
};

async function main() {
  console.log("1. GET /health");
  const health = await fetch(`${BASE}/health`);
  console.log("   ", health.status, await health.json());

  console.log("\n2. POST /jobs (submit job)");
  const create = await fetch(`${BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jobPayload),
  });
  const created = await create.json();
  console.log("   ", create.status, created);
  if (created.job_id) {
    console.log("\n3. GET /jobs/" + created.job_id);
    const get = await fetch(`${BASE}/jobs/${created.job_id}`);
    console.log("   ", get.status, await get.json());
  }

  console.log("\n4. POST /jobs again with same client_request_id (idempotency)");
  const again = await fetch(`${BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jobPayload),
  });
  const againBody = await again.json();
  console.log("   ", again.status, againBody);
  console.log("   Same job_id?", againBody.job_id === created.job_id ? "yes" : "no");

  console.log("\n5. GET /jobs/bad-id (404)");
  const notFound = await fetch(`${BASE}/jobs/bad-id`);
  console.log("   ", notFound.status, await notFound.json());

  console.log("\n6. POST /jobs with invalid body (400)");
  const invalid = await fetch(`${BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeid: "x" }),
  });
  console.log("   ", invalid.status, await invalid.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

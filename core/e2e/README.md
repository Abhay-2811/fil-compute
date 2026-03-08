# E2E test: client → Core → Node → Core → client

Tests the full flow with **memory escrow** (no onchain, no payment). A mock node replaces a real PDP node so no Docker or DB is required.

## Run

From the `core/` directory:

```bash
npm run e2e
```

From repo root:

```bash
cd core && npm run e2e
```

## What it does

1. Starts Core on port 3000 with `NODES={"node-001":"http://localhost:4002"}` and `ESCROW_PROVIDER=memory`.
2. Starts a mock node on port 4002 that responds to `/preflight` (ok) and `/start` (202), then POSTs `SUCCESS` to Core `/jobs/:id/complete`.
3. Submits a job to Core (POST /jobs) with `nodeid: "node-001"`.
4. Polls GET /jobs/:id until status is `SUCCEEDED` (or a failure).
5. Asserts `result_cid` is present.

## Nginx / real node

For testing against a real node behind nginx on a remote PDP server, run Core and the client locally with `NODES` pointing at the node URL (e.g. `https://compute.example.com`). Escrow can stay `memory` for local testing or be set to `evm` when you enable payments.

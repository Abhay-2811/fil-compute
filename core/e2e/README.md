# E2E test: client → Core → Node → Core → client

Two modes (env-driven; no hardcoded domains):

- **Mock:** spawns Core + mock node on random ports. No live infra.
- **Live:** uses your live Core and node (e.g. compute.abhayu.com). Set env and run.

## Mock E2E (default)

From `core/`:

```bash
npm run e2e
```

From repo root:

```bash
cd core && npm run e2e
```

1. Starts Core on a random port with `NODES={"node-001":"http://127.0.0.1:<node-port>"}` and `ESCROW_PROVIDER=memory`.
2. Starts a mock node on another random port; it responds to preflight/start then POSTs SUCCESS to Core.
3. Submits a job, polls until terminal state, asserts SUCCEEDED and result_cid.

## Live E2E (real node + Core)

Use your live Core API and node. Core must already have `NODES` pointing at your node URL (e.g. `https://compute.abhayu.com`). No spawning; the script only POSTs a job and polls.

| Env | Description | Example |
|-----|-------------|---------|
| `LIVE_CORE_URL` | Base URL of your Core API (required for live mode) | `https://core.abhayu.com` |
| `LIVE_NODE_ID` | nodeid that Core uses for your node | `node-001` |
| `LIVE_DATASET_ID` | dataset id for cid `dataset:N` (must exist on your PDP) | `1` |

Run from `core/`:

```bash
LIVE_CORE_URL=https://core.abhayu.com LIVE_NODE_ID=node-001 LIVE_DATASET_ID=1 node e2e/run-e2e.mjs
```

Or export and run:

```bash
export LIVE_CORE_URL=https://core.abhayu.com
export LIVE_NODE_ID=node-001
export LIVE_DATASET_ID=1
node e2e/run-e2e.mjs
```

The job uses `cid: "dataset:<LIVE_DATASET_ID>"` and a small Docker command that reads `/data/input`; the live node must be able to resolve that dataset and run the container. Polling runs up to ~4 minutes (120 × 2s) for live runs.

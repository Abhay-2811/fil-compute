# datatzen v0

**IPFS-but-for-compute** — submit compute jobs to a node that has the data; node runs user-provided Docker (sandboxed); Core handles preflight, escrow, metering, and returns a result CID.

## Trust model (v0)

Trust the node for correctness (“best effort”). Validation is out of scope.

## Repo layout

| Path | Purpose |
|------|--------|
| `core/` | Core API (jobs, escrow, job flow) |
| `node/` | PDP compute node agent (preflight, start, retrieve + Docker, complete callback) |
| `contracts/` | EVM escrow (Hardhat) |
| `schemas/` | JSON schemas: Job, Preflight, Start, Complete, Receipt |
| `config/` | CU model v0 (weights, formula) |
| `docs/` | State machine, idempotency, error taxonomy |
| `scripts/` | PDP retrieve script, etc. |

## Milestones

- **M0 — Spec freeze** ✅ Schemas, CU config, state machine, error taxonomy (this deliverable).
- **M1** — Happy path: Core API (POST/GET jobs), Node agent (preflight + start + complete), escrow lock + finalize.
- **M2** — Metering + refund: metrics capture, CU persistence, refund policy.
- **M3** — Reliability: persistent job DB, safe retries, FAILED_NODE on disconnect.
- **M4** — Storage: ResultStore interface + backend; node uploads result, Core records CID.
- **M5** — Security: container isolation, limits, default-deny network.

## Quick ref

- **Core:** scheduler + billing + job state machine + API.
- **Node:** a **remote server** with **storage and compute** that runs **datatzen's Node Agent** (our code). It has a public identity (`nodeid`) and, for on-chain escrow, a payout address. Core talks to it for preflight/start; the node calls Core back with COMPLETE. Trust model (v0): best-effort.
- **CU:** compute unit = resource-weighted + time-based metering.
- **Escrow:** lives on an **EVM-compatible chain**. User funds are locked in a contract per job; settlement (pay node, release remainder) or full refund happens on-chain. Some **job state** may be stored on-chain on a requirement basis (e.g. for audit or dispute). Core can use in-memory escrow for dev (`ESCROW_PROVIDER=memory`) or an EVM contract adapter (`ESCROW_PROVIDER=evm`).

## Open questions (v0)

- Exact on-chain escrow flow and CU → token cost.
- Job state on-chain: which fields (job_id, nodeid, max_cost_cu, etc.) to store at lock time.
- Result storage: PDP deal vs shared store.
- How `nodeid` maps to network address + transport (HTTP/gRPC/libp2p).

## PDP compute (node agent)

For jobs whose data lives on a PDP node, use **cid** `dataset:N` (e.g. `dataset:123`) when submitting. The node agent runs [scripts/pdp-node-data-retrieve.sh](scripts/pdp-node-data-retrieve.sh), mounts the unsealed file at `/data/input` in the container, and reports completion to Core. See [node/README.md](node/README.md).

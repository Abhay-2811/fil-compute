# EVM escrow contract spec

Escrow lives on an EVM-compatible chain. User funds are locked per job; settlement (pay node, release remainder) or full refund is on-chain. Minimal job state is stored on-chain on a requirement basis for settlement and audit.

## Contract responsibilities

### Lock

- **Caller:** User (or Core on behalf of user via meta-tx / relayer).
- **Effect:** Lock `max_cost_cu` (or token equivalent) for a job. Contract records the lock keyed by `job_id`.
- **Optional on-chain job state (requirement basis):** `job_id`, `user` (address), `nodeid` or node payout address, `max_cost_cu`. Full job payload stays off-chain in Core DB.

### Settle (success or container error)

- **Caller:** Core (or authorized relayer) only.
- **Args:** `job_id`, `attempt_id`, `cu_used`, `node_payout_address`.
- **Effect:** Pay `cu_used` (or token equivalent) to `node_payout_address`; release remainder to the user who locked; mark job as settled (exactly-once). Reverts if job already settled or unknown.

### Refund

- **Caller:** Core (or authorized relayer).
- **Args:** `job_id`.
- **Effect:** Release full locked amount back to the user; mark job as settled (exactly-once). Used on FAILED_NODE / FAILED_PREFLIGHT.

## Job state on-chain (minimal)

At lock time the contract may store only what is needed for settlement and audit:

| Field          | Purpose                          |
|----------------|-----------------------------------|
| `job_id`       | Unique job key                    |
| `user`         | Address that locked funds         |
| `node`         | Node payout address (or nodeid)   |
| `max_cost_cu`  | Locked amount                     |
| `attempt_id`   | Optional; can be set at START      |

Heavy payload (cid, docker spec, compute_requirements, etc.) remains off-chain in Core.

## Core adapter (EVM)

- **lock:** Submit tx to contract (or return approval payload for user to sign).
- **settleSuccess / settleRefund:** Submit the corresponding contract call.
- **getBalance:** Read user balance or allowance from contract (or indexer).

Config: RPC URL, contract address, optional relayer/signer (Core wallet or backend signer). Node payout address from node registry (e.g. extend with `payout_address`) or from node COMPLETE/receipt.

## Open

- CU → token conversion (rate, oracle, or fixed scale).
- Whether lock is user-signed or relayer-signed (meta-tx).

# Job state machine (Core)

**Context:** Escrow is on an EVM-compatible chain (lock per job; settle or refund on-chain). The node is a remote server with storage and compute running datatzen's Node Agent; it receives payout from escrow on success.

## States

| State | Description |
|-------|-------------|
| `SUBMITTED` | Job accepted; preflight not yet started |
| `PREFLIGHTING` | Core is checking node (availability, capacity, CID) |
| `FAILED_PREFLIGHT` | **Terminal.** Preflight failed; no charge |
| `ESCROW_LOCKED` | Preflight OK; user escrow locked (max_cost_cu) |
| `RUNNING` | Node is executing the job |
| `SUCCEEDED` | **Terminal.** Job completed; charge cu_used, release remainder |
| `FAILED_CONTAINER` | **Terminal.** Container error; charge cu_used, release remainder |
| `FAILED_NODE` | **Terminal.** Node fault / no receipt; full refund |

## Transitions

```
SUBMITTED → PREFLIGHTING
PREFLIGHTING → FAILED_PREFLIGHT  (preflight fail)
PREFLIGHTING → ESCROW_LOCKED     (preflight OK, escrow locked)
ESCROW_LOCKED → RUNNING         (START sent to node)
RUNNING → SUCCEEDED             (COMPLETE status=SUCCESS)
RUNNING → FAILED_CONTAINER      (COMPLETE status=CONTAINER_ERROR)
RUNNING → FAILED_NODE           (timeout / disconnect / no reliable receipt)
```

## Idempotency rules

1. **Submit:** `client_request_id` — if Core has a job with the same `client_request_id` for this user, return existing `job_id` and current status instead of creating a new job.

2. **Execution:** `(job_id, attempt_id)` — each run on the node is one attempt. Core must never apply settlement twice for the same `(job_id, attempt_id)`. Retries use a new `attempt_id`.

3. **Settlement:** Exactly-once — when moving to a terminal state (SUCCEEDED, FAILED_CONTAINER, FAILED_NODE), apply escrow finalization (charge or refund) once and record in settlement table to prevent double pay / double refund.

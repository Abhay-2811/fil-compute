# Job state machine (Core)

**Context:** Escrow is balance-based on an EVM-compatible chain. Clients pre-fund balances via `deposit()`, and Core settles debit/payout on success. The node is a remote server with storage and compute running fil-compute Node Agent.

## States

| State | Description |
|-------|-------------|
| `SUBMITTED` | Job accepted; preflight not yet started |
| `PREFLIGHTING` | Core is checking node (availability, capacity, CID) |
| `FAILED_PREFLIGHT` | **Terminal.** Preflight failed; no charge |
| `RUNNING` | Node is executing the job |
| `SUCCEEDED` | **Terminal.** Job completed; charge `cu_used` |
| `FAILED_CONTAINER` | **Terminal.** Container error; charge `cu_used` |
| `FAILED_NODE` | **Terminal.** Node fault / no receipt; no settle debit |

## Transitions

```
SUBMITTED → PREFLIGHTING
PREFLIGHTING → FAILED_PREFLIGHT  (preflight fail)
PREFLIGHTING → RUNNING          (preflight OK, START sent)
RUNNING → SUCCEEDED             (COMPLETE status=SUCCESS)
RUNNING → FAILED_CONTAINER      (COMPLETE status=CONTAINER_ERROR)
RUNNING → FAILED_NODE           (timeout / disconnect / no reliable receipt)
```

## Idempotency rules

1. **Submit:** `client_request_id` — if Core has a job with the same `client_request_id` for this user, return existing `job_id` and current status instead of creating a new job.

2. **Execution:** `(job_id, attempt_id)` — each run on the node is one attempt. Core must never apply settlement twice for the same `(job_id, attempt_id)`. Retries use a new `attempt_id`.

3. **Settlement:** Exactly-once — when moving to a terminal state requiring debit (SUCCEEDED, FAILED_CONTAINER), apply settlement once and record it to prevent double charge/payout.

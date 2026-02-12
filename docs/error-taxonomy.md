# Error taxonomy (v0)

## Failure categories

| Code | When | User impact | Escrow |
|------|------|-------------|--------|
| **PREFLIGHT_FAIL** | Node unavailable, insufficient capacity, or CID not found | Job rejected; no execution | No charge |
| **CONTAINER_ERROR** | Container exited non-zero; node reported COMPLETE with status=CONTAINER_ERROR | User gets error + optional logs tail | Charge `cu_used`; release remainder |
| **NODE_FAULT** | Node disconnected, no COMPLETE received, or unreachable before completion | Job failed without reliable result | Full refund |
| **TIMEOUT** | Job exceeded `timeout_by` (wall time) before COMPLETE | Treated as node/reliability failure | Full refund (same as NODE_FAULT) |

## Mapping to job status

- Preflight failure → `FAILED_PREFLIGHT` (error type: PREFLIGHT_FAIL).
- Container error from node → `FAILED_CONTAINER` (error type: CONTAINER_ERROR).
- Timeout or node disconnect / no receipt → `FAILED_NODE` (error type: NODE_FAULT or TIMEOUT).

## API error shape (bounded)

```json
{
  "type": "PREFLIGHT_FAIL | CONTAINER_ERROR | NODE_FAULT | TIMEOUT",
  "message": "short human-readable string",
  "details": "optional bounded payload (e.g. logs_tail)"
}
```

Logs and details must be length-limited (e.g. 8KB) to avoid abuse.

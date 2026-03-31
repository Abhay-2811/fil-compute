# Reliability and Failure Handling

This project is designed for robust hackathon demos with practical reliability controls.

## Failure classes

| Class | Typical cause | Status | Billing |
|---|---|---|---|
| Preflight failure | Node unreachable, missing dataset, insufficient capacity | `FAILED_PREFLIGHT` | No charge |
| Container failure | Runtime exception, non-zero exit, artifact upload failure | `FAILED_CONTAINER` | Charge `cu_used` |
| Node fault | No callback, callback timeout path, infrastructure interruption | `FAILED_NODE` | Refund path |

## Timeout and callback strategy

- Node sends complete callback to Core.
- Core acknowledges successful completion callback quickly (`200`) before on-chain confirmation.
- Settlement runs asynchronously to avoid proxy timeout-induced false failures.

## Retry safety

- Repeated complete callbacks are handled idempotently using attempt identity.
- Settlement is guarded so retries cannot double-charge.
- Clients can poll `GET /jobs/:job_id` until terminal status.

## Observability

- Core and node emit structured logs (`level`, message, context).
- Job-level keys should be used in queries: `job_id`, `attempt_id`, `nodeid`, `client_address`.
- For container failures, keep bounded `logs_tail` for operator diagnosis.

## Common operational incidents

### `actor not found` on Filecoin deposits

- Address has no on-chain actor history yet.
- Send small FIL to the wallet first, then retry deposit.

### `estimateGas` / missing revert data in deposit

- Retry with explicit `nonce` and `gasLimit` fallback path.

### `Temporary failure in name resolution` in container

- Container has no DNS/outbound path.
- Use `DOCKER_NETWORK=default` and ensure host firewall allows egress.

### `413 Request Entity Too Large` in PDP upload

- Reverse proxy body-size limit hit.
- Increase ingress/nginx `client_max_body_size`.

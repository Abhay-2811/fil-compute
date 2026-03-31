# Config Reference

Operational configuration reference for production-like deployments.

## Client env

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CORE_URL` | yes | `http://localhost:3000` | Core base URL. |
| `AWS_ACCESS_KEY_ID` | for S3 mode | - | Used only to generate presigned URLs client-side. |
| `AWS_SECRET_ACCESS_KEY` | for S3 mode | - | Used only for presign. |
| `AWS_SESSION_TOKEN` | optional | - | Temporary credentials support. |

## Core env

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `3000` | Core HTTP port. |
| `ESCROW_PROVIDER` | no | `memory` | `memory` or `evm`. |
| `ESCROW_RPC_URL` | for evm | - | Returned by `GET /config`. |
| `ESCROW_CONTRACT_ADDRESS` | for evm | - | Returned by `GET /config`. |
| `ESCROW_SIGNER_PRIVATE_KEY` | for evm settle | - | Signer used for settlement txs. |
| `ESCROW_CU_TO_WEI` | no | `1e12` | CU conversion factor. |
| `NODES` | yes | `{}` | Node registry map (`nodeid -> base URL`). |
| `NODE_PAYOUT_ADDRESSES` | for evm settle | `{}` | `nodeid -> 0x...` payout address. |
| `LOG_LEVEL` | no | `info` | Structured log level. |

## Node env

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `4000` | Node HTTP port. |
| `CORE_URL` | yes | `http://localhost:3000` | Callback target for complete status. |
| `SKIP_CORE_CALLBACK` | no | `false` | Local debugging only. |
| `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_NAME`/`DB_PASSWORD` | yes | mixed | PDP metadata DB connectivity. |
| `CURIO_DATA_DIR` | yes | `/mnt/data` | Curio data root. |
| `RETRIEVE_OUTPUT_DIR` | no | `/tmp/curio-retrieved` | Staging path for retrieved files. |
| `DOCKER_BIN` | no | `docker` | Docker executable path. |
| `DOCKER_NETWORK` | no | `default` | `default`, `bridge`, or `none`. |
| `OUTPUT_UPLOAD_BACKEND` | no | `none` | `none` or `self` for node-hosted outputs. |
| `NODE_PUBLIC_URL` | for `self` | - | Public URL used to construct artifact links. |
| `JOB_OUTPUT_DIR` | for file outputs | - | Persisted directory for per-job artifacts. |
| `LOG_LEVEL` | no | `info` | Structured log level. |

## Recommended production baseline

- Core and node behind HTTPS ingress.
- Node uses `DOCKER_NETWORK=default` unless hard-isolation is required.
- `JOB_OUTPUT_DIR` on durable disk if node-hosted artifacts are enabled.
- EVM mode with dedicated settlement signer and monitored wallet balance.

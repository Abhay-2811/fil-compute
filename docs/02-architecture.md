# Architecture

```mermaid
flowchart LR
  clientCli[ClientCLI] -->|submit job| coreApi[CoreAPI]
  clientCli -->|generate presigned PUT/GET| akave[AkaveO3]
  coreApi -->|preflight/start| computeNode[ComputeNode]
  computeNode -->|resolve dataset:N| pdpData[Pdp data]
  computeNode -->|run container| dockerJob[DockerJob]
  dockerJob -->|artifact to /data/output| outputDir[OutputDir]
  computeNode -->|PUT artifact via presigned URL| akave
  computeNode -->|complete callback| coreApi
  coreApi -->|status result_url| clientCli
  coreApi -->|canonical result_url=presigned GET| clientCli
  coreApi -->|settle success| escrow[FVM Escrow]
```

## Components

- **Client**: uploads input to PDP, submits jobs, prepares optional Akave O3 (S3-compatible) presigned URLs.
- **Core**: job API, state machine, escrow checks/settlement.
- **Node**: dataset resolve/retrieve, Docker run, result callback.
- **Escrow**: balance-based payment (`deposit`, `settleSuccess`).
- **Storage**: node self-hosted output and/or client-owned Akave O3 bucket.

## Data and control planes

| Plane | Path | Purpose |
|---|---|---|
| Control | Client -> Core -> Node | Scheduling, state transitions, callbacks. |
| Data | Akave O3 PDP -> Node container mount | Input data access close to compute. |
| Settlement | Core -> Escrow contract | Final CU charge and node payout. |
| Result delivery | Node output or Akave O3 URL | End-user retrieval of logs/artifacts. |

## Compute path details

1. Node resolves `dataset:N` to piece metadata via Curio/Yugabyte.
2. Retrieval path materializes input into local mount directory.
3. Container starts with requested image/command/env and resource constraints.
4. Stdout and optional artifact files are collected.
5. In Akave O3 mode, client-generated presigned URLs are injected into job env.
6. Node uploads artifact to Akave O3 using presigned PUT URL.
7. Core stores presigned GET URL as canonical `result_url`.
8. Completion payload includes metrics (`wall_seconds`, `cpu_seconds`, `memory_mb_peak`) and `cu_used`.

## Akave O3 presigned flow (default recommendation)

1. Client generates presigned PUT + GET URLs for artifact key in Akave O3.
2. Client submits job with URL metadata in `docker.env`.
3. Node performs PUT upload after job success; upload failure marks job failed.
4. Core returns presigned GET URL as final `result_url` for users.

## Why this architecture works for hackathon constraints

- Uses real PDP-backed data movement constraints, not mock file reads.
- Keeps billing and compute decoupled via clear callback and settlement boundary.
- Supports both simple stdout workloads and artifact-heavy ML jobs.

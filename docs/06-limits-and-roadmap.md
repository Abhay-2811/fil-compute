# Use Cases and Future

## Current limits (v0)

- Trusted node execution (no cryptographic correctness proof yet).
- PDP dataset path is primary data source (`dataset:N`).
- Presigned result links are time-bounded.
- Reliability/persistence is MVP-level.

## How fil-compute enables the next wave

### 1) Ceph-like fault-tolerant data cluster from PDP nodes

- Treat each PDP node as a storage building block in a clustered topology.
- Keep compute scheduling aware of where replicas/chunks live.
- Run jobs near the best-placed copy to minimize cross-region data movement.

### 2) Parallel multi-node compute with client-side aggregation

- Split workload into shards and dispatch to multiple nodes in parallel.
- Each node returns artifact/metrics independently.
- Client (or aggregation service) merges partial outputs into a final result.

### 3) Large-model training on open data without moving data

- Use `dataset:N` pointers instead of downloading full datasets per run.
- Schedule preprocessing/training jobs where data is already available.
- Save egress costs while increasing throughput for repeated experiments.

## Near-term roadmap

- Stronger verification model for compute results.
- TEE pilot for confidential execution + remote attestation checks.
- Multi-node orchestration and parallel shard aggregation.
- More storage backends and clustered data placement policies.
- Better scheduler and retries for production reliability.

## Future ideas

- Attestation-aware escrow settlement (settle only if policy passes).
- Cluster-level SLAs for availability and performance.
- Policy-driven job placement (cost, latency, compliance).

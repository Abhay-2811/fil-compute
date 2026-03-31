# Limits and Roadmap

## Current limits (v0)

- Trusted node execution (no cryptographic correctness proof yet).
- PDP dataset path is primary data source (`dataset:N`).
- S3 result links are presigned and time-bounded.
- Reliability/persistence is MVP-level.

## Near-term roadmap

- Stronger verification model for compute results.
- TEE pilot for confidential execution + remote attestation checks.
- Multi-node orchestration and parallel shard aggregation.
- More storage backends (Akave/Ceph-style clustered patterns).
- Better scheduler and retries for production reliability.

## Future ideas

- Build Ceph-like fault-tolerant data cluster from PDP nodes.
- Parallel multi-node compute with client-side aggregation.
- Large model training on open data with minimal egress.
- Attestation-aware escrow settlement (settle only if policy passes).

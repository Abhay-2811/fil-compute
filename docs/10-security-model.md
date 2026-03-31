# Security Model

Security posture for v0 (hackathon release).

## Isolation model

- Job code runs in Docker isolation with bounded resources.
- Input is mounted read-only from PDP retrieval path.
- Output is written to explicit output path (`/data/output`) only.

## Trust assumptions

- Node is trusted for correctness in v0.
- Core is trusted as scheduler and settlement coordinator.
- Escrow contract enforces balance accounting and authorized settlement.

## Storage security

### Node-hosted mode

- Artifacts are served by node output endpoint.
- Requires node operator controls on retention and access policy.

### Client S3 mode

- Client credentials never shared with node.
- Node only sees short-lived presigned PUT URL.
- Canonical user-facing result is presigned GET URL.

## Key handling

- Client private key is used locally for deposit/run commands.
- Core settlement signer should be separate from operator wallet.
- Use secret manager/CI vault for signer and DB credentials.

## Planned upgrades

- Signed receipts plus independent verification path.
- Stronger sandbox profile (seccomp/AppArmor/cgroup hardening).
- Optional attestation/proof model for untrusted execution.

## Future: TEE-based compute

Target direction is to run user jobs inside a Trusted Execution Environment (TEE), so confidentiality and integrity do not rely only on trusting the node operator.

### Why TEE matters

- Data can stay encrypted outside the enclave and only decrypt in trusted memory.
- Remote attestation gives verifiable evidence of runtime, code hash, and platform state.
- Clients and Core can bind job acceptance/settlement to valid attestation claims.

### Proposed TEE flow

1. Node provisions a TEE-enabled worker and publishes attestation evidence.
2. Core verifies attestation policy (approved measurements, signer, freshness).
3. Client provides job key/material only after attestation checks pass.
4. Job runs in enclave; result is signed with enclave-bound identity.
5. Core stores attestation + receipt metadata and then settles escrow.

### Presentation framing for judges

- **Today (v0):** trusted node + escrow + audit logs.
- **Next:** TEE attestation gate before execution/settlement.
- **End state:** confidential, policy-verifiable compute-to-data.

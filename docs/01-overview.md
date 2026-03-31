# Overview

Compute-to-data for PDP datasets on Filecoin.

## What it does

- Run container jobs against `dataset:N` without moving source data.
- Meter usage in CU and settle payment from client escrow on success.
- Return output links from node storage or client-owned S3.

## What is already implemented

- Client CLI: deposit, balance, run, and PDP upload command.
- Core APIs: config discovery, job submit/status, node completion endpoint.
- Node execution: preflight + start + callback, output file serving, S3 upload from node.
- Escrow integration: balance-based flow with Core signer settlement path.

## Why this matters

- Less egress and duplication.
- Data stays close to compute.
- Clear payer model for compute and result storage.

## Design goals

- Keep CLI minimal (only Core URL required).
- Keep interfaces explicit through JSON schemas.
- Keep operational behavior observable and retry-safe.

## Trust model (v0)

- Trusted node execution (best effort).
- Verification/proofs are future work.

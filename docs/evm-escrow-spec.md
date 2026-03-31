# EVM escrow contract spec

Escrow lives on an EVM-compatible chain with a **balance-based** model.
Clients pre-fund once, and Core settles used CU after successful execution.

## Contract responsibilities

### Deposit (client funded)

- **Caller:** Client wallet.
- **Effect:** Increase the client's available escrow balance.
- **Method:** `deposit()` payable.

### Balance read

- **Caller:** any.
- **Effect:** Return available balance for user address.
- **Method:** `balances(user)` (or adapter equivalent).

### Settle success (Core-signed)

- **Caller:** Core signer only.
- **Args:** `user`, `jobId`, `attemptId`, `cuUsed`, `nodePayout`.
- **Effect:** Deduct converted value from user balance and credit node payout.
- **Guarantee:** exact-once by job/attempt guard in contract or adapter logic.

## Conversion and accounting

- CU to wei uses `ESCROW_CU_TO_WEI` conversion factor from Core config.
- Client pre-check: Core validates balance >= `max_cost_cu * cu_to_wei` before scheduling.
- Final settlement uses `cu_used` from node completion metrics path.

## On-chain state (minimal)

| Field | Purpose |
|---|---|
| `balances[user]` | available prepaid balance |
| `settled[job_id]` or `(job_id,attempt_id)` marker | prevent double settlement |
| optional settlement events | auditable payout history |

Job payload (docker spec, compute requirements, CID) remains off-chain in Core.

## Core adapter (EVM)

- **deposit path (client):** CLI sends payable tx directly using Core-provided config.
- **settleSuccess (core):** signer tx on successful job completion.
- **getBalance:** Core or client reads contract balance mapping.
- **failure path:** preflight/node failures do not settle debit (no per-job lock to refund).

Config: RPC URL, contract address, optional relayer/signer (Core wallet or backend signer). Node payout address from node registry (e.g. extend with `payout_address`) or from node COMPLETE/receipt.

## Open

- CU conversion governance and upgrade path.
- Settlement replay protection mechanism shape (contract-native vs adapter table).

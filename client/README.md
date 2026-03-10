# fil-compute client

CLI for submitting compute jobs to datatzen Core. **Client always pays** via balance-based escrow: pre-fund with `escrow deposit`, then `run` (checks balance before submit).

## Commands

- **escrow deposit** — Add funds to the escrow contract.
- **escrow balance** — Check balance (from Core or contract).
- **run** — Submit a job from a YAML file; checks balance >= max_cost_cu before submit.

## Env

| Variable | Description |
|----------|-------------|
| `CORE_URL` | Core API base URL (default `http://localhost:3000`) |
| `ESCROW_RPC_URL` | RPC URL for contract (deposit, balance from contract) |
| `ESCROW_CONTRACT_ADDRESS` | Escrow contract address |
| `ESCROW_CU_TO_WEI` | CU to wei scale (default 1e12) |

For **run** and **balance** (via Core), only `CORE_URL` is required. For **deposit** and **balance** (from contract), set `ESCROW_RPC_URL` and `ESCROW_CONTRACT_ADDRESS`.

## Examples

```bash
# Deposit 1000 CU to escrow (requires ESCROW_* env)
npx fil-compute escrow deposit --amount 1000 --private-key 0x...

# Check balance (uses Core GET /jobs/balance if CORE_URL set)
npx fil-compute escrow balance --private-key 0x...

# Run job from YAML (checks balance, then POST /jobs)
npx fil-compute run --compute-provider node-001 --dataset-id 12145 \
  --job-file examples/docker-compute-job.yaml --private-key 0x...
```

For e2e with **memory escrow** (no contract), use `--client-address default`:

```bash
CORE_URL=http://127.0.0.1:3000 npx fil-compute run \
  --compute-provider node-001 --dataset-id 1 \
  --job-file examples/docker-compute-job.yaml --client-address default
```

## Job YAML

See `examples/docker-compute-job.yaml`. Required: `docker.image`; optional: `docker.command`, `compute_requirements`, `timeout_by`, `max_cost_cu` (default 100).

## E2E

From `client/`:

```bash
npm install
# Ensure core is built: cd ../core && npm run build
npm run e2e
```

Mock mode: spawns Core (memory escrow) + mock node, then runs `run` with `--client-address default`. Live: set `LIVE_CORE_URL` (and optionally `LIVE_DATASET_ID`).

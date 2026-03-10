# fil-compute client

CLI for submitting compute jobs to datatzen Core. **Client always pays** via balance-based escrow: pre-fund with `escrow deposit`, then `run` (checks balance before submit).

The CLI loads **.env** from the current working directory (when you run `fil-compute`). Only **CORE_URL** is needed on the client; escrow RPC URL and contract address are returned by Core (`GET /config`).

## Commands

- **escrow deposit** — Add funds to the escrow contract (fetches RPC/contract from Core).
- **escrow balance** — Check balance (from Core, or from contract when Core uses EVM escrow).
- **run** — Submit a job from a YAML file; checks balance >= max_cost_cu before submit.

## Env

| Variable | Description |
|----------|-------------|
| `CORE_URL` | Core API base URL (default `http://localhost:3000`) |

All other escrow settings (RPC URL, contract address, CU→wei) are provided by Core. Set `ESCROW_RPC_URL`, `ESCROW_CONTRACT_ADDRESS`, and optionally `ESCROW_CU_TO_WEI` on the **Core** server only.

## Examples

```bash
# Deposit 1000 CU (Core returns RPC and contract from GET /config)
npx fil-compute escrow deposit --amount 1000 --private-key 0x... [--core-url https://core.example.com]

npx fil-compute escrow balance --private-key 0x... [--core-url https://core.example.com]

# Run job from YAML (checks balance via Core, then POST /jobs)
npx fil-compute run --compute-provider node-001 --dataset-id 12145 \
  --job-file examples/docker-compute-job.yaml --private-key 0x... [--core-url https://core.example.com]
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

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

- **Basic:** `examples/docker-compute-job.yaml` — minimal (e.g. `wc -c` on `/data/input`). Required: `docker.image`; optional: `docker.command`, `compute_requirements`, `timeout_by`, `max_cost_cu` (default 100).
- **CSV compute:** `examples/docker-compute-job-csv.yaml` — Python reads CSV at `/data/input`, prints row count, columns, and numeric min/max/avg.
- **JSON compute:** `examples/docker-compute-job-json.yaml` — Python reads JSON array, prints event counts and purchase total.
- **ML compute:** `examples/docker-compute-job-ml.yaml` — Downloads a **large public dataset** from a URL (default: UCI Adult, ~48k rows, 3.8 MB), trains a RandomForest classifier, prints accuracy and classification report. Override `docker.env.DATASET_URL` in the YAML to use Wine Quality or another CSV (see job file comments).

## Sample data and PDP upload

To run compute on real data, upload a file to PDP to get a **dataset ID**, then pass that ID to `run --dataset-id <id>`.

1. **Sample files** are in `../storage/sample-data/`:
   - `sensor_readings.csv` — 15 rows (timestamp, sensor_id, value, unit)
   - `events.json` — 8 events (login, click, purchase, logout)

2. **Upload** from `storage/`:  
   `INPUT_FILE=sample-data/sensor_readings.csv node index.js`  
   (or `events.json`). Note the printed **dataSetId**.

3. **Run compute** with that ID and the matching job file:
   ```bash
   npx fil-compute run --compute-provider node-001 --dataset-id <DATASET_ID> \
     --job-file examples/docker-compute-job-csv.yaml --private-key 0x...
   ```
   See `storage/sample-data/README.md` for full steps.

### ML job with online dataset

The ML job **downloads data from a URL** inside the container (no PDP upload needed). You still pass `--dataset-id` (any valid ID; the job ignores `/data/input` and uses `DATASET_URL`).

```bash
# Default: UCI Adult (census income, ~48k rows). Needs ~2–3 min (pip install + train).
npx fil-compute run --compute-provider node-001 --dataset-id 1 \
  --job-file examples/docker-compute-job-ml.yaml --private-key 0x...
```

To use a different dataset, edit the job YAML and set `docker.env.DATASET_URL` to a direct CSV URL, e.g.:

- **UCI Adult (default):** `https://archive.ics.uci.edu/ml/machine-learning-databases/adult/adult.data` (3.8 MB, income classification)
- **Wine Quality red:** `https://archive.ics.uci.edu/ml/machine-learning-databases/wine-quality/winequality-red.csv`
- **Wine Quality white:** `https://archive.ics.uci.edu/ml/machine-learning-databases/wine-quality/winequality-white.csv`

If the job fails with **"Temporary failure in name resolution"** or **"No matching distribution found for pandas"**, the compute node’s Docker environment has no outbound internet or DNS (so `pip install` inside the container fails). Two options:

1. **Node operator:** Enable outbound internet and DNS for containers (e.g. Docker `--dns 8.8.8.8`, or fix host firewall).
2. **Use a pre-built image** (no pip at runtime): build the image once, push to a registry the node can pull, then run the prebuilt job:
   ```bash
   docker build -f examples/Dockerfile.ml -t your-registry/python-ml:3.11 .
   docker push your-registry/python-ml:3.11
   ```
   Edit `examples/docker-compute-job-ml-prebuilt.yaml` and set `docker.image` to `your-registry/python-ml:3.11`, then:
   ```bash
   npx fil-compute run ... --job-file examples/docker-compute-job-ml-prebuilt.yaml
   ```

## E2E

From `client/`:

```bash
npm install
# Ensure core is built: cd ../core && npm run build
npm run e2e
```

Mock mode: spawns Core (memory escrow) + mock node, then runs `run` with `--client-address default`. Live: set `LIVE_CORE_URL` (and optionally `LIVE_DATASET_ID`).

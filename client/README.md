# fil-compute client

CLI for submitting compute jobs to datatzen Core. **Client always pays** via balance-based escrow: pre-fund with `escrow deposit`, then `run` (checks balance before submit).

The CLI loads **.env** from the current working directory (when you run `fil-compute`). Only **CORE_URL** is needed on the client; escrow RPC URL and contract address are returned by Core (`GET /config`).

## Commands

- **escrow deposit** — Add funds to the escrow contract (fetches RPC/contract from Core).
- **escrow balance** — Check balance (from Core, or from contract when Core uses EVM escrow).
- **storage upload-pdp** — Upload local input file to PDP and create dataset (returns `dataset_id`).
- **run** — Submit a job from a YAML file; checks balance >= max_cost_cu before submit.

## Env

| Variable | Description |
|----------|-------------|
| `CORE_URL` | Core API base URL (default `http://localhost:3000`) |

All other escrow settings (RPC URL, contract address, CU→wei) are provided by Core. Set `ESCROW_RPC_URL`, `ESCROW_CONTRACT_ADDRESS`, and optionally `ESCROW_CU_TO_WEI` on the **Core** server only.

## Examples

```bash
# Upload input data file to PDP and get dataset_id
npx fil-compute storage upload-pdp --file ../storage/sample-data/sensor_readings.csv \
  --provider-id 22 --private-key 0x...

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
- **ML compute:** `examples/docker-compute-job-ml.yaml` — **Compute-to-data:** reads from `/data/input` (the dataset you pass with `--dataset-id`). Trains a RandomForest classifier (Adult, Wine, or generic CSV), prints accuracy and report. No download when using your PDP data. Optional: set `docker.env.DATASET_URL` to fetch from a URL instead.

### Storage block (optional, for client-owned S3 result upload)

Add this section to a job YAML to let the client generate pre-signed PUT/GET URLs and inject them into job env:

```yaml
storage:
  provider: s3
  bucket: my-results-bucket
  region: us-east-1
  key_prefix: datatzen/jobs
  filename: model.zip
  content_type: application/zip
  expires_seconds: 3600
  # optional:
  # endpoint: https://s3.amazonaws.com
  # force_path_style: false
  # object_key: datatzen/jobs/custom-key.zip
```

`fil-compute run` will set `result_storage: "s3"` and inject `RESULT_UPLOAD_URL`/`RESULT_DOWNLOAD_URL`/`RESULT_UPLOAD_CONTENT_TYPE`/`RESULT_OBJECT_URL` into `docker.env`.
If `storage.filename` is omitted, node defaults artifact filename to `<job_id>.zip`.
Node performs the actual PUT upload from `/data/output/<RESULT_FILENAME>` and will mark job as failed if upload fails.
Client must provide AWS credentials in env when generating presigned URLs:
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (and optional `AWS_SESSION_TOKEN`).
Do not include bucket name in `key_prefix`; use `jobs/...` style prefixes.

## Sample data and PDP upload

To run compute on real data, upload a file to PDP to get a **dataset ID**, then pass that ID to `run --dataset-id <id>`.

1. **Sample files** are in `../storage/sample-data/`:
   - `sensor_readings.csv` — 15 rows (timestamp, sensor_id, value, unit)
   - `events.json` — 8 events (login, click, purchase, logout)

2. **Upload** using client CLI (recommended):  
   `npx fil-compute storage upload-pdp --file ../storage/sample-data/sensor_readings.csv --provider-id 22 --private-key 0x...`  
   (or `events.json`). Note the printed **Dataset ID**.

3. **Run compute** with that ID and the matching job file:
   ```bash
   npx fil-compute run --compute-provider node-001 --dataset-id <DATASET_ID> \
     --job-file examples/docker-compute-job-csv.yaml --private-key 0x...
   ```
   See `storage/sample-data/README.md` for full steps.

### ML job (compute-to-data)

The ML job **reads from `/data/input`** — the dataset you pass with `--dataset-id`. Data stays on the PDP; compute runs where the data is (no download). Upload your CSV (e.g. Adult, Wine) to PDP, then:

```bash
npx fil-compute run --compute-provider node-001 --dataset-id YOUR_DATASET_ID \
  --job-file examples/docker-compute-job-ml.yaml --private-key 0x...
```

Output will say `Using /data/input (compute-to-data), N bytes`. To run on a **URL instead** (no PDP data), set `docker.env.DATASET_URL` in the YAML to a CSV URL (e.g. UCI Adult or Wine links in the job file comments).

### Job result: stdout vs node artifacts vs S3 artifacts

- **`result_url`** (e.g. `https://compute.abhayu.com/output/48e7d128-...`) returns the job’s **stdout** (plain text). That’s what you get when you open the link or when the CLI shows `result_url`.
- **Binary artifacts (e.g. trained model zip):** If the **compute node** has **`JOB_OUTPUT_DIR`** set, the job can write files to **`/data/output/`** in the container. Those files are then available at **`result_url/files/:filename`**. Example: job writes `/data/output/model.zip` → download at `https://compute.abhayu.com/output/48e7d128-.../files/model.zip`. The node must be configured with `JOB_OUTPUT_DIR` and `OUTPUT_UPLOAD_BACKEND=self` (and `NODE_PUBLIC_URL`) for this to work.
- **Client-owned S3 artifacts:** If job YAML has `storage.provider: s3`, `fil-compute run` generates pre-signed PUT/GET URLs. Node uploads artifact from `/data/output` to PUT URL. On success, Core stores pre-signed GET URL as canonical `result_url`; on upload failure, the job fails (`FAILED_CONTAINER`). Storage cost is paid by the client’s S3 account.

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

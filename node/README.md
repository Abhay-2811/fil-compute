# PDP compute node agent

Runs on the same server as the PDP node (Curio + Yugabyte). Accepts Core's preflight/start, retrieves unsealed data via `pdp-node-data-retrieve.sh`, runs user compute in Docker with that data mounted at `/data/input`, and reports completion to Core.

## Data identity

- Use **cid** in job submit as `dataset:N` (e.g. `dataset:123`) so the node looks up dataset by ID and runs the retrieve script. No Core API change required.

## Env

| Variable | Description | Default |
|----------|-------------|---------|
| `CORE_URL` | Core API base URL (for complete callback) | `http://localhost:3000` |
| `PORT` | HTTP listen port | `4000` |
| `SKIP_CORE_CALLBACK` | If `1` or `true`, log complete payload instead of POSTing to Core (for standalone testing) | — |
| `DOCKER_BIN` | Docker binary (use full path if `docker` is not in PATH when the process runs, e.g. `/usr/bin/docker`) | `docker` |
| `RETRIEVE_SCRIPT_PATH` | Path to `pdp-node-data-retrieve.sh` | `scripts/pdp-node-data-retrieve.sh` (relative to cwd) |
| `RETRIEVE_OUTPUT_DIR` | Dir where retrieve script writes `.dat` files (must match script’s OUTPUT_DIR) | `/tmp/curio-retrieved` |

## Test without Core

Run the node standalone so you can exercise preflight + start + retrieve + Docker without a running Core:

1. **Start the node with callback skipped** (it will log the complete payload instead of POSTing):

   ```bash
   cd node
   SKIP_CORE_CALLBACK=1 npm start
   # or: SKIP_CORE_CALLBACK=1 npm run dev
   ```

2. **Call preflight and start** (use a `dataset_id` that exists on your PDP):

   ```bash
   # From node/ directory
   node scripts/test-node-standalone.mjs 1
   # Or with a specific dataset_id and node URL:
   NODE_URL=http://localhost:4000 node scripts/test-node-standalone.mjs 123
   ```

   The script hits `GET /health`, `POST /preflight`, then `POST /start`. The node runs the retrieve script, runs Docker with the data mounted at `/data/input`, and prints the complete payload to stdout (because `SKIP_CORE_CALLBACK=1`).

3. **Manual curl** (optional):

   ```bash
   curl -s http://localhost:4000/health
   curl -s -X POST http://localhost:4000/preflight -H "Content-Type: application/json" \
     -d '{"job_id":"j1","cid":"dataset:1","compute_requirements":{"cpu_cores":1,"memory_mb":512}}'
   curl -s -X POST http://localhost:4000/start -H "Content-Type: application/json" \
     -d '{"job_id":"j1","attempt_id":"a1","cid":"dataset:1","compute_requirements":{"cpu_cores":1,"memory_mb":512},"docker":{"image":"alpine:3.18","command":["sh","-c","wc -c < /data/input"]},"timeout_by":60}'
   ```

## Run locally (from repo root)

```bash
cd node
npm install
npm run build
CORE_URL=http://localhost:3000 PORT=4000 npm start
```

Or with tsx (no build):

```bash
cd node
npm install
CORE_URL=http://localhost:3000 PORT=4000 npm run dev
```

Run from **repo root** if you rely on default `RETRIEVE_SCRIPT_PATH` so that `scripts/pdp-node-data-retrieve.sh` resolves:

```bash
cd /path/to/datazenv2
RETRIEVE_SCRIPT_PATH="$(pwd)/scripts/pdp-node-data-retrieve.sh" node node/dist/index.js
```

Or from `node/` with explicit script path:

```bash
cd node
RETRIEVE_SCRIPT_PATH=/path/to/datazenv2/scripts/pdp-node-data-retrieve.sh npm start
```

## Deploy on PDP server

1. Copy onto the PDP server (where Curio data and Yugabyte run):
   - `node/` (this directory and its files)
   - `scripts/pdp-node-data-retrieve.sh`
   - Ensure the script’s config (YSQLSH, DB_*, CURIO_DATA_DIR, OUTPUT_DIR) matches the server (or set them before running the script).

2. On the server, install Node 18+ and run:

   ```bash
   cd /path/to/repo/node
   npm install
   npm run build
   export CORE_URL=https://your-core-url
   export PORT=4000
   export RETRIEVE_SCRIPT_PATH=/path/to/repo/scripts/pdp-node-data-retrieve.sh
   export RETRIEVE_OUTPUT_DIR=/tmp/curio-retrieved
   npm start
   ```

3. Point Core at this node: set `NODES` (e.g. `{"node-001":"http://<server-ip>:4000"}`). If Core runs elsewhere, ensure the PDP server can reach `CORE_URL` and that the server’s port (4000) is reachable from Core (for preflight/start).

4. (Optional) Run under systemd or a process manager and bind to 0.0.0.0 if needed. Nginx/domain (e.g. compute.abhayu.com) can be added later.

## Docker contract

- Input data is mounted **read-only** at `/data/input`. The user image/command should read from `/data/input`.
- Resource limits (memory, cpus) and wall timeout are applied. On timeout the container is killed and the job is reported as completed with an error.

# PDP compute node agent

Runs on the same server as the PDP node (Curio + Yugabyte). Accepts Core's preflight/start, retrieves unsealed data **in-process** (no external script or ysqlsh), runs user compute in Docker with that data mounted at `/data/input`, and reports completion to Core.

## Data identity

- Use **cid** in job submit as `dataset:N` (e.g. `dataset:123`) so the node looks up dataset by ID and performs retrieval. No Core API change required.

## Env

Single env setup for the node provider; retrieval uses DB + Curio paths only (no script path, no ysqlsh).

| Variable | Description | Default |
|----------|-------------|---------|
| `CORE_URL` | Core API base URL (for complete callback) | `http://localhost:3000` |
| `PORT` | HTTP listen port | `4000` |
| `SKIP_CORE_CALLBACK` | If `1` or `true`, log complete payload instead of POSTing to Core (for standalone testing) | — |
| `LOG_LEVEL` | Log level: `error`, `warn`, `info`, `debug` (default `info`) | `info` |
| `DOCKER_BIN` | Docker binary (use full path if `docker` is not in PATH when the process runs, e.g. `/usr/bin/docker`) | `docker` |
| `DOCKER_NETWORK` | Docker network for job containers. `default` = outbound allowed (pip install, URL fetch). Set to `none` to disable. | `default` |
| `DB_HOST` | Yugabyte/Postgres host | `127.0.0.1` |
| `DB_PORT` | Yugabyte/Postgres port | `5433` |
| `DB_USER` | DB user | `yugabyte` |
| `DB_NAME` | Database name | `yugabyte` |
| `DB_PASSWORD` | DB password (optional; empty for peer auth) | — |
| `CURIO_DATA_DIR` | Root of Curio piece files; piece path = `CURIO_DATA_DIR/piece/s-t00-<piece_ref>` | `/mnt/data` |
| `RETRIEVE_OUTPUT_DIR` | Dir where the node writes the extracted dataset file (content can be any format) | `/tmp/curio-retrieved` |
| `OUTPUT_UPLOAD_BACKEND` | Where to expose job result: `self` (node serves at GET /output/:job_id), `s3` (stub, not implemented), `none` (default) | `none` |
| `NODE_PUBLIC_URL` | Base URL of this node (e.g. `https://compute.example.com:4000`). Required when `OUTPUT_UPLOAD_BACKEND=self` so the node can send `result_url` to Core | — |
| `JOB_OUTPUT_DIR` | Host dir for job artifacts. When set, each job gets a subdir mounted at `/data/output`; files are downloadable at `result_url/files/:filename` (e.g. model.zip) | — |

When `OUTPUT_UPLOAD_BACKEND=self`, the node stores job stdout in memory and serves it at **GET /output/:job_id** (plain text). It sends that URL to Core as `result_url` in the complete callback; Core returns `result_url` on **GET /jobs/:id** so users can fetch the result from Core or directly from the node.

**Binary artifacts (e.g. trained model zip):** Set **`JOB_OUTPUT_DIR`** (e.g. `/var/lib/compute-node/output`). The node mounts `JOB_OUTPUT_DIR/job_id` at **/data/output** in the container (writable). Any file the job writes there is served at **GET /output/:job_id/files/:filename**. So if the job writes `/data/output/model.zip`, the user can download it at `result_url/files/model.zip` (e.g. `https://compute.example.com/output/48e7d128-.../files/model.zip`). If `JOB_OUTPUT_DIR` is not set, only stdout (text) is available.

## Where to configure domains (no hardcoding)

Configure via environment variables only.

| Domain / role | Where to set | Env variable(s) |
|---------------|--------------|------------------|
| **Compute node** (this agent, e.g. `https://compute.example.com`) | On the **node** server | `NODE_PUBLIC_URL=https://compute.example.com` (so `result_url` and GET /output/:id use this). |
| **Compute node** (so Core can call preflight/start) | On the **Core** server | `NODES={"node-001":"https://compute.example.com"}` (or your nodeid and URL). |
| **PDP server** (Curio + Yugabyte, e.g. `pdp.example.com`) | On the **node** server | `DB_HOST=pdp.example.com` (and optionally `DB_PORT`, `DB_USER`, etc.) if the DB lives on the PDP host. `CURIO_DATA_DIR` is a **local path** on the machine where the node runs (e.g. `/mnt/data`); if the node and PDP are on the same host, that path is local; if different, you need the node to have access to that path (e.g. NFS). |
| **Core API** (for complete callback) | On the **node** server | `CORE_URL=https://your-core-api.example.com` |

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

   The test script hits `GET /health`, `POST /preflight`, then `POST /start`. The node performs in-process retrieval, runs Docker with the data mounted at `/data/input`, and prints the complete payload to stdout (because `SKIP_CORE_CALLBACK=1`).

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

For local runs with a real PDP, set `DB_*` and `CURIO_DATA_DIR` so the node can resolve datasets and read piece files (e.g. `DB_HOST=localhost CURIO_DATA_DIR=/mnt/data npm start`).

## Deploy on PDP server

1. Copy `node/` (this directory and its files) onto the PDP server where Curio data and Yugabyte run. No separate script is required; the node performs retrieval in-process using DB and `CURIO_DATA_DIR`.

2. On the server, install Node 18+ and run:

   ```bash
   cd /path/to/repo/node
   npm install
   npm run build
   export CORE_URL=https://your-core-url
   export PORT=4000
   export DB_HOST=127.0.0.1
   export DB_PORT=5433
   export DB_USER=yugabyte
   export DB_NAME=yugabyte
   export DB_PASSWORD=     
   export CURIO_DATA_DIR=/mnt/data
   export RETRIEVE_OUTPUT_DIR=/tmp/curio-retrieved
   npm start
   ```

3. Point Core at this node: set `NODES` (e.g. `{"node-001":"http://<server-ip>:4000"}`). If Core runs elsewhere, ensure the PDP server can reach `CORE_URL` and that the server’s port (4000) is reachable from Core (for preflight/start).

4. (Optional) Run under systemd or a process manager and bind to 0.0.0.0 if needed. Put Nginx (or another reverse proxy) in front and use a public domain; set `NODE_PUBLIC_URL` to that domain (see below).

## Docker contract

- Input data is mounted **read-only** at `/data/input`. The user image/command should read from `/data/input`.
- Resource limits (memory, cpus) and wall timeout are applied. On timeout the container is killed and the job is reported as completed with an error.

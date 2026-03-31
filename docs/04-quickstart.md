# Quickstart

Fresh-user path: from clone to first successful job run.

## Live hackathon deployment defaults

- Core URL: `https://core.abhayu.com`
- PDP endpoint: `https://pdp.abhayu.com`
- PDP provider id: `22`
- Public demo environment is available until end of hackathon.

## 0) Clone repo and open client directory

```bash
git clone <YOUR_REPO_URL>
cd fil-compute/client
npm install
```

Run all commands below from the `client/` directory.

## 1) Set core URL once

```bash
# Linux/macOS
export CORE_URL=https://core.abhayu.com

# Windows PowerShell
$env:CORE_URL="https://core.abhayu.com"
```

## 2) Upload input to PDP (provider id 22)

```bash
npx fil-compute storage upload-pdp \
  --file ../storage/sample-data/sensor_readings.csv \
  --provider-id 22 \
  --private-key 0xYOUR_PRIVATE_KEY
```

Save the returned `Dataset ID`.

If needed, verify provider info in your PDP setup at `https://pdp.abhayu.com`.

## 3) Fund escrow

```bash
npx fil-compute escrow deposit \
  --amount 1000 \
  --private-key 0xYOUR_PRIVATE_KEY \
  --core-url https://core.abhayu.com
```

## 4) Run compute

```bash
npx fil-compute run \
  --compute-provider node-001 \
  --dataset-id <DATASET_ID> \
  --job-file examples/docker-compute-job-ml.yaml \
  --private-key 0xYOUR_PRIVATE_KEY \
  --core-url https://core.abhayu.com
```

## Fast path: ready "train your own model" example

Use preloaded dataset id `12909` and the ready example spec:

```bash
npx fil-compute run \
  --compute-provider node-001 \
  --dataset-id 12909 \
  --job-file ../examples/train-your-own-model/job.yaml \
  --private-key 0xYOUR_PRIVATE_KEY \
  --core-url https://core.abhayu.com
```

Reference: `../examples/train-your-own-model/README.md`

## 5) Check result

- `result_url` from CLI output.
- If Akave O3 mode is enabled, canonical `result_url` is a presigned GET link.

## 6) Optional: run with client-owned Akave O3 artifacts

Add to your job YAML:

```yaml
storage:
  provider: s3
  bucket: akave-o3-results
  region: us-east-1
  key_prefix: jobs
  expires_seconds: 3600
  endpoint: https://o3-rc3.akave.xyz
```

Then run `fil-compute run` normally. The client prepares presigned URLs, node uploads artifact, and Core returns presigned GET as `result_url`.

## 7) Verify state transitions quickly

```bash
curl -s https://core.abhayu.com/jobs/<JOB_ID>
```

Expected progression: `SUBMITTED -> PREFLIGHTING -> RUNNING -> SUCCEEDED` (or terminal failure).

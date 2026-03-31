# Quickstart

## 1) Upload input to PDP

```bash
npx fil-compute storage upload-pdp \
  --file ../storage/sample-data/sensor_readings.csv \
  --provider-id 22 \
  --private-key 0xYOUR_PRIVATE_KEY
```

Save the returned `Dataset ID`.

## 2) Fund escrow

```bash
npx fil-compute escrow deposit \
  --amount 1000 \
  --private-key 0xYOUR_PRIVATE_KEY \
  --core-url https://core.example.com
```

## 3) Run compute

```bash
npx fil-compute run \
  --compute-provider node-001 \
  --dataset-id <DATASET_ID> \
  --job-file examples/docker-compute-job-ml.yaml \
  --private-key 0xYOUR_PRIVATE_KEY \
  --core-url https://core.example.com
```

## 4) Check result

- `result_url` from CLI output.
- If S3 mode is enabled, canonical `result_url` is a presigned GET link.

## Optional: run with client-owned S3 artifacts

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

## Verify state transitions quickly

```bash
curl -s https://core.example.com/jobs/<JOB_ID>
```

Expected progression: `SUBMITTED -> PREFLIGHTING -> RUNNING -> SUCCEEDED` (or terminal failure).

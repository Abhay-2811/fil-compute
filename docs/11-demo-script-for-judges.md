# Demo Script for Judges

Use this flow for a crisp technical demo (6-8 minutes).

## 0) Setup slide (30s)

- One-liner: "Compute runs where PDP data lives; payment settles from escrow only on success."
- Show architecture diagram and lifecycle states.

## 1) Upload dataset to PDP (1 min)

```bash
npx fil-compute storage upload-pdp \
  --file ../storage/sample-data/sensor_readings.csv \
  --provider-id 22 \
  --private-key 0x...
```

Call out:
- provider-id validation,
- returned `dataset_id`.

## 2) Fund escrow and show balance (1 min)

```bash
npx fil-compute escrow deposit --amount 1000 --private-key 0x... --core-url https://core.example.com
npx fil-compute escrow balance --private-key 0x... --core-url https://core.example.com
```

Call out:
- client reads escrow config from Core `GET /config`,
- no chain config required in client `.env`.

## 3) Submit ML job (2 min)

```bash
npx fil-compute run \
  --compute-provider node-001 \
  --dataset-id <DATASET_ID> \
  --job-file examples/docker-compute-job-ml.yaml \
  --private-key 0x... \
  --core-url https://core.example.com
```

Call out:
- uses `/data/input` (compute-to-data),
- no source data download needed.

## 4) Show result modes (1.5 min)

- Open `result_url` (stdout).
- Open `/files/<artifact>` if node-hosted mode.
- Show presigned S3 GET URL when `storage.provider: s3`.

## 5) Reliability proof points (1 min)

- Mention asynchronous settlement after immediate callback ack.
- Mention idempotent complete callbacks.
- Mention concrete failure handling (`FAILED_CONTAINER`, `FAILED_NODE`).

## 6) Close (30s)

- "Today: working compute-to-data + escrow + client-owned storage."
- "Next: stronger verification and multi-node orchestration."

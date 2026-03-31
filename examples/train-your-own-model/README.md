# Train Your Own Model Example

This is a plug-and-play example for hackathon demos.

## What you get

- A ready job spec: `job.yaml`
- A preloaded PDP dataset id to run immediately
- Model artifact output (`model.pkl` and `<job_id>.zip`)

## Live hackathon defaults

- Core URL: `https://core.abhayu.com`
- PDP endpoint: `https://pdp.abhayu.com`
- PDP provider id: `22`
- Preloaded dataset id: `12909`

## Run from `client/`

```bash
npx fil-compute run \
  --compute-provider node-001 \
  --dataset-id 12909 \
  --job-file ../examples/train-your-own-model/job.yaml \
  --private-key 0xYOUR_PRIVATE_KEY \
  --core-url https://core.abhayu.com
```

## Result

- `result_url` prints in CLI output.
- If Akave O3 storage is configured in `job.yaml`, the canonical `result_url` is a presigned GET URL.
- The produced zip includes `model.pkl`.

## Bring your own data

Upload your own CSV to PDP and replace `--dataset-id`:

```bash
npx fil-compute storage upload-pdp \
  --file ../storage/sample-data/adult.data \
  --provider-id 22 \
  --private-key 0xYOUR_PRIVATE_KEY
```

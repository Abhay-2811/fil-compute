# Sample data for PDP upload

Use these files as the payload when creating a dataset on PDP. The storage upload script reads a file, computes its piece CID, uploads to the provider, and creates a dataset. Use `INPUT_FILE` so you don't have to overwrite `test.txt`.

## Files

| File | Description |
|------|-------------|
| `sensor_readings.csv` | 15 rows: timestamp, sensor_id, value, unit (temperature, pressure, humidity) |
| `events.json` | 8 JSON objects: ts, event (login/click/purchase/logout), user_id, optional amount |

## Upload to PDP

From the `storage/` directory:

```bash
# CSV (sensor data) — after run, note the printed dataSetId
INPUT_FILE=sample-data/sensor_readings.csv node index.js

# JSON (events) — use a different dataset per file
INPUT_FILE=sample-data/events.json node index.js
```

The script prints `Data set <dataSetId> created ...`. Use that **dataset ID** when submitting compute jobs with `--dataset-id <id>`.

## Run compute on the dataset

After upload, from `client/`:

```bash
# CSV: stats on sensor_readings (columns, row count, min/max/avg for numeric columns)
npx fil-compute run --compute-provider node-001 --dataset-id <DATASET_ID> \
  --job-file examples/docker-compute-job-csv.yaml --private-key 0x...

# JSON: event counts and purchase total
npx fil-compute run --compute-provider node-001 --dataset-id <DATASET_ID> \
  --job-file examples/docker-compute-job-json.yaml --private-key 0x...
```

Replace `<DATASET_ID>` with the ID printed by the upload script. Ensure your compute node can resolve that dataset (same PDP/Curio + DB as where you uploaded).

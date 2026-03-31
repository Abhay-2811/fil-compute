# Storage Modes

## A) Node-hosted output

- `OUTPUT_UPLOAD_BACKEND=self`
- stdout: `GET /output/:job_id`
- files: `GET /output/:job_id/files/:filename` (requires `JOB_OUTPUT_DIR`)

## B) Client-owned Akave O3 (recommended)

- Client generates presigned PUT/GET URLs at submit time.
- Node uploads artifact to PUT URL after successful compute.
- Core stores GET URL as canonical `result_url`.
- Client pays storage/transfer in their own Akave O3 bucket.

## Get Akave O3 credentials

1. Open [console.akave.com](https://console.akave.com).
2. Create/select an O3 bucket (S3-compatible storage backed by Filecoin).
3. Generate access key + secret key.
4. Export keys in client environment:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - optional `AWS_SESSION_TOKEN`
5. Use the same Akave console UI to see uploaded artifacts in your bucket after jobs finish.

## Result URL behavior

| Mode | `result_url` points to | Best for |
|---|---|---|
| Node stdout | Node `GET /output/:job_id` | logs-first workflows |
| Node artifact file | Node `GET /output/:job_id/files/:filename` | quick local binary retrieval |
| Akave O3 mode | Presigned GET URL | client-controlled retention/costs |

## YAML snippet (Akave O3)

```yaml
storage:
  provider: s3
  bucket: akave-o3-results
  region: us-east-1
  key_prefix: jobs
  expires_seconds: 3600
  endpoint: https://o3-rc3.akave.xyz
```

## Notes

- Do not include bucket name inside `key_prefix`.
- If `storage.filename` is omitted, node defaults to `<job_id>.zip`.
- Node upload failure to presigned PUT URL is treated as execution failure.

## Akave O3 flow

```mermaid
sequenceDiagram
  participant C as Client
  participant N as Node
  participant S as S3CompatibleStore
  participant K as Core

  C->>C: Generate presigned PUT + GET
  C->>K: submit job with upload env
  K->>N: start job
  N->>S: PUT artifact via presigned URL
  S-->>N: 200 OK
  N-->>K: COMPLETE(result_url=presigned GET)
```

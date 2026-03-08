import type { JobRecord, JobStatus } from "../types.js";

const jobs = new Map<string, JobRecord>();
/** Index by client_request_id (per user) for idempotency. v0: single "default" user. */
const byClientRequestId = new Map<string, string>();

export function createJob(record: JobRecord): void {
  jobs.set(record.job_id, record);
  if (record.client_request_id) {
    byClientRequestId.set(record.client_request_id, record.job_id);
  }
}

export function getJob(jobId: string): JobRecord | undefined {
  return jobs.get(jobId);
}

export function getJobByClientRequestId(clientRequestId: string): JobRecord | undefined {
  const jobId = byClientRequestId.get(clientRequestId);
  return jobId ? jobs.get(jobId) : undefined;
}

export function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates: Partial<Pick<JobRecord, "result_cid" | "result_url" | "cu_used" | "receipt" | "error" | "attempt_id">> = {}
): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.status = status;
  job.updated_at = new Date().toISOString();
  if (updates.result_cid != null) job.result_cid = updates.result_cid;
  if (updates.result_url != null) job.result_url = updates.result_url;
  if (updates.cu_used != null) job.cu_used = updates.cu_used;
  if (updates.receipt != null) job.receipt = updates.receipt;
  if (updates.error != null) job.error = updates.error;
  if (updates.attempt_id != null) job.attempt_id = updates.attempt_id;
  return true;
}

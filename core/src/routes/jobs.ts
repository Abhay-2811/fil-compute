import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { validateJobSubmitRequest } from "../validation/schema.js";
import * as store from "../store/jobs.js";
import { escrow } from "../escrow/index.js";
import { getNodePayoutAddress } from "../config.js";
import { runJobFlow } from "../job-flow.js";
import type { JobRecord, JobSubmitRequest, JobResource, CompleteBody } from "../types.js";

const router = Router();

function toResource(record: JobRecord): JobResource {
  const r: JobResource = {
    job_id: record.job_id,
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
  if (record.result_cid != null) r.result_cid = record.result_cid;
  if (record.cu_used != null) r.cu_used = record.cu_used;
  if (record.receipt != null) r.receipt = record.receipt;
  if (record.error != null) r.error = record.error;
  return r;
}

/** POST /jobs — submit job. Idempotent when client_request_id is provided. */
router.post("/", (req: Request, res: Response) => {
  const body = req.body as unknown;

  if (!validateJobSubmitRequest(body)) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid job submit request",
      details: validateJobSubmitRequest.errors ?? [],
    });
  }

  const input = body as JobSubmitRequest;

  // Idempotency: if we already have a job for this client_request_id, return it
  if (input.client_request_id) {
    const existing = store.getJobByClientRequestId(input.client_request_id);
    if (existing) {
      return res.status(200).json(toResource(existing));
    }
  }

  const now = new Date().toISOString();
  const jobId = uuidv4();
  const record: JobRecord = {
    job_id: jobId,
    status: "SUBMITTED",
    nodeid: input.nodeid,
    cid: input.cid,
    compute_requirements: input.compute_requirements,
    docker: input.docker,
    timeout_by: input.timeout_by,
    max_cost_cu: input.max_cost_cu,
    client_request_id: input.client_request_id,
    created_at: now,
    updated_at: now,
  };

  store.createJob(record);
  runJobFlow(jobId).catch((err) => console.error("Job flow error:", err));
  res.status(201).json(toResource(record));
});

/** POST /jobs/:job_id/complete — Node callback when job finishes (SUCCESS or CONTAINER_ERROR) */
router.post("/:job_id/complete", async (req: Request, res: Response) => {
  const { job_id } = req.params;
  const body = req.body as unknown;

  const job = store.getJob(job_id);
  if (!job) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Job not found" });
  }
  if (job.status !== "RUNNING") {
    return res.status(409).json({
      error: "INVALID_STATE",
      message: `Job not running (status: ${job.status})`,
    });
  }

  const b = body as Record<string, unknown>;
  if (
    typeof body !== "object" ||
    body === null ||
    typeof b.job_id !== "string" ||
    typeof b.attempt_id !== "string" ||
    b.job_id !== job_id ||
    b.attempt_id !== job.attempt_id
  ) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid complete body or attempt_id mismatch",
    });
  }

  const status = b.status as string;
  if (status !== "SUCCESS" && status !== "CONTAINER_ERROR") {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "status must be SUCCESS or CONTAINER_ERROR",
    });
  }

  const metrics = b.metrics as Record<string, unknown> | undefined;
  if (
    !metrics ||
    typeof metrics.wall_seconds !== "number" ||
    typeof metrics.cpu_seconds !== "number" ||
    typeof metrics.memory_mb_peak !== "number"
  ) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "metrics (wall_seconds, cpu_seconds, memory_mb_peak) required",
    });
  }

  const cuUsed = Number(b.cu_used);
  if (Number.isNaN(cuUsed) || cuUsed < 0) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "cu_used must be a non-negative number",
    });
  }

  if (status === "SUCCESS") {
    const resultCid = b.result_cid;
    if (typeof resultCid !== "string" || !resultCid) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "result_cid required when status is SUCCESS",
      });
    }
  }

  const complete = body as CompleteBody;

  // Exactly-once settlement
  const nodePayout = getNodePayoutAddress(job.nodeid) ?? undefined;
  const settled = await Promise.resolve(
    escrow.settleSuccess(
      job_id,
      complete.cu_used,
      nodePayout,
      complete.attempt_id
    )
  );
  if (!settled) {
    return res.status(409).json({
      error: "ALREADY_SETTLED",
      message: "Job already settled",
    });
  }

  if (complete.status === "SUCCESS") {
    store.updateJobStatus(job_id, "SUCCEEDED", {
      result_cid: complete.result_cid,
      cu_used: complete.cu_used,
      receipt: {
        job_id: complete.job_id,
        attempt_id: complete.attempt_id,
        result_cid: complete.result_cid,
        cu_used: complete.cu_used,
        nodeid: job.nodeid,
        signed_at: new Date().toISOString(),
        signature: complete.signature,
      },
    });
  } else {
    store.updateJobStatus(job_id, "FAILED_CONTAINER", {
      cu_used: complete.cu_used,
      error: {
        type: "CONTAINER_ERROR",
        message: complete.error?.message ?? `Exit ${complete.error?.exit_code ?? "?"}`,
      },
    });
  }

  res.status(200).json({ ok: true });
});

/** GET /jobs/:job_id — poll job status */
router.get("/:job_id", (req: Request, res: Response) => {
  const { job_id } = req.params;
  const record = store.getJob(job_id);
  if (!record) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Job not found" });
  }
  res.json(toResource(record));
});

export default router;

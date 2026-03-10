import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { validateJobSubmitRequest } from "../validation/schema.js";
import * as store from "../store/jobs.js";
import { escrow } from "../escrow/index.js";
import { getNodePayoutAddress } from "../config.js";
import { runJobFlow } from "../job-flow.js";
import { logger } from "../logger.js";
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
  if (record.result_url != null) r.result_url = record.result_url;
  if (record.cu_used != null) r.cu_used = record.cu_used;
  if (record.receipt != null) r.receipt = record.receipt;
  if (record.error != null) r.error = record.error;
  return r;
}

/** POST /jobs — submit job. Idempotent when client_request_id is provided. */
router.post("/", async (req: Request, res: Response) => {
  const body = req.body as unknown;

  if (!validateJobSubmitRequest(body)) {
    logger.warn("Job submit validation failed", { details: validateJobSubmitRequest.errors ?? [] });
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid job submit request",
      details: validateJobSubmitRequest.errors ?? [],
    });
  }

  const input = body as JobSubmitRequest;

  // Balance check: client must have enough escrow balance to cover max_cost_cu
  const balance = await Promise.resolve(escrow.getBalance(input.client_address));
  if (typeof balance !== "number" || balance < input.max_cost_cu) {
    logger.warn("Job submit rejected: insufficient balance", {
      client_address: input.client_address,
      balance_cu: typeof balance === "number" ? balance : 0,
      required_cu: input.max_cost_cu,
    });
    return res.status(400).json({
      error: "INSUFFICIENT_BALANCE",
      message: "Insufficient escrow balance for max_cost_cu",
      balance_cu: typeof balance === "number" ? balance : 0,
      required_cu: input.max_cost_cu,
    });
  }

  // Idempotency: if we already have a job for this client_request_id, return it
  if (input.client_request_id) {
    const existing = store.getJobByClientRequestId(input.client_request_id);
    if (existing) {
      logger.info("Job submit idempotent return", { job_id: existing.job_id, client_request_id: input.client_request_id });
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
    client_address: input.client_address,
    created_at: now,
    updated_at: now,
  };

  store.createJob(record);
  logger.info("Job submitted", { job_id: jobId, nodeid: input.nodeid, client_address: input.client_address, max_cost_cu: input.max_cost_cu });
  runJobFlow(jobId).catch((err) => logger.error("Job flow error", { job_id: jobId, error: err instanceof Error ? err.message : String(err) }));
  res.status(201).json(toResource(record));
});

/** POST /jobs/:job_id/complete — Node callback when job finishes (SUCCESS or CONTAINER_ERROR) */
router.post("/:job_id/complete", async (req: Request, res: Response) => {
  const { job_id } = req.params;
  const body = req.body as unknown;

  const job = store.getJob(job_id);
  if (!job) {
    logger.warn("Complete callback: job not found", { job_id });
    return res.status(404).json({ error: "NOT_FOUND", message: "Job not found" });
  }
  if (job.status !== "RUNNING") {
    logger.warn("Complete callback: invalid state", { job_id, status: job.status });
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
    logger.warn("Complete callback: validation error", { job_id, message: "Invalid complete body or attempt_id mismatch" });
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid complete body or attempt_id mismatch",
    });
  }

  const status = b.status as string;
  if (status !== "SUCCESS" && status !== "CONTAINER_ERROR") {
    logger.warn("Complete callback: invalid status", { job_id, status });
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
    logger.warn("Complete callback: missing metrics", { job_id });
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "metrics (wall_seconds, cpu_seconds, memory_mb_peak) required",
    });
  }

  const cuUsed = Number(b.cu_used);
  if (Number.isNaN(cuUsed) || cuUsed < 0) {
    logger.warn("Complete callback: invalid cu_used", { job_id });
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "cu_used must be a non-negative number",
    });
  }

  if (status === "SUCCESS") {
    const resultCid = b.result_cid;
    if (typeof resultCid !== "string" || !resultCid) {
      logger.warn("Complete callback: missing result_cid", { job_id });
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "result_cid required when status is SUCCESS",
      });
    }
  }

  const complete = body as CompleteBody;

  // Exactly-once settlement: only deduct from client balance when job SUCCEEDED
  if (complete.status === "SUCCESS") {
    const nodePayout = getNodePayoutAddress(job.nodeid) ?? undefined;
    const clientAddress = job.client_address;
    if (!clientAddress) {
      logger.warn("Complete callback: job missing client_address", { job_id });
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Job missing client_address; cannot settle",
      });
    }
    const settled = await Promise.resolve(
      escrow.settleSuccess(
        job_id,
        complete.cu_used,
        nodePayout,
        complete.attempt_id,
        clientAddress
      )
    );
    if (!settled) {
      logger.warn("Complete callback: already settled", { job_id });
      return res.status(409).json({
        error: "ALREADY_SETTLED",
        message: "Job already settled",
      });
    }
    logger.info("Escrow settled", { job_id, client_address: clientAddress, cu_used: complete.cu_used, node_payout: nodePayout });
  }

  if (complete.status === "SUCCESS") {
    store.updateJobStatus(job_id, "SUCCEEDED", {
      result_cid: complete.result_cid,
      result_url: complete.result_url,
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
    logger.info("Job completed successfully", { job_id, attempt_id: complete.attempt_id, result_cid: complete.result_cid });
  } else {
    store.updateJobStatus(job_id, "FAILED_CONTAINER", {
      cu_used: complete.cu_used,
      error: {
        type: "CONTAINER_ERROR",
        message: complete.error?.message ?? `Exit ${complete.error?.exit_code ?? "?"}`,
      },
    });
    logger.info("Job reported CONTAINER_ERROR", { job_id, attempt_id: complete.attempt_id, error: complete.error?.message });
  }

  res.status(200).json({ ok: true });
});

/** GET /jobs/:job_id — poll job status */
router.get("/:job_id", (req: Request, res: Response) => {
  const { job_id } = req.params;
  if (job_id === "balance") {
    const user = req.query.user as string | undefined;
    if (!user || (user !== "default" && !user.startsWith("0x"))) {
      logger.warn("Balance query: missing or invalid user", { user: user ?? "(missing)" });
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Query 'user' required (0x address or 'default')",
      });
    }
    Promise.resolve(escrow.getBalance(user))
      .then((balance) => {
        logger.debug("Balance returned", { user, balance_cu: balance });
        res.json({ balance_cu: balance });
      })
      .catch((err) => {
        logger.error("Balance check failed", { user, error: err instanceof Error ? err.message : String(err) });
        res.status(500).json({ error: "BALANCE_CHECK_FAILED", message: err instanceof Error ? err.message : "Unknown" });
      });
    return;
  }
  const record = store.getJob(job_id);
  if (!record) {
    logger.debug("Job not found", { job_id });
    return res.status(404).json({ error: "NOT_FOUND", message: "Job not found" });
  }
  logger.debug("Job status returned", { job_id, status: record.status });
  res.json(toResource(record));
});

export default router;

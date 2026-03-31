import { CORE_URL, SKIP_CORE_CALLBACK } from "./config.js";
import { computeCuUsed, type CuMetrics } from "./docker-runner.js";
import { logger } from "./logger.js";

const LOG_TAIL_MAX = 8192;

export interface CompletePayload {
  jobId: string;
  attemptId: string;
  status: "SUCCESS" | "CONTAINER_ERROR";
  metrics?: CuMetrics;
  resultCid?: string;
  resultUrl?: string;
  error?: {
    exitCode: number;
    message?: string;
    logsTail?: string;
  };
}

/**
 * POST to Core /jobs/:job_id/complete with status, metrics, cu_used, result_cid or error.
 */
export async function sendComplete(payload: CompletePayload): Promise<void> {
  const { jobId, attemptId, status, metrics, resultCid, resultUrl, error } = payload;
  const cpuSeconds = metrics?.cpuSeconds ?? 0;
  const wallSeconds = metrics?.wallSeconds ?? 0;
  const memoryMbPeak = metrics?.memoryMbPeak ?? 0;
  const cuUsed = metrics
    ? computeCuUsed({
        cpuSeconds,
        wallSeconds,
        memoryMbPeak,
      })
    : 0;

  const body: Record<string, unknown> = {
    job_id: jobId,
    attempt_id: attemptId,
    status,
    metrics: {
      wall_seconds: wallSeconds,
      cpu_seconds: cpuSeconds,
      memory_mb_peak: memoryMbPeak,
    },
    cu_used: cuUsed,
  };
  if (status === "SUCCESS" && resultCid) {
    body.result_cid = resultCid;
  }
  if (status === "SUCCESS" && resultUrl) {
    body.result_url = resultUrl;
  }
  if (status === "CONTAINER_ERROR" && error) {
    body.error = {
      exit_code: error.exitCode,
      message: error.message ?? `Exit ${error.exitCode}`,
      logs_tail: (error.logsTail ?? "").slice(0, LOG_TAIL_MAX),
    };
  }

  if (SKIP_CORE_CALLBACK) {
    logger.info("SKIP_CORE_CALLBACK: would POST complete to Core (payload logged at debug)", {
      job_id: jobId,
      attempt_id: attemptId,
      status,
      cu_used: body.cu_used,
    });
    logger.debug("Complete payload (skipped)", body);
    return;
  }

  const url = `${CORE_URL.replace(/\/$/, "")}/jobs/${jobId}/complete`;
  logger.debug("POSTing complete to Core", { url, job_id: jobId, status });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error("Core complete callback failed", { job_id: jobId, status_code: res.status, response: text.slice(0, 200) });
    throw new Error(`Core complete callback failed: ${res.status} ${text}`);
  }
  logger.info("Complete callback sent to Core", { job_id: jobId, attempt_id: attemptId, status });
}

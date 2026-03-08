import { CORE_URL, SKIP_CORE_CALLBACK } from "./config.js";
import { computeCuUsed, type CuMetrics } from "./docker-runner.js";

const LOG_TAIL_MAX = 8192;

export interface CompletePayload {
  jobId: string;
  attemptId: string;
  status: "SUCCESS" | "CONTAINER_ERROR";
  metrics?: CuMetrics;
  resultCid?: string;
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
  const { jobId, attemptId, status, metrics, resultCid, error } = payload;
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
  if (status === "CONTAINER_ERROR" && error) {
    body.error = {
      exit_code: error.exitCode,
      message: error.message ?? `Exit ${error.exitCode}`,
      logs_tail: (error.logsTail ?? "").slice(0, LOG_TAIL_MAX),
    };
  }

  if (SKIP_CORE_CALLBACK) {
    console.log("[SKIP_CORE_CALLBACK] Would POST to Core:", JSON.stringify(body, null, 2));
    return;
  }

  const url = `${CORE_URL.replace(/\/$/, "")}/jobs/${jobId}/complete`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core complete callback failed: ${res.status} ${text}`);
  }
}

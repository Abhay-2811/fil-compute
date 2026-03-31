import { v4 as uuidv4 } from "uuid";
import * as store from "./store/jobs.js";
import { getNodePayoutAddress } from "./config.js";
import { preflight, start } from "./node-client.js";
import { logger } from "./logger.js";

/**
 * Run the happy-path flow after job creation: PREFLIGHTING → preflight → START → RUNNING.
 * Balance-based escrow: no lock at job start (balance already checked at POST /jobs). No refund on failure.
 */
export async function runJobFlow(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job || job.status !== "SUBMITTED") return;

  store.updateJobStatus(jobId, "PREFLIGHTING");
  logger.info("Job flow: preflighting", { job_id: jobId, nodeid: job.nodeid, cid: job.cid });

  try {
    const pf = await preflight(
      job.nodeid,
      job.job_id,
      job.cid,
      job.compute_requirements
    );

    if (!pf.ok) {
      logger.warn("Job flow: preflight failed", { job_id: jobId, error: pf.error?.message ?? pf.error?.code });
      store.updateJobStatus(jobId, "FAILED_PREFLIGHT", {
        error: {
          type: "PREFLIGHT_FAIL",
          message: pf.error?.message ?? pf.error?.code ?? "Preflight failed",
        },
      });
      return;
    }

    const attemptId = uuidv4();
    logger.info("Job flow: preflight ok, sending start to node", { job_id: jobId, attempt_id: attemptId });

    await start(
      job.nodeid,
      job.job_id,
      attemptId,
      job.cid,
      job.compute_requirements,
      job.docker,
      job.timeout_by
    );

    store.updateJobStatus(jobId, "RUNNING", { attempt_id: attemptId });
    logger.info("Job flow: node running", { job_id: jobId, attempt_id: attemptId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Job flow error", { job_id: jobId, error: message });
    store.updateJobStatus(jobId, "FAILED_NODE", {
      error: { type: "NODE_FAULT", message },
    });
  }
}

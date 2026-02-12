import { v4 as uuidv4 } from "uuid";
import * as store from "./store/jobs.js";
import { escrow } from "./escrow/index.js";
import { getNodePayoutAddress } from "./config.js";
import { preflight, start } from "./node-client.js";

/**
 * Run the happy-path flow after job creation: PREFLIGHTING → preflight →
 * ESCROW_LOCKED → START → RUNNING. On any failure: FAILED_PREFLIGHT or FAILED_NODE + refund.
 */
export async function runJobFlow(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job || job.status !== "SUBMITTED") return;

  store.updateJobStatus(jobId, "PREFLIGHTING");

  try {
    const pf = await preflight(
      job.nodeid,
      job.job_id,
      job.cid,
      job.compute_requirements
    );

    if (!pf.ok) {
      store.updateJobStatus(jobId, "FAILED_PREFLIGHT", {
        error: {
          type: "PREFLIGHT_FAIL",
          message: pf.error?.message ?? pf.error?.code ?? "Preflight failed",
        },
      });
      return;
    }

    const nodePayout = getNodePayoutAddress(job.nodeid) ?? undefined;
    const locked = await Promise.resolve(
      escrow.lock(jobId, job.max_cost_cu, undefined, nodePayout)
    );
    if (!locked) {
      store.updateJobStatus(jobId, "FAILED_PREFLIGHT", {
        error: { type: "PREFLIGHT_FAIL", message: "Insufficient escrow balance" },
      });
      return;
    }

    const attemptId = uuidv4();
    store.updateJobStatus(jobId, "ESCROW_LOCKED");

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If we already locked, refund (e.g. start failed after lock)
    await Promise.resolve(escrow.settleRefund(jobId));
    store.updateJobStatus(jobId, "FAILED_NODE", {
      error: { type: "NODE_FAULT", message },
    });
  }
}

import type { ComputeRequirements, DockerSpec } from "./types.js";
import { getNodeBaseUrl } from "./config.js";
import { logger } from "./logger.js";

export interface PreflightResponse {
  ok: boolean;
  error?: { code: string; message?: string };
}

export async function preflight(
  nodeid: string,
  jobId: string,
  cid: string,
  computeRequirements: ComputeRequirements
): Promise<PreflightResponse> {
  const base = getNodeBaseUrl(nodeid);
  if (!base) throw new Error(`Unknown node: ${nodeid}`);
  const url = `${base}/preflight`;
  logger.debug("Preflight request", { job_id: jobId, nodeid, cid, url });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      cid,
      compute_requirements: computeRequirements,
    }),
  });
  if (!res.ok) throw new Error(`Preflight HTTP ${res.status}`);
  const data = (await res.json()) as PreflightResponse;
  logger.debug("Preflight response", { job_id: jobId, nodeid, ok: data.ok });
  return data;
}

export async function start(
  nodeid: string,
  jobId: string,
  attemptId: string,
  cid: string,
  computeRequirements: ComputeRequirements,
  docker: DockerSpec,
  timeoutBy: number
): Promise<void> {
  const base = getNodeBaseUrl(nodeid);
  if (!base) throw new Error(`Unknown node: ${nodeid}`);
  const url = `${base}/start`;
  logger.debug("Start request", { job_id: jobId, attempt_id: attemptId, nodeid, url });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      attempt_id: attemptId,
      cid,
      compute_requirements: computeRequirements,
      docker,
      timeout_by: timeoutBy,
    }),
  });
  if (!res.ok) throw new Error(`Start HTTP ${res.status}`);
  logger.info("Start sent to node", { job_id: jobId, attempt_id: attemptId, nodeid });
}

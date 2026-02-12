import type { ComputeRequirements, DockerSpec } from "./types.js";
import { getNodeBaseUrl } from "./config.js";

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
  const res = await fetch(`${base}/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      cid,
      compute_requirements: computeRequirements,
    }),
  });
  if (!res.ok) throw new Error(`Preflight HTTP ${res.status}`);
  return (await res.json()) as PreflightResponse;
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
  const res = await fetch(`${base}/start`, {
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
}

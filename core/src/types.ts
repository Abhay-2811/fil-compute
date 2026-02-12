/** Job status (Core state machine) */
export type JobStatus =
  | "SUBMITTED"
  | "PREFLIGHTING"
  | "FAILED_PREFLIGHT"
  | "ESCROW_LOCKED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED_CONTAINER"
  | "FAILED_NODE";

export interface ComputeRequirements {
  cpu_cores: number;
  memory_mb: number;
  gpu?: { count: number; model?: string };
}

export interface DockerSpec {
  image: string;
  command?: string[];
  env?: Record<string, string>;
  workdir?: string;
}

/** POST /jobs body */
export interface JobSubmitRequest {
  nodeid: string;
  cid: string;
  compute_requirements: ComputeRequirements;
  docker: DockerSpec;
  timeout_by: number;
  max_cost_cu: number;
  client_request_id?: string;
}

/** Job record (in-memory store) */
export interface JobRecord {
  job_id: string;
  status: JobStatus;
  /** Submitted payload */
  nodeid: string;
  cid: string;
  compute_requirements: ComputeRequirements;
  docker: DockerSpec;
  timeout_by: number;
  max_cost_cu: number;
  client_request_id?: string;
  /** Set when we send START to node (for COMPLETE idempotency) */
  attempt_id?: string;
  /** Set when terminal with success/container error */
  result_cid?: string;
  cu_used?: number;
  receipt?: Record<string, unknown>;
  /** Set when terminal with failure */
  error?: { type: string; message: string };
  created_at: string;
  updated_at: string;
}

/** Node → Core: COMPLETE message body */
export interface CompleteBody {
  job_id: string;
  attempt_id: string;
  status: "SUCCESS" | "CONTAINER_ERROR";
  metrics: { wall_seconds: number; cpu_seconds: number; memory_mb_peak: number };
  cu_used: number;
  result_cid?: string;
  error?: { exit_code?: number; message?: string; logs_tail?: string };
  signature?: string;
}

/** API response: job resource (GET /jobs/:id or POST /jobs body) */
export interface JobResource {
  job_id: string;
  status: JobStatus;
  result_cid?: string;
  cu_used?: number;
  receipt?: Record<string, unknown>;
  error?: { type: string; message: string };
  created_at: string;
  updated_at: string;
}

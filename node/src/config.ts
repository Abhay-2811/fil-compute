/**
 * Node agent config from env.
 * Single env setup: no external script; node uses DB + CURIO_DATA_DIR for retrieval.
 */
export const CORE_URL = process.env.CORE_URL || "http://localhost:3000";
export const PORT = Number(process.env.PORT) || 4000;
export const SKIP_CORE_CALLBACK = process.env.SKIP_CORE_CALLBACK === "1" || process.env.SKIP_CORE_CALLBACK === "true";

/** Yugabyte/Postgres for resolving dataset_id to piece_ref + raw_size */
export const DB_HOST = process.env.DB_HOST || "127.0.0.1";
export const DB_PORT = Number(process.env.DB_PORT) || 5433;
export const DB_USER = process.env.DB_USER || "yugabyte";
export const DB_NAME = process.env.DB_NAME || "yugabyte";
export const DB_PASSWORD = process.env.DB_PASSWORD || "";

/** Curio piece files root; piece path = CURIO_DATA_DIR/piece/s-t00-<piece_ref> */
export const CURIO_DATA_DIR = process.env.CURIO_DATA_DIR || "/mnt/data";

/** Where to write extracted dataset files (content can be any format) */
export const RETRIEVE_OUTPUT_DIR =
  process.env.RETRIEVE_OUTPUT_DIR || "/tmp/curio-retrieved";

/** Docker binary (use full path if docker is not in PATH when node runs, e.g. /usr/bin/docker) */
export const DOCKER_BIN = process.env.DOCKER_BIN || "docker";

/** Output upload: "self" (node serves at GET /output/:job_id), "s3" (stub), "none" (default) */
const _rawBackend = (process.env.OUTPUT_UPLOAD_BACKEND || "none").trim().toLowerCase();
export const OUTPUT_UPLOAD_BACKEND = (_rawBackend === "self" || _rawBackend === "s3" ? _rawBackend : "none") as "self" | "s3" | "none";

/** Base URL of this node (e.g. https://compute.example.com:4000). Required when OUTPUT_UPLOAD_BACKEND is "self". */
export const NODE_PUBLIC_URL = (process.env.NODE_PUBLIC_URL || "").trim();

/** CU weights (v0). Match config/cu-model-v0.json */
export const CU_WEIGHTS = {
  cpu_weight: 0.001,
  mem_weight: 0.00001,
};

/**
 * Parse cid to dataset_id if convention "dataset:N" is used.
 */
export function parseDatasetIdFromCid(cid: unknown): number | null {
  if (typeof cid !== "string") return null;
  const m = cid.match(/^dataset:(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

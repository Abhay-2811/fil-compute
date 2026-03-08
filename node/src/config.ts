/**
 * Node agent config from env.
 * CORE_URL: Core API base (for complete callback)
 * PORT: HTTP listen port (default 4000)
 * SKIP_CORE_CALLBACK: if set (e.g. "1"), log complete payload instead of POSTing to Core (for standalone testing)
 * RETRIEVE_SCRIPT_PATH: path to pdp-node-data-retrieve.sh
 * RETRIEVE_OUTPUT_DIR: where script writes files (default /tmp/curio-retrieved)
 */
export const CORE_URL = process.env.CORE_URL || "http://localhost:3000";
export const PORT = Number(process.env.PORT) || 4000;
export const SKIP_CORE_CALLBACK = process.env.SKIP_CORE_CALLBACK === "1" || process.env.SKIP_CORE_CALLBACK === "true";
export const RETRIEVE_SCRIPT_PATH =
  process.env.RETRIEVE_SCRIPT_PATH || "scripts/pdp-node-data-retrieve.sh";
export const RETRIEVE_OUTPUT_DIR =
  process.env.RETRIEVE_OUTPUT_DIR || "/tmp/curio-retrieved";

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

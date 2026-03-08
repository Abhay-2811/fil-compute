import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { RETRIEVE_SCRIPT_PATH, RETRIEVE_OUTPUT_DIR } from "./config.js";

const execFileAsync = promisify(execFile);

export interface PreflightResult {
  ok: boolean;
  error?: { code: string; message: string };
}

/**
 * Run pdp-node-data-retrieve.sh with dataset_id; return path to unsealed file.
 * Script writes to RETRIEVE_OUTPUT_DIR/dataset-${dataset_id}.dat (script's OUTPUT_DIR).
 */
export async function retrieveDatasetFile(datasetId: number): Promise<string> {
  const scriptPath = path.isAbsolute(RETRIEVE_SCRIPT_PATH)
    ? RETRIEVE_SCRIPT_PATH
    : path.resolve(process.cwd(), RETRIEVE_SCRIPT_PATH);
  const { stderr } = await execFileAsync("bash", [scriptPath, String(datasetId)], {
    maxBuffer: 64 * 1024,
  });
  if (stderr) console.error("[retrieve stderr]", stderr);
  return path.join(RETRIEVE_OUTPUT_DIR, `dataset-${datasetId}.dat`);
}

/**
 * Preflight: check that we can resolve data (run retrieve for dataset_id).
 */
export async function preflightData(datasetId: number): Promise<PreflightResult> {
  try {
    await retrieveDatasetFile(datasetId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { code: "CID_NOT_FOUND", message },
    };
  }
}

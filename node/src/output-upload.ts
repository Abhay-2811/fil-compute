import { OUTPUT_UPLOAD_BACKEND, NODE_PUBLIC_URL } from "./config.js";
import { setOutput } from "./output-store.js";
import { logger } from "./logger.js";

/**
 * Store/upload job output and return a public URL when configured.
 * - "self": store in memory, return NODE_PUBLIC_URL/output/job_id
 * - "s3": stub, return null (not implemented yet)
 * - "none": return null
 */
export async function uploadOutput(
  jobId: string,
  stdout: string,
  stderr?: string
): Promise<{ url: string } | null> {
  if (OUTPUT_UPLOAD_BACKEND === "none") {
    return null;
  }
  if (OUTPUT_UPLOAD_BACKEND === "s3") {
    logger.debug("S3 output upload not implemented yet", { job_id: jobId });
    return null;
  }
  if (OUTPUT_UPLOAD_BACKEND === "self") {
    if (!NODE_PUBLIC_URL) {
      logger.warn("NODE_PUBLIC_URL not set; cannot build result_url for self backend", { job_id: jobId });
      return null;
    }
    setOutput(jobId, { stdout, stderr });
    const base = NODE_PUBLIC_URL.replace(/\/$/, "");
    const url = `${base}/output/${jobId}`;
    logger.info("Output stored for self-serve", { job_id: jobId, result_url: url });
    return { url };
  }
  return null;
}

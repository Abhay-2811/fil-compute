import { OUTPUT_UPLOAD_BACKEND, NODE_PUBLIC_URL } from "./config.js";
import { setOutput } from "./output-store.js";
import { logger } from "./logger.js";
import fs from "fs";

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

/**
 * Upload artifact file to a client-provided pre-signed PUT URL.
 * Throws on missing file or non-2xx response.
 */
export async function uploadArtifactToPresignedUrl(
  jobId: string,
  filePath: string,
  presignedPutUrl: string,
  contentType?: string
): Promise<void> {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Artifact file not found for upload: ${filePath}`);
  }
  const body = await fs.promises.readFile(filePath);
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  const res = await fetch(presignedPutUrl, {
    method: "PUT",
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Artifact upload failed: HTTP ${res.status} ${text.slice(0, 200)}`
    );
  }
  logger.info("Artifact uploaded to presigned URL", {
    job_id: jobId,
    bytes: body.length,
    status: res.status,
  });
}

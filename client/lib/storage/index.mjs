import { prepareS3ResultStorage } from "./s3.mjs";
import { uploadInputToPdp } from "./pdp.mjs";

/**
 * Build job storage settings from YAML job spec.
 * Supports storage.provider = "s3".
 */
export async function prepareResultStorage({
  jobSpec,
  clientAddress,
  datasetId,
  nodeId,
}) {
  const storage =
    jobSpec && typeof jobSpec === "object" ? jobSpec.storage : null;
  if (!storage || typeof storage !== "object") {
    return {
      resultStorageHint: undefined,
      dockerEnvPatch: {},
      storageMeta: null,
    };
  }

  const provider = String(storage.provider || "").trim().toLowerCase();
  if (!provider) {
    return {
      resultStorageHint: undefined,
      dockerEnvPatch: {},
      storageMeta: null,
    };
  }
  if (provider === "s3") {
    return prepareS3ResultStorage({
      storage,
      clientAddress,
      datasetId,
      nodeId,
    });
  }
  throw new Error(`Unsupported storage.provider: ${provider}`);
}

export { uploadInputToPdp };

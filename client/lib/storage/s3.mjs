import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requiredString(value, name) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`storage.s3 missing required field: ${name}`);
  return v;
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeKeyPrefix(prefix, bucket) {
  const raw = optionalString(prefix).replace(/(^\/|\/$)/g, "");
  if (!raw) return "jobs";
  if (raw === bucket) return "jobs";
  if (raw.startsWith(`${bucket}/`)) {
    return raw.slice(bucket.length + 1) || "jobs";
  }
  return raw;
}

function buildObjectKey({ keyPrefix, filename, clientAddress, datasetId, nodeId }) {
  const safePrefix = keyPrefix ? keyPrefix.replace(/(^\/|\/$)/g, "") : "jobs";
  const safeNode = String(nodeId || "node").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeClient = String(clientAddress || "client")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 18);
  const safeDataset = String(datasetId || "0").replace(/[^a-zA-Z0-9_-]/g, "_");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = crypto.randomBytes(4).toString("hex");
  const safeFilename = String(filename || "model.zip").replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  return `${safePrefix}/${safeNode}/${safeClient}/${safeDataset}/${ts}-${rand}-${safeFilename}`;
}

function buildObjectUrl({ bucket, region, endpoint, key, forcePathStyle }) {
  if (endpoint) {
    const base = endpoint.replace(/\/$/, "");
    const encoded = encodeURIComponent(key).replace(/%2F/g, "/");
    return forcePathStyle ? `${base}/${bucket}/${encoded}` : `${base}/${encoded}`;
  }
  const encoded = encodeURIComponent(key).replace(/%2F/g, "/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encoded}`;
}

export async function prepareS3ResultStorage({
  storage,
  clientAddress,
  datasetId,
  nodeId,
}) {
  const bucket = requiredString(storage.bucket, "bucket");
  const region = requiredString(storage.region, "region");
  const endpoint = optionalString(storage.endpoint);
  const keyPrefix = normalizeKeyPrefix(storage.key_prefix, bucket);
  const filename = optionalString(storage.filename);
  const filenameForKey = filename || "artifact.zip";
  const contentType = optionalString(storage.content_type) || "application/zip";
  const expiresSeconds = Number(storage.expires_seconds || 3600);
  const forcePathStyle = storage.force_path_style === true;

  const key = storage.object_key
    ? requiredString(storage.object_key, "object_key")
    : buildObjectKey({ keyPrefix, filename: filenameForKey, clientAddress, datasetId, nodeId });

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing AWS credentials in environment: AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY"
    );
  }

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    },
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const getCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const signedPutUrl = await getSignedUrl(client, command, {
    expiresIn: Number.isFinite(expiresSeconds)
      ? Math.max(60, Math.min(86400, Math.floor(expiresSeconds)))
      : 3600,
  });
  const signedGetUrl = await getSignedUrl(client, getCommand, {
    expiresIn: Number.isFinite(expiresSeconds)
      ? Math.max(60, Math.min(86400, Math.floor(expiresSeconds)))
      : 3600,
  });

  const objectUrl = buildObjectUrl({
    bucket,
    region,
    endpoint,
    key,
    forcePathStyle,
  });

  const dockerEnvPatch = {
    RESULT_UPLOAD_URL: signedPutUrl,
    RESULT_DOWNLOAD_URL: signedGetUrl,
    RESULT_UPLOAD_METHOD: "PUT",
    RESULT_UPLOAD_CONTENT_TYPE: contentType,
    RESULT_OBJECT_URL: objectUrl,
  };
  if (filename) {
    dockerEnvPatch.RESULT_FILENAME = filename;
  }

  return {
    resultStorageHint: "s3",
    dockerEnvPatch,
    storageMeta: {
      provider: "s3",
      bucket,
      region,
      key,
      objectUrl,
      downloadUrl: signedGetUrl,
    },
  };
}

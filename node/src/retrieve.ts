import path from "path";
import fs from "fs";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_NAME,
  DB_PASSWORD,
  CURIO_DATA_DIR,
  RETRIEVE_OUTPUT_DIR,
} from "./config.js";
import { logger } from "./logger.js";
import pg from "pg";

const { Client } = pg;

const RESOLVE_SQL = `
  SELECT pp.id AS piece_ref, pp.piece_raw_size
  FROM curio.pdp_data_set_pieces dsp
  JOIN curio.pdp_piecerefs pr ON pr.id = dsp.pdp_pieceref
  JOIN curio.parked_piece_refs pprf ON pprf.ref_id = pr.piece_ref
  JOIN curio.parked_pieces pp ON pp.id = pprf.piece_id
  WHERE dsp.data_set = $1
  LIMIT 1
`;

export interface PreflightResult {
  ok: boolean;
  error?: { code: string; message: string };
}

export interface ResolvedDataset {
  pieceRef: number;
  rawSize: number;
}

/**
 * Resolve dataset_id to piece_ref and raw_size via Yugabyte/Postgres.
 */
export async function resolveDataset(datasetId: number): Promise<ResolvedDataset> {
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    database: DB_NAME,
    password: DB_PASSWORD || undefined,
  });
  try {
    await client.connect();
    const res = await client.query(RESOLVE_SQL, [datasetId]);
    await client.end();
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`No piece found for dataset_id=${datasetId}`);
    }
    const row = res.rows[0] as { piece_ref: number; piece_raw_size: number };
    return { pieceRef: row.piece_ref, rawSize: Number(row.piece_raw_size) };
  } catch (err) {
    try {
      await client.end();
    } catch {
      // ignore
    }
    throw err;
  }
}

/**
 * Resolve dataset, read piece file, write first rawSize bytes to output path. Returns path to the extracted file.
 */
export async function retrieveDatasetFile(datasetId: number): Promise<string> {
  logger.debug("Resolving dataset from DB", { dataset_id: datasetId });
  const { pieceRef, rawSize } = await resolveDataset(datasetId);
  logger.info("Resolved dataset to piece_ref", {
    dataset_id: datasetId,
    piece_ref: pieceRef,
    raw_size: rawSize,
  });

  const piecePath = path.join(CURIO_DATA_DIR, "piece", `s-t00-${pieceRef}`);
  if (!fs.existsSync(piecePath)) {
    throw new Error(`Piece file not found: ${piecePath}`);
  }
  const stat = fs.statSync(piecePath);
  if (stat.size < rawSize) {
    throw new Error(
      `Piece file too small: ${piecePath} has ${stat.size} bytes, need ${rawSize}`
    );
  }

  await fs.promises.mkdir(RETRIEVE_OUTPUT_DIR, { recursive: true });
  const outPath = path.join(RETRIEVE_OUTPUT_DIR, `dataset-${datasetId}.dat`);

  await pipeline(
    createReadStream(piecePath, { start: 0, end: rawSize - 1 }),
    createWriteStream(outPath, { flags: "w" })
  );
  logger.info("Wrote dataset file", {
    dataset_id: datasetId,
    bytes: rawSize,
    output_path: outPath,
  });
  return outPath;
}

/**
 * Preflight: check that we can resolve data (in-process retrieve for dataset_id).
 */
export async function preflightData(datasetId: number): Promise<PreflightResult> {
  try {
    await retrieveDatasetFile(datasetId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      message.includes("No piece found") || message.includes("dataset_id")
        ? "CID_NOT_FOUND"
        : message.includes("not found") || message.includes("too small")
          ? "CID_NOT_FOUND"
          : "UNAVAILABLE";
    logger.warn("Preflight data check failed", {
      dataset_id: datasetId,
      error: message,
    });
    return {
      ok: false,
      error: { code, message },
    };
  }
}

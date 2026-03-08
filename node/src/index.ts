import express, { type Request, type Response } from "express";
import fs from "fs";
import crypto from "crypto";
import { parseDatasetIdFromCid } from "./config.js";
import { preflightData, retrieveDatasetFile } from "./retrieve.js";
import { runDocker, computeCuUsed } from "./docker-runner.js";
import { sendComplete } from "./complete-callback.js";

const app = express();
app.use(express.json());

/**
 * POST /preflight
 * Body: { job_id, cid, compute_requirements [, dataset_id ] }
 * cid may be "dataset:N" for PDP dataset_id.
 */
app.post("/preflight", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const cid = body?.cid;
    const datasetId = parseDatasetIdFromCid(cid) ?? (body?.dataset_id as number | undefined);

    if (datasetId == null) {
      return res.json({
        ok: false,
        error: {
          code: "CID_NOT_FOUND",
          message: "Only dataset:N or dataset_id supported for PDP",
        },
      });
    }

    const result = await preflightData(datasetId);
    return res.json(result);
  } catch (err) {
    console.error("Preflight error:", err);
    return res.status(500).json({
      ok: false,
      error: {
        code: "UNAVAILABLE",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
});

/**
 * POST /start
 * Body: { job_id, attempt_id, cid, compute_requirements, docker, timeout_by }
 * 1. Resolve data (dataset:N or dataset_id) -> file path
 * 2. Run docker with file mounted at /data/input
 * 3. POST Core /jobs/:job_id/complete
 */
app.post("/start", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const {
    job_id,
    attempt_id,
    cid,
    compute_requirements,
    docker,
    timeout_by,
  } = body;

  if (
    !job_id ||
    !attempt_id ||
    !cid ||
    !compute_requirements ||
    !docker ||
    timeout_by == null
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const datasetId = parseDatasetIdFromCid(cid) ?? (body.dataset_id as number | undefined);
  if (datasetId == null) {
    return res.status(400).json({
      error: "Only cid dataset:N or dataset_id supported for PDP",
    });
  }

  res.status(202).json({ accepted: true });

  (async () => {
    try {
      const dataFilePath = await retrieveDatasetFile(datasetId);
      if (!fs.existsSync(dataFilePath)) {
        throw new Error(`Retrieved file not found: ${dataFilePath}`);
      }

      const dockerSpec = docker as Record<string, unknown>;
      const compReq = compute_requirements as Record<string, unknown>;
      const { exitCode, stdout, stderr, wallSeconds, cpuSeconds, memoryMbPeak } =
        await runDocker({
          image: dockerSpec.image as string,
          command: dockerSpec.command as string[] | undefined,
          env: dockerSpec.env as Record<string, string> | undefined,
          workdir: dockerSpec.workdir as string | undefined,
          dataFilePath,
          memoryMb: (compReq.memory_mb as number) || 512,
          cpuCores: (compReq.cpu_cores as number) || 1,
          timeoutBySeconds: timeout_by as number,
        });

      const metrics = { cpuSeconds, wallSeconds, memoryMbPeak };

      if (exitCode === 0) {
        const resultCid =
          "stdout:" +
          crypto.createHash("sha256").update(stdout).digest("hex").slice(0, 16);
        await sendComplete({
          jobId: job_id as string,
          attemptId: attempt_id as string,
          status: "SUCCESS",
          metrics,
          resultCid,
        });
      } else {
        await sendComplete({
          jobId: job_id as string,
          attemptId: attempt_id as string,
          status: "CONTAINER_ERROR",
          metrics,
          error: {
            exitCode,
            message: stderr || stdout || `Exit ${exitCode}`,
            logsTail: (stderr || stdout).slice(-8192),
          },
        });
      }
    } catch (err) {
      console.error("Start/run error:", err);
      try {
        await sendComplete({
          jobId: job_id as string,
          attemptId: attempt_id as string,
          status: "CONTAINER_ERROR",
          metrics: { cpuSeconds: 0, wallSeconds: 0, memoryMbPeak: 0 },
          error: {
            exitCode: -1,
            message: err instanceof Error ? err.message : String(err),
            logsTail: "",
          },
        });
      } catch (e) {
        console.error("Failed to send CONTAINER_ERROR to Core:", e);
      }
    }
  })();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Node agent listening on http://localhost:${port}`);
});

import express, { type Request, type Response } from "express";
import fs from "fs";
import crypto from "crypto";
import { parseDatasetIdFromCid } from "./config.js";
import { preflightData, retrieveDatasetFile } from "./retrieve.js";
import { runDocker, checkDockerAvailable } from "./docker-runner.js";
import { sendComplete } from "./complete-callback.js";
import { uploadOutput } from "./output-upload.js";
import { getOutput } from "./output-store.js";
import { logger } from "./logger.js";

const app = express();
app.use(express.json());

/**
 * POST /preflight
 * Body: { job_id, cid, compute_requirements [, dataset_id ] }
 * cid may be "dataset:N" for PDP dataset_id.
 */
app.post("/preflight", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const jobId = body?.job_id as string | undefined;
  const cid = body?.cid;

  logger.info("Preflight request received", { job_id: jobId, cid });

  try {
    const datasetId = parseDatasetIdFromCid(cid) ?? (body?.dataset_id as number | undefined);

    if (datasetId == null) {
      logger.warn("Preflight rejected: missing or invalid cid/dataset_id", { job_id: jobId });
      return res.json({
        ok: false,
        error: {
          code: "CID_NOT_FOUND",
          message: "Only dataset:N or dataset_id supported for PDP",
        },
      });
    }

    logger.info("Checking Docker availability", { job_id: jobId });
    const dockerCheck = await checkDockerAvailable().then(
      () => null,
      (err) => ({ code: "UNAVAILABLE" as const, message: err instanceof Error ? err.message : String(err) })
    );
    if (dockerCheck) {
      logger.warn("Preflight failed: Docker not available", { job_id: jobId, error: dockerCheck.message });
      return res.json({ ok: false, error: dockerCheck });
    }
    logger.info("Docker check passed", { job_id: jobId });

    logger.info("Preflight: checking data availability", { job_id: jobId, dataset_id: datasetId });
    const result = await preflightData(datasetId);
    if (result.ok) {
      logger.info("Preflight succeeded", { job_id: jobId, dataset_id: datasetId });
    } else {
      logger.warn("Preflight failed: data not found", { job_id: jobId, dataset_id: datasetId, error: result.error?.code });
    }
    return res.json(result);
  } catch (err) {
    logger.error("Preflight error", { job_id: jobId, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({
      ok: false,
      error: {
        code: "UNAVAILABLE",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
});

// client (code) -> core api ( almost there ) -> node api -> core api -> client  

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
    logger.warn("Start rejected: missing required fields", { job_id: body.job_id });
    return res.status(400).json({ error: "Missing required fields" });
  }

  const datasetId = parseDatasetIdFromCid(cid) ?? (body.dataset_id as number | undefined);
  if (datasetId == null) {
    logger.warn("Start rejected: cid/dataset_id not supported", { job_id: job_id });
    return res.status(400).json({
      error: "Only cid dataset:N or dataset_id supported for PDP",
    });
  }

  logger.info("Start accepted, running job asynchronously", {
    job_id: job_id,
    attempt_id: attempt_id,
    dataset_id: datasetId,
    image: (docker as Record<string, unknown>)?.image,
  });
  res.status(202).json({ accepted: true });

  (async () => {
    const jobId = job_id as string;
    const attemptId = attempt_id as string;
    try {
      logger.info("Retrieving dataset file", { job_id: jobId, attempt_id: attemptId, dataset_id: datasetId });
      const dataFilePath = await retrieveDatasetFile(datasetId);
      if (!fs.existsSync(dataFilePath)) {
        throw new Error(`Retrieved file not found: ${dataFilePath}`);
      }
      logger.info("Dataset file ready", { job_id: jobId, attempt_id: attemptId, data_file: dataFilePath });

      const dockerSpec = docker as Record<string, unknown>;
      const compReq = compute_requirements as Record<string, unknown>;
      const image = dockerSpec.image as string;
      logger.info("Starting Docker container", {
        job_id: jobId,
        attempt_id: attemptId,
        image,
        memory_mb: (compReq.memory_mb as number) || 512,
        cpu_cores: (compReq.cpu_cores as number) || 1,
        timeout_by,
      });
      const { exitCode, stdout, stderr, wallSeconds, cpuSeconds, memoryMbPeak } =
        await runDocker({
          image,
          command: dockerSpec.command as string[] | undefined,
          env: dockerSpec.env as Record<string, string> | undefined,
          workdir: dockerSpec.workdir as string | undefined,
          dataFilePath,
          memoryMb: (compReq.memory_mb as number) || 512,
          cpuCores: (compReq.cpu_cores as number) || 1,
          timeoutBySeconds: timeout_by as number,
        });

      const metrics = { cpuSeconds, wallSeconds, memoryMbPeak };
      logger.info("Docker container finished", {
        job_id: jobId,
        attempt_id: attemptId,
        exit_code: exitCode,
        wall_seconds: wallSeconds.toFixed(2),
      });

      if (exitCode === 0) {
        const resultCid =
          "stdout:" +
          crypto.createHash("sha256").update(stdout).digest("hex").slice(0, 16);
        const uploadResult = await uploadOutput(jobId, stdout, stderr);
        logger.info("Sending SUCCESS to Core", {
          job_id: jobId,
          attempt_id: attemptId,
          result_cid: resultCid,
          result_url: uploadResult?.url,
        });
        await sendComplete({
          jobId,
          attemptId,
          status: "SUCCESS",
          metrics,
          resultCid,
          resultUrl: uploadResult?.url,
        });
        logger.info("Job completed successfully", { job_id: jobId, attempt_id: attemptId });
      } else {
        logger.warn("Container exited with error, sending CONTAINER_ERROR to Core", {
          job_id: jobId,
          attempt_id: attemptId,
          exit_code: exitCode,
        });
        await sendComplete({
          jobId,
          attemptId,
          status: "CONTAINER_ERROR",
          metrics,
          error: {
            exitCode,
            message: stderr || stdout || `Exit ${exitCode}`,
            logsTail: (stderr || stdout).slice(-8192),
          },
        });
        logger.info("Job reported as CONTAINER_ERROR", { job_id: jobId, attempt_id: attemptId });
      }
    } catch (err) {
      logger.error("Start/run error", {
        job_id: jobId,
        attempt_id: attemptId,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await sendComplete({
          jobId,
          attemptId,
          status: "CONTAINER_ERROR",
          metrics: { cpuSeconds: 0, wallSeconds: 0, memoryMbPeak: 0 },
          error: {
            exitCode: -1,
            message: err instanceof Error ? err.message : String(err),
            logsTail: "",
          },
        });
        logger.info("Sent CONTAINER_ERROR to Core after run failure", { job_id: jobId, attempt_id: attemptId });
      } catch (e) {
        logger.error("Failed to send CONTAINER_ERROR to Core", {
          job_id: jobId,
          attempt_id: attemptId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  })();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/** GET /output/:job_id — serve stored job stdout (when OUTPUT_UPLOAD_BACKEND=self) */
app.get("/output/:job_id", (req: Request, res: Response) => {
  const jobId = req.params.job_id;
  const entry = getOutput(jobId);
  if (!entry) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Job output not found or expired" });
  }
  res.type("text/plain").send(entry.stdout);
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  logger.info("Node agent started", { port, url: `http://localhost:${port}` });
});

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { CU_WEIGHTS, DOCKER_BIN, DOCKER_NETWORK } from "./config.js";
import { logger } from "./logger.js";

const DATA_MOUNT_PATH = "/data/input";

/**
 * Check that Docker is installed and runnable (for preflight).
 * Resolves if `docker --version` succeeds; rejects with message otherwise.
 */
export function checkDockerAvailable(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(DOCKER_BIN, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Docker exited ${code}: ${stderr || "no output"}`));
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Docker not found. Install Docker or set DOCKER_BIN to the full path (e.g. DOCKER_BIN=/usr/bin/docker).`
          )
        );
      } else {
        reject(err);
      }
    });
  });
}

export interface RunDockerOpts {
  image: string;
  command?: string[];
  env?: Record<string, string>;
  workdir?: string;
  dataFilePath: string;
  /** Optional host path to mount at /data/output (writable). Job can write artifacts (e.g. model.zip) here. */
  outputDir?: string;
  memoryMb: number;
  cpuCores: number;
  timeoutBySeconds: number;
}

export interface RunDockerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  wallSeconds: number;
  cpuSeconds: number;
  memoryMbPeak: number;
}

export interface CuMetrics {
  cpuSeconds: number;
  wallSeconds: number;
  memoryMbPeak: number;
}

/**
 * Run docker with data file mounted at /data/input (read-only).
 * Enforces memory, cpus, and wall timeout.
 */
export function runDocker(opts: RunDockerOpts): Promise<RunDockerResult> {
  const {
    image,
    command = [],
    env = {},
    workdir,
    dataFilePath,
    outputDir,
    memoryMb,
    cpuCores,
    timeoutBySeconds,
  } = opts;

  if (!dataFilePath || !fs.existsSync(dataFilePath)) {
    return Promise.reject(new Error(`Data file not found: ${dataFilePath}`));
  }

  logger.debug("Spawning Docker run", {
    image,
    data_file: dataFilePath,
    memory_mb: memoryMb,
    cpus: cpuCores,
    timeout_seconds: timeoutBySeconds,
  });

  const args = [
    "run",
    "--rm",
    "-v",
    `${path.resolve(dataFilePath)}:${DATA_MOUNT_PATH}:ro`,
    "--memory",
    `${memoryMb}m`,
    "--cpus",
    String(Math.max(0.01, cpuCores)),
    "--network",
    DOCKER_NETWORK,
  ];
  if (outputDir) {
    args.push("-v", `${path.resolve(outputDir)}:/data/output`);
  }

  for (const [k, v] of Object.entries(env)) {
    args.push("-e", `${k}=${v}`);
  }
  if (workdir) {
    args.push("-w", workdir);
  }
  args.push(image);
  args.push(
    ...(Array.isArray(command) && command.length ? command : ["sh", "-c", "cat /data/input"])
  );

  return new Promise((resolve, reject) => {
    const startWall = Date.now();
    const proc = spawn(DOCKER_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const maxCapture = 32 * 1024;
    const tail = (buf: Buffer | string, str: string): string => {
      const s = str + buf;
      return s.length > maxCapture ? s.slice(-maxCapture) : s;
    };
    proc.stdout?.on("data", (d: Buffer) => {
      stdout = tail(d, stdout);
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr = tail(d, stderr);
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
    }, timeoutBySeconds * 1000);

    proc.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      const wallSeconds = (Date.now() - startWall) / 1000;
      const cpuSeconds = wallSeconds * Math.min(cpuCores, 1);
      const memoryMbPeak = memoryMb;
      const finalExitCode = exitCode ?? (signal === "SIGKILL" ? 137 : 1);
      logger.debug("Docker process closed", {
        exit_code: finalExitCode,
        signal: signal ?? undefined,
        wall_seconds: wallSeconds.toFixed(2),
      });
      resolve({
        exitCode: finalExitCode,
        stdout,
        stderr,
        wallSeconds,
        cpuSeconds,
        memoryMbPeak,
      });
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Docker not found (ENOENT). Install Docker or set DOCKER_BIN to the full path (e.g. DOCKER_BIN=/usr/bin/docker). Current: ${DOCKER_BIN}`
          )
        );
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Compute CU used from metrics (v0 formula).
 */
export function computeCuUsed(metrics: CuMetrics): number {
  const { cpu_weight, mem_weight } = CU_WEIGHTS;
  const cpuCu = metrics.cpuSeconds * cpu_weight;
  const memCu = metrics.memoryMbPeak * metrics.wallSeconds * mem_weight;
  return cpuCu + memCu;
}

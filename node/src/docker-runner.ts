import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { CU_WEIGHTS } from "./config.js";

const DATA_MOUNT_PATH = "/data/input";

export interface RunDockerOpts {
  image: string;
  command?: string[];
  env?: Record<string, string>;
  workdir?: string;
  dataFilePath: string;
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
    memoryMb,
    cpuCores,
    timeoutBySeconds,
  } = opts;

  if (!dataFilePath || !fs.existsSync(dataFilePath)) {
    return Promise.reject(new Error(`Data file not found: ${dataFilePath}`));
  }

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
    "none",
  ];

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
    const proc = spawn("docker", args, {
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
      resolve({
        exitCode: exitCode ?? (signal === "SIGKILL" ? 137 : 1),
        stdout,
        stderr,
        wallSeconds,
        cpuSeconds,
        memoryMbPeak,
      });
    });
    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
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

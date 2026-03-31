import { readFileSync } from "fs";
import { Command } from "commander";
import yaml from "js-yaml";
import { CORE_URL, getAddressFromPrivateKey, getBalanceFromCore } from "./config.mjs";
import { prepareResultStorage } from "./storage/index.mjs";

function runCmd() {
  const cmd = new Command("run")
    .description("Submit job from YAML file; checks balance before submit")
    .requiredOption("--compute-provider <id>", "Compute node id (e.g. node-001)")
    .requiredOption("--dataset-id <id>", "Dataset id (cid = dataset:<id>)")
    .requiredOption("--job-file <path>", "Path to docker-compute-job.yaml")
    .option("--private-key <key>", "Ethereum private key (derives client_address)")
    .option("--client-address <0x...|default>", "Override client address (for e2e with memory escrow use 'default')")
    .option("--result-storage <pdp-provider|s3>", "Hint for result storage")
    .option("--core-url <url>", "Core API URL", CORE_URL)
    .action(async (opts) => {
      if (!opts.privateKey && !opts.clientAddress) {
        console.error("Error: provide --private-key or --client-address");
        process.exit(1);
      }
      const clientAddress = opts.clientAddress || await getAddressFromPrivateKey(opts.privateKey);

      const coreUrl = (opts.coreUrl || CORE_URL).replace(/\/$/, "");
      let jobSpec;
      try {
        jobSpec = yaml.load(readFileSync(opts.jobFile, "utf-8"));
      } catch (e) {
        console.error("Error reading job file:", e.message);
        process.exit(1);
      }
      if (!jobSpec || typeof jobSpec !== "object") {
        console.error("Error: job file must be a YAML object");
        process.exit(1);
      }
      const maxCostCu = Number(jobSpec.max_cost_cu ?? 100);
      const computeRequirements = jobSpec.compute_requirements ?? { cpu_cores: 1, memory_mb: 512 };
      const docker = jobSpec.docker ?? { image: "alpine:3.18", command: ["echo", "done"] };
      const timeoutBy = Number(jobSpec.timeout_by ?? 120);
      if (!docker.image) {
        console.error("Error: job file must have docker.image");
        process.exit(1);
      }
      let resultStorageHint;
      try {
        const prepared = await prepareResultStorage({
          jobSpec,
          clientAddress,
          datasetId: opts.datasetId,
          nodeId: opts.computeProvider,
        });
        if (prepared && prepared.dockerEnvPatch && Object.keys(prepared.dockerEnvPatch).length > 0) {
          docker.env = { ...(docker.env || {}), ...prepared.dockerEnvPatch };
        }
        resultStorageHint = prepared ? prepared.resultStorageHint : undefined;
        if (prepared && prepared.storageMeta && prepared.storageMeta.provider === "s3") {
          console.log("Prepared S3 upload target:", prepared.storageMeta.objectUrl || prepared.storageMeta.key);
        }
      } catch (e) {
        console.error("Storage preparation failed:", e.message || e);
        process.exit(1);
      }

      const balance = await getBalanceFromCore(coreUrl, clientAddress).catch((e) => {
        console.error("Balance check failed:", e.message);
        process.exit(1);
      });
      if (balance < maxCostCu) {
        console.error(`Error: insufficient balance. Have ${balance} CU, need ${maxCostCu} CU for max_cost_cu. Deposit more with: fil-compute escrow deposit --amount <cu> --private-key <key>`);
        process.exit(1);
      }

      const body = {
        nodeid: opts.computeProvider,
        cid: `dataset:${opts.datasetId}`,
        client_address: clientAddress,
        compute_requirements: computeRequirements,
        docker,
        timeout_by: timeoutBy,
        max_cost_cu: maxCostCu,
      };
      if (opts.resultStorage) body.result_storage = opts.resultStorage;
      else if (resultStorageHint) body.result_storage = resultStorageHint;

      const submitRes = await fetch(`${coreUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!submitRes.ok) {
        const t = await submitRes.text();
        console.error("Submit failed:", submitRes.status, t);
        process.exit(1);
      }
      const submitJson = await submitRes.json();
      const jobId = submitJson.job_id;
      if (!jobId) {
        console.error("No job_id in response");
        process.exit(1);
      }
      console.log("Job submitted:", jobId);
      const maxPoll = 120;
      const pollInterval = 2000;
      for (let i = 0; i < maxPoll; i++) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const r = await fetch(`${coreUrl}/jobs/${jobId}`);
        if (!r.ok) {
          console.error("GET job failed:", r.status);
          process.exit(1);
        }
        const job = await r.json();
        if (job.status === "SUCCEEDED" || job.status === "FAILED_CONTAINER" || job.status === "FAILED_NODE" || job.status === "FAILED_PREFLIGHT") {
          console.log("Job ended:", job.status);
          if (job.result_cid) console.log("result_cid:", job.result_cid);
          if (job.result_url) console.log("result_url:", job.result_url);
          if (job.status !== "SUCCEEDED") process.exit(1);
          return;
        }
      }
      console.error("Job did not complete in time");
      process.exit(1);
    });
  return cmd;
}

export { runCmd };

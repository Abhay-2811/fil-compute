import "dotenv/config";
import express from "express";
import jobsRouter from "./routes/jobs.js";
import { logger } from "./logger.js";

const app = express();
app.use(express.json());

// Request logging (method, path, status, duration)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("Request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
    });
  });
  next();
});

app.use("/jobs", jobsRouter);

/** GET /config — public escrow config for clients (RPC URL, contract address). Core is source of truth. */
app.get("/config", (_req, res) => {
  const rpc = process.env.ESCROW_RPC_URL ?? "";
  const contract = process.env.ESCROW_CONTRACT_ADDRESS ?? "";
  const cuToWei = Number(process.env.ESCROW_CU_TO_WEI) || 1e12;
  res.json({
    escrow_rpc_url: rpc || undefined,
    escrow_contract_address: contract || undefined,
    escrow_cu_to_wei: rpc && contract ? cuToWei : undefined,
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  logger.info("Core API started", { port, url: `http://localhost:${port}` });
});

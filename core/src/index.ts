import express from "express";
import jobsRouter from "./routes/jobs.js";

const app = express();
app.use(express.json());

app.use("/jobs", jobsRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Core API listening on http://localhost:${port}`);
});

import express from "express";
import generateRouter from "./routes/generate";
import audioRouter from "./routes/audio";
import queueRouter from "./routes/queue";
import evaluateRouter from "./routes/evaluate";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "aura-x-api",
    version: "0.1.0",
    mode: process.env.NODE_ENV ?? "development",
  });
});

app.use("/api/generate", generateRouter);
app.use("/api/audio", audioRouter);
app.use("/api/queue", queueRouter);
app.use("/api/evaluate", evaluateRouter);

// Start BullMQ workers (side-effect import — only in server process)
if (require.main === module) {
  require("./queue/workers");
}

const PORT = parseInt(process.env.PORT_API ?? "3002", 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AURA X API running on http://localhost:${PORT}`);
  });
}

export default app;

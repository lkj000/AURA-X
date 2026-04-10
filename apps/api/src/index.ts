import express from "express";
import generateRouter from "./routes/generate";
import audioRouter from "./routes/audio";

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

const PORT = parseInt(process.env.PORT_API ?? "3002", 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AURA X API running on http://localhost:${PORT}`);
  });
}

export default app;

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { globalLimiter, authLimiter, generationLimiter, evaluateLimiter } from "./middleware/rateLimit";
import { httpsRedirect, securityHeaders } from "./middleware/security";
import generateRouter from "./routes/generate";
import audioRouter from "./routes/audio";
import queueRouter from "./routes/queue";
import evaluateRouter from "./routes/evaluate";
import agentRouter from "./routes/agent";
import videoRouter from "./routes/video";
import feedbackRouter from "./routes/feedback";
import authRouter from "./routes/auth";
import tracksRouter from "./routes/tracks";
import licensingRouter from "./routes/licensing";
import royaltiesRouter from "./routes/royalties";
import marketplaceRouter from "./routes/marketplace";
import earningsRouter from "./routes/earnings";
import amapianorizeRouter from "./routes/amapianorize";
import engineRouter from "./routes/engine";
import djRouter from "./routes/dj";
import mutationRouter from "./routes/mutation";
import { trackValidateRouter, validateRouter } from "./routes/validate";

const app = express();

// Trust Railway's reverse proxy so X-Forwarded-Proto / X-Forwarded-For are correct
app.set("trust proxy", 1);

app.use(httpsRedirect);
app.use(securityHeaders);

// CORS — allow the web app and any localhost port in dev
const allowedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  const allowed =
    allowedOrigins.includes(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

app.use(express.json());
app.use(globalLimiter);

app.get("/", (_req, res) => {
  res.json({
    service: "aura-x-api",
    version: "4.0.0",
    endpoints: ["/health", "/api/generate", "/api/audio", "/api/queue", "/api/evaluate", "/api/agent", "/api/video", "/api/feedback", "/api/auth", "/api/tracks", "/api/licensing", "/api/royalties", "/api/marketplace", "/api/earnings", "/api/amapianorize", "/api/engine", "/api/dj"],
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "aura-x-api",
    version: "4.0.0",
    mode: process.env.NODE_ENV ?? "development",
    phase: "P4-COMPLETE",
  });
});

app.use("/api/generate", generationLimiter, generateRouter);
app.use("/api/audio", audioRouter);
app.use("/api/queue", queueRouter);
app.use("/api/evaluate", evaluateLimiter, evaluateRouter);
app.use("/api/agent", agentRouter);
app.use("/api/video", videoRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/tracks", tracksRouter);
app.use("/api/licensing", licensingRouter);
app.use("/api/royalties", royaltiesRouter);
app.use("/api/marketplace", marketplaceRouter);
app.use("/api/earnings", earningsRouter);
app.use("/api/amapianorize", amapianorizeRouter);
app.use("/api/engine", engineRouter);
app.use("/api/dj", djRouter);
app.use("/api/tracks", mutationRouter);
app.use("/api/tracks", trackValidateRouter);
app.use("/api/validate", validateRouter);

// Start BullMQ workers (side-effect import — only in server process)
if (require.main === module) {
  require("./queue/workers");
}

const PORT = parseInt(process.env.PORT ?? process.env.PORT_API ?? "3002", 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AURA X API running on http://localhost:${PORT}`);
  });
}

export default app;

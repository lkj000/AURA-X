import { Router } from "express";
import { metricsCollector } from "../lib/metricsCollector";

const router = Router();

// GET /api/engine/metrics?limit=N  — pipeline observability snapshot
router.get("/metrics", (req, res) => {
  const parsed = parseInt(String(req.query.limit ?? "10"), 10);
  const limit  = Math.min(100, Math.max(1, isNaN(parsed) ? 10 : parsed));
  res.json(metricsCollector.snapshot(limit));
});

// POST /api/engine/metrics/reset  — clear all recorded metrics
router.post("/metrics/reset", (_req, res) => {
  metricsCollector.reset();
  res.status(204).end();
});

export default router;

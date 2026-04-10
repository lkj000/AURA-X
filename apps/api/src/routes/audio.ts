import { Router, Request, Response } from "express";

const router = Router();

// POST /api/audio/upload — Audio ingestion (Phase 01 Job 06)
router.post("/upload", (_req: Request, res: Response) => {
  res.status(501).json({ status: "not_implemented", message: "Audio ingestion — Job 06" });
});

export default router;

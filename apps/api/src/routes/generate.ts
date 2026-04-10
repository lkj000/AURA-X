import { Router, Request, Response } from "express";

const router = Router();

// POST /api/generate — Mode 1/2/3 generation (Phase 03)
router.post("/", (_req: Request, res: Response) => {
  res.status(501).json({ status: "not_implemented", message: "Generation pipeline — Phase 03" });
});

export default router;

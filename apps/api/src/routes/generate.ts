import { Router, Request, Response } from "express";
import { exportForSuno } from "@aura-x/suno-exporter";
import { CTLv1Schema } from "@aura-x/ctl";

const router = Router();

// POST /api/generate/suno — Mode 1: CTL → Suno style + lyrics prompts
router.post("/suno", (req: Request, res: Response): void => {
  const parsed = CTLv1Schema.safeParse(req.body.ctl);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid CTL", issues: parsed.error.issues });
    return;
  }
  const bundle = exportForSuno(parsed.data);
  res.json(bundle);
});

// POST /api/generate — Mode router placeholder (Mode 2/3 — Phase 03)
router.post("/", (_req: Request, res: Response): void => {
  res.status(501).json({
    status: "not_implemented",
    message: "Mode 2 (MusicGen) and Mode 3 (Suno API) — Phase 03",
  });
});

export default router;

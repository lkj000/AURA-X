import { Router, Request, Response } from "express";
import { CTLv1Schema } from "@aura-x/ctl";
import { runGeneration } from "../generation/generationAgent";
import { getGenerationStatus, getGenerationsByTrack } from "../generation/generationStatus";

const router = Router();

// POST /api/generate
// Body: { track_id, ctl_id, ctl, mode_override? }
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { track_id, ctl_id, mode_override } = req.body;

  if (!track_id || !ctl_id) {
    res.status(400).json({ error: "track_id and ctl_id are required" });
    return;
  }

  const parsed = CTLv1Schema.safeParse(req.body.ctl);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid CTL", issues: parsed.error.issues });
    return;
  }

  const result = await runGeneration({
    track_id,
    ctl_id,
    ctl: parsed.data,
    mode_override,
  });

  const statusCode =
    result.status === "failed"       ? 500
  : result.status === "incompatible" ? 422
  : 200;
  res.status(statusCode).json(result);
});

// POST /api/generate/suno (Mode 1 direct — backward compat)
router.post("/suno", (req: Request, res: Response): void => {
  const parsed = CTLv1Schema.safeParse(req.body.ctl);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid CTL", issues: parsed.error.issues });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { exportForSuno } = require("@aura-x/suno-exporter");
  const bundle = exportForSuno(parsed.data);
  res.json(bundle);
});

// GET /api/generate/status/:generationId
router.get(
  "/status/:generationId",
  async (req: Request, res: Response): Promise<void> => {
    const { generationId } = req.params;
    const status = await getGenerationStatus(generationId);
    if (!status) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }
    res.json(status);
  }
);

// GET /api/generate/track/:trackId
// Returns all generations for a track (history)
router.get(
  "/track/:trackId",
  async (req: Request, res: Response): Promise<void> => {
    const { trackId } = req.params;
    const generations = await getGenerationsByTrack(trackId);
    res.json({ track_id: trackId, generations, count: generations.length });
  }
);

export default router;

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { analyzeAndPlan, buildEnhancement } from "@aura-x/engine";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB — DJ extended mixes can be large WAVs
});

// POST /api/amapianorize
router.post(
  "/",
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("audio")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large — maximum 100 MB. For long mixes, trim to the first 3–5 minutes before uploading." });
        } else {
          res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        return;
      }
      if (err) { next(err); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "audio file required (multipart field: audio)" });
      return;
    }

    const mime = req.file.mimetype;
    if (!mime.startsWith("audio/") && mime !== "application/octet-stream") {
      res.status(400).json({ error: "uploaded file must be an audio file" });
      return;
    }

    try {
      const plan        = analyzeAndPlan(req.file.buffer, "audio analysis", "amapianorize");
      const enhancement = buildEnhancement(plan.evaluation);

      const ev = plan.evaluation;
      const gr = plan.gateReport;

      res.json({
        evaluation: {
          authenticity:          ev.laneScores.overallAuthenticity,
          laneConfidence:        ev.laneScores.laneConfidence,
          producerScore:         ev.quality.producerScore,
          culturalAlignment:     ev.cultural.alignmentScore,
          harmonicCompatibility: ev.harmonic?.amapianoCompatibility ?? 0,
          groovePocket:          ev.groove?.pocketScore ?? 0,
          grooveDensity:         ev.groove?.density ?? 0,
          // metadata (non-score fields — filtered by UI)
          lane:      ev.laneScores.bestFitLane,
          bpm:       ev.features.bpm,
          threshold: ev.threshold,
          issues:    ev.issues,
        },
        enhancement,
        ctl:   plan.ctl,
        gates: {
          b_eff:             gr.perceptionGate.passes,
          transient_density: gr.authenticityGate.passes,
          groove_clarity:    gr.culturalGate.passes,
          all_pass:          gr.allPass,
          bEff_value:        gr.perceptionGate.bEff,
          authenticity_score: gr.authenticityGate.score,
          cultural_score:    gr.culturalGate.alignmentScore,
          violations:        gr.perceptionGate.violations,
        },
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("WAV") || msg.includes("RIFF") || msg.includes("valid")) {
        res.status(422).json({
          error: `Audio analysis failed: ${msg}. WAV format required — convert MP3/FLAC to WAV before uploading.`,
        });
      } else {
        res.status(500).json({ error: `Analysis error: ${msg}` });
      }
    }
  }
);

export default router;

import { Router, Request, Response } from "express";
import multer from "multer";
import { analyzeAndPlan, buildEnhancement } from "@aura-x/engine";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// POST /api/amapianorize
// Accepts an uploaded WAV file, evaluates it against the 4-lane Amapiano
// engine model, and returns evaluation scores + enhancement CTL plan.
// Content-Type: multipart/form-data  field: audio
router.post(
  "/",
  upload.single("audio"),
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
      res.json({
        evaluation:  plan.evaluation,
        enhancement,
        ctl:         plan.ctl,
        gates:       plan.gateReport,
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

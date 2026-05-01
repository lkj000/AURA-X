import { Router, Request, Response } from "express";
import multer from "multer";
import { extractAudioFeatures, evaluateAmapiano, buildEnhancement } from "../lib/audio-analysis";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// POST /api/amapianorize
// Accepts an uploaded audio file (WAV), evaluates it against the 4-lane
// Amapiano model, and returns evaluation scores + enhancement CTL.
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
      const features   = extractAudioFeatures(req.file.buffer);
      const evaluation = evaluateAmapiano(features);
      const enhancement = buildEnhancement(evaluation);
      res.json({ evaluation, enhancement });
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

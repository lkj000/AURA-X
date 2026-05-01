import { Router, Request, Response } from "express";
import multer from "multer";
import { evaluateBuffer, buildEnhancement } from "@aura-x/engine";

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
      const evaluation = evaluateBuffer(req.file.buffer);
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

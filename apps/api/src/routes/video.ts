import { Router, Request, Response } from "express";
import { runVideoGeneration, buildVisualPrompt } from "../generation/videoAgent";
import { mergeVideoAudio, mergeVideoAudioBuffer } from "../generation/videoMerge";
import { supabase } from "../lib/supabase";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── POST /api/video/generate ─────────────────────────────────────────────────
// Generate a music video for an existing track/generation using Seedance 2.0
//
// Body: { track_id, generation_id, subgenre, bpm, key, emotional_profile, title,
//         duration?: 5|10, resolution?: "480p"|"720p"|"1080p" }
//
router.post("/generate", async (req: Request, res: Response): Promise<void> => {
  const {
    track_id, generation_id, subgenre, bpm, key,
    emotional_profile, title, duration, resolution,
  } = req.body;

  if (!track_id || !generation_id || !subgenre || !bpm || !key || !emotional_profile || !title) {
    res.status(400).json({
      error: "Required: track_id, generation_id, subgenre, bpm, key, emotional_profile, title",
    });
    return;
  }

  try {
    const result = await runVideoGeneration({
      track_id,
      generation_id,
      subgenre,
      bpm: Number(bpm),
      key,
      emotional_profile,
      title,
      duration,
      resolution,
    });

    console.log(`[video] result:`, JSON.stringify(result));

    if (result.status === "failed") {
      res.status(502).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Video generation failed";
    console.error(`[video] unhandled error:`, msg);
    res.status(500).json({ error: msg });
  }
});

// ─── GET /api/video/prompt-preview ───────────────────────────────────────────
// Preview the visual prompt that would be generated for given CTL params
// Useful for the UI to show what Seedance will receive before committing
//
router.get("/prompt-preview", (req: Request, res: Response): void => {
  const { subgenre, bpm, key, emotional_profile, title } = req.query as Record<string, string>;

  if (!subgenre || !bpm || !key || !emotional_profile || !title) {
    res.status(400).json({
      error: "Required query params: subgenre, bpm, key, emotional_profile, title",
    });
    return;
  }

  const prompt = buildVisualPrompt({
    subgenre,
    bpm: Number(bpm),
    key,
    emotional_profile,
    title,
  });

  res.json({ visual_prompt: prompt });
});

// ─── POST /api/video/merge ────────────────────────────────────────────────────
// Merges a Seedance video (no audio) with an uploaded audio file.
// Accepts multipart/form-data: video_url (string) + audio (file).
// Streams the merged MP4 back directly.
//
router.post(
  "/merge",
  upload.single("audio"),
  async (req: Request, res: Response): Promise<void> => {
    const { video_url } = req.body;
    const audioFile = req.file;

    if (!video_url || !audioFile) {
      res.status(400).json({ error: "Required: video_url (field) + audio (file)" });
      return;
    }

    try {
      const merged = await mergeVideoAudioBuffer(video_url, audioFile.buffer, audioFile.originalname);

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="aura-x-merged.mp4"');
      res.setHeader("Content-Length", merged.length);
      res.send(merged);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Merge failed";
      console.error("[merge] error:", msg);
      res.status(500).json({ error: msg });
    }
  }
);

// ─── GET /api/video/:videoId ──────────────────────────────────────────────────
router.get("/:videoId", async (req: Request, res: Response): Promise<void> => {
  const { videoId } = req.params;

  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  res.json(data);
});

export default router;

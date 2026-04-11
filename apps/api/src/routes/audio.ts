import { Router, Request, Response } from "express";
import multer from "multer";
import FormData from "form-data";
import axios from "axios";
import { enqueueAudioAnalysis } from "../queue";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const AUDIO_SERVICE_URL = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";

// POST /api/audio/upload — proxy multipart upload to Python audio service
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const { track_id, generation_id, file_type } = req.body as {
      track_id?: string;
      generation_id?: string;
      file_type?: string;
    };
    if (!track_id) {
      res.status(400).json({ error: "track_id is required" });
      return;
    }

    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    form.append("track_id", track_id);
    if (generation_id) form.append("generation_id", generation_id);
    if (file_type) form.append("file_type", file_type);

    try {
      const response = await axios.post(`${AUDIO_SERVICE_URL}/audio/upload`, form, {
        headers: form.getHeaders(),
      });
      const audioData = response.data;

      // Fire-and-forget: enqueue analysis job (non-blocking)
      enqueueAudioAnalysis({
        audio_file_id: audioData.audio_file_id,
        track_id: audioData.track_id ?? track_id,
        storage_path: audioData.storage_path ?? "",
        format: audioData.format ?? "wav",
      }).catch((err: unknown) => {
        console.error("[queue] Failed to enqueue analysis:", (err as Error).message);
      });

      res.json(audioData);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// POST /api/audio/log-drum/extract — proxy to Python audio service
router.post(
  "/log-drum/extract",
  async (req: Request, res: Response): Promise<void> => {
    const { audio_file_id, track_id, generation_id } = req.body as {
      audio_file_id?: string;
      track_id?: string;
      generation_id?: string;
    };
    if (!audio_file_id || !track_id) {
      res.status(400).json({ error: "audio_file_id and track_id are required" });
      return;
    }
    try {
      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/log-drum/extract`,
        { audio_file_id, track_id, generation_id },
        { timeout: 120000 }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// POST /api/audio/mix/render — proxy to Python audio service
router.post(
  "/mix/render",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/mix/render`,
        req.body,
        { headers: { "Content-Type": "application/json" }, timeout: 300000 }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// GET /api/audio/mix/presets
router.get(
  "/mix/presets",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.get(`${AUDIO_SERVICE_URL}/mix/presets`);
      res.json(response.data);
    } catch (err: unknown) {
      res.status(500).json({ error: "Audio service error" });
    }
  }
);

// POST /api/audio/master/render
router.post(
  "/master/render",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/master/render`,
        req.body,
        { headers: { "Content-Type": "application/json" }, timeout: 300000 }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// GET /api/audio/master/targets
router.get(
  "/master/targets",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.get(`${AUDIO_SERVICE_URL}/master/targets`);
      res.json(response.data);
    } catch (err: unknown) {
      res.status(500).json({ error: "Audio service error" });
    }
  }
);

// POST /api/audio/render/full
router.post(
  "/render/full",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/render/full`,
        req.body,
        { headers: { "Content-Type": "application/json" }, timeout: 600000 }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// GET /api/audio/render/status
router.get(
  "/render/status",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.get(`${AUDIO_SERVICE_URL}/render/status`);
      res.json(response.data);
    } catch (err: unknown) {
      res.status(500).json({ error: "Audio service error" });
    }
  }
);

// POST /api/audio/analysis/analyze
router.post(
  "/analysis/analyze",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/analysis/analyze`,
        req.body,
        { headers: { "Content-Type": "application/json" }, timeout: 120000 }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// GET /api/audio/analysis/status
router.get(
  "/analysis/status",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.get(`${AUDIO_SERVICE_URL}/analysis/status`);
      res.json(response.data);
    } catch {
      res.status(500).json({ error: "Audio service error" });
    }
  }
);

// POST /api/audio/dj/render
router.post(
  "/dj/render",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/dj/render`,
        req.body,
        { headers: { "Content-Type": "application/json" }, timeout: 600000 }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// GET /api/audio/dj/status
router.get(
  "/dj/status",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.get(`${AUDIO_SERVICE_URL}/dj/status`);
      res.json(response.data);
    } catch (err: unknown) {
      res.status(500).json({ error: "Audio service error" });
    }
  }
);

// POST /api/audio/amapianorize/analyze
router.post(
  "/amapianorize/analyze",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.post(
        `${AUDIO_SERVICE_URL}/amapianorize/analyze`,
        req.body,
        { headers: { "Content-Type": "application/json" }, timeout: 120000 }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

// GET /api/audio/amapianorize/status
router.get(
  "/amapianorize/status",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const response = await axios.get(`${AUDIO_SERVICE_URL}/amapianorize/status`);
      res.json(response.data);
    } catch {
      res.status(500).json({ error: "Audio service error" });
    }
  }
);

// GET /api/audio/signed-url/:audioFileId
router.get(
  "/signed-url/:audioFileId",
  async (req: Request, res: Response): Promise<void> => {
    const { audioFileId } = req.params;
    const expiresIn = req.query.expires_in ?? 3600;
    try {
      const response = await axios.get(
        `${AUDIO_SERVICE_URL}/audio/signed-url/${audioFileId}`,
        { params: { expires_in: expiresIn } }
      );
      res.json(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        res.status(err.response?.status ?? 500).json(
          err.response?.data ?? { error: "Audio service error" }
        );
      } else {
        res.status(500).json({ error: "Unexpected error" });
      }
    }
  }
);

export default router;

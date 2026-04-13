import { Router, Request, Response } from "express";
import { audioQueue, generationQueue } from "../queue";

const router = Router();

router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  if (!audioQueue || !generationQueue) {
    res.json({
      queues: "disabled",
      reason: "No Redis — set REDIS_URL to enable queued jobs",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const [
      audioWaiting, audioActive, audioFailed, audioCompleted,
      genWaiting,   genActive,   genFailed,   genCompleted,
    ] = await Promise.all([
      audioQueue.getWaitingCount(),
      audioQueue.getActiveCount(),
      audioQueue.getFailedCount(),
      audioQueue.getCompletedCount(),
      generationQueue.getWaitingCount(),
      generationQueue.getActiveCount(),
      generationQueue.getFailedCount(),
      generationQueue.getCompletedCount(),
    ]);

    res.json({
      queues: {
        "audio-processing": {
          waiting:   audioWaiting,
          active:    audioActive,
          failed:    audioFailed,
          completed: audioCompleted,
        },
        generation: {
          waiting:   genWaiting,
          active:    genActive,
          failed:    genFailed,
          completed: genCompleted,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Queue unavailable";
    res.status(503).json({ error: msg });
  }
});

export default router;

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock BullMQ + ioredis ────────────────────────────────────────────────────

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: jest.fn().mockResolvedValue({ id: "job-1" }),
    getWaitingCount:   jest.fn().mockResolvedValue(0),
    getActiveCount:    jest.fn().mockResolvedValue(0),
    getFailedCount:    jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue("OK"),
    status: "ready",
  }))
);

// ─── Mock axios ───────────────────────────────────────────────────────────────

const mockAxiosPost = jest.fn();
const mockAxiosGet  = jest.fn();

jest.mock("axios", () => ({
  post: (...args: unknown[]) => mockAxiosPost(...args),
  get:  (...args: unknown[]) => mockAxiosGet(...args),
  isAxiosError: jest.fn((err: unknown) => (err as Record<string, unknown>)?._isAxiosError === true),
}));

// ─── Express app setup ───────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import audioRouter from "../routes/audio";

const app = express();
app.use(express.json());
app.use("/api/audio", audioRouter);

// ─────────────────────────────────────────────────────────────────────────────

const STATUS_RESPONSE = {
  ready: true,
  components: { demucs: true, librosa: true, pedalboard: true },
  pipeline: ["stems", "log_drum", "mix", "master"],
};

const FULL_RENDER_RESPONSE = {
  status: "complete",
  track_id: "track-001",
  subgenre: "private_school",
  artifacts: {
    raw_audio: "raw-001",
    stems: { drums: "d-001", bass: "b-001", vocals: "v-001", other: "o-001", log_drum: "ld-001" },
    log_drum: "ld-001",
    mix: "mix-001",
    master: "master-001",
  },
  master_lufs_target: -10.0,
  pipeline_log: [
    "Raw audio: raw-001 (2048 bytes)",
    "Stems separated: [\"drums\", \"bass\", \"vocals\", \"other\"]",
    "Log drum extracted: 32 onsets",
    "Mix rendered: mix-001 (Private School Mix)",
    "Master complete: master-001 @ -10.0 LUFS",
  ],
};

describe("Render Pipeline", () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: STATUS_RESPONSE });
    mockAxiosPost.mockResolvedValue({ data: FULL_RENDER_RESPONSE });
  });

  // ─── Live Python service (via mocked axios) ───────────────────────────────

  it("1. GET /render/status → 200", async () => {
    const res = await request(app).get("/api/audio/render/status");
    expect(res.status).toBe(200);
  });

  it("2. Response has ready field", async () => {
    const res = await request(app).get("/api/audio/render/status");
    expect(res.body).toHaveProperty("ready");
    expect(typeof res.body.ready).toBe("boolean");
  });

  it("3. Response has components object", async () => {
    const res = await request(app).get("/api/audio/render/status");
    expect(res.body).toHaveProperty("components");
    expect(typeof res.body.components).toBe("object");
  });

  it("4. demucs component is true", async () => {
    const res = await request(app).get("/api/audio/render/status");
    expect(res.body.components.demucs).toBe(true);
  });

  it("5. librosa component is true", async () => {
    const res = await request(app).get("/api/audio/render/status");
    expect(res.body.components.librosa).toBe(true);
  });

  it("6. pedalboard component is true", async () => {
    const res = await request(app).get("/api/audio/render/status");
    expect(res.body.components.pedalboard).toBe(true);
  });

  // ─── Proxy tests (mocked) ─────────────────────────────────────────────────

  it("7. POST /api/audio/render/full → proxies to /render/full", async () => {
    const body = {
      raw_audio_file_id: "raw-001",
      track_id: "track-001",
      subgenre: "private_school",
    };
    await request(app).post("/api/audio/render/full").send(body);

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/render/full"),
      expect.objectContaining({ raw_audio_file_id: "raw-001" }),
      expect.objectContaining({ timeout: 600000 })
    );
  });

  it("8. GET /api/audio/render/status → proxies correctly", async () => {
    await request(app).get("/api/audio/render/status");
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining("/render/status")
    );
  });

  it("9. Full render response → has artifacts object", async () => {
    const res = await request(app)
      .post("/api/audio/render/full")
      .send({ raw_audio_file_id: "raw-001", track_id: "track-001", subgenre: "private_school" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("artifacts");
    expect(typeof res.body.artifacts).toBe("object");
  });

  it("10. artifacts has keys: raw_audio, stems, mix, master", async () => {
    const res = await request(app)
      .post("/api/audio/render/full")
      .send({ raw_audio_file_id: "raw-001", track_id: "track-001", subgenre: "private_school" });

    const { artifacts } = res.body as { artifacts: Record<string, unknown> };
    expect(artifacts).toHaveProperty("raw_audio");
    expect(artifacts).toHaveProperty("stems");
    expect(artifacts).toHaveProperty("mix");
    expect(artifacts).toHaveProperty("master");
  });

});

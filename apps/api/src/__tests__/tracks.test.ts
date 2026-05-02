import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const TRACK_1 = {
  id: "track-aaa-001", title: "Johannesburg Rain", subgenre: "private_school",
  bpm: 112, key: "F#m", created_by: "kabelo", created_at: "2026-04-30T10:00:00Z",
  status: "draft", generation_mode: "mode_1_suno", updated_at: "2026-04-30T10:00:00Z",
};
const TRACK_2 = {
  id: "track-bbb-002", title: "Soweto Nights", subgenre: "sgija",
  bpm: 108, key: "Am", created_by: "thabo", created_at: "2026-04-29T10:00:00Z",
  status: "draft", generation_mode: "mode_1_suno", updated_at: "2026-04-29T10:00:00Z",
};

const mockFrom        = jest.fn();
const mockDownload    = jest.fn();
const mockStorageFrom = jest.fn().mockReturnValue({ download: mockDownload });

jest.mock("../lib/supabase", () => ({
  supabase: {
    from:    (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  },
}));

// ─── Mock @aura-x/engine ─────────────────────────────────────────────────────

const mockEvaluateBuffer           = jest.fn();
const mockGenerateProductionReport = jest.fn();
const mockBuildChordProgression    = jest.fn();
const mockExportChordToMidi        = jest.fn();
const mockGenerateGrooveVariations = jest.fn();
const mockExportGrooveToMidi       = jest.fn();

// Minimal valid MIDI header bytes (MThd)
const FAKE_MIDI_BUFFER = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0,0,0,6, 0,0, 0,1, 0x01, 0xe0]);

jest.mock("@aura-x/engine", () => ({
  evaluateBuffer:              (...args: unknown[]) => mockEvaluateBuffer(...args),
  generateProductionReport:    (...args: unknown[]) => mockGenerateProductionReport(...args),
  buildChordProgression:       (...args: unknown[]) => mockBuildChordProgression(...args),
  exportChordProgressionToMidi:(...args: unknown[]) => mockExportChordToMidi(...args),
  generateGrooveVariations:    (...args: unknown[]) => mockGenerateGrooveVariations(...args),
  exportGrooveToMidi:          (...args: unknown[]) => mockExportGrooveToMidi(...args),
}));

// ─── Mock auth middleware ─────────────────────────────────────────────────────

jest.mock("../middleware/auth", () => ({
  verifyToken: (req: { artist: unknown }, _res: unknown, next: () => void) => {
    req.artist = { artist_id: "test-artist-001", email: "test@aurax.test" };
    next();
  },
}));

// ─── Build app ───────────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import tracksRouter from "../routes/tracks";

const app = express();
app.use(express.json());
app.use("/api/tracks", tracksRouter);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeListMock(tracks: typeof TRACK_1[], count = tracks.length) {
  return {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    gte:    jest.fn().mockReturnThis(),
    lte:    jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockResolvedValue({ data: tracks, count, error: null }),
    in:     jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    limit:  jest.fn().mockReturnThis(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/tracks", () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: tracks listing returns 2 tracks; evaluations + generations empty
      mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return makeListMock([TRACK_1, TRACK_2], 2);
      }
      if (table === "evaluations" || table === "generations") {
        // Route chains .select().in().order() — in() must return this, order() resolves
        return {
          select: jest.fn().mockReturnThis(),
          in:     jest.fn().mockReturnThis(),
          order:  jest.fn().mockResolvedValue({ data: [], error: null }),
          eq:     jest.fn().mockReturnThis(),
          limit:  jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });
  });

  it("1. GET /api/tracks → 200, returns tracks array", async () => {
    const res = await request(app).get("/api/tracks");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tracks)).toBe(true);
    expect(res.body.tracks.length).toBe(2);
  });

  it("2. Response includes total, page, limit", async () => {
    const res = await request(app).get("/api/tracks");
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it("3. Each track has required fields", async () => {
    const res = await request(app).get("/api/tracks");
    const track = res.body.tracks[0];
    expect(track).toHaveProperty("id");
    expect(track).toHaveProperty("title");
    expect(track).toHaveProperty("subgenre");
    expect(track).toHaveProperty("bpm");
    expect(track).toHaveProperty("key");
    expect(track).toHaveProperty("created_by");
    expect(track).toHaveProperty("created_at");
    expect(track).toHaveProperty("composite_score");
    expect(track).toHaveProperty("generation_id");
  });

  it("4. ?subgenre= filter is passed to query", async () => {
    const eqSpy = jest.fn().mockReturnThis();
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        const mock = makeListMock([TRACK_1], 1);
        mock.eq = eqSpy;
        return mock;
      }
      return {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({ data: [], error: null }),
        eq:     jest.fn().mockReturnThis(),
        limit:  jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
    await request(app).get("/api/tracks?subgenre=private_school");
    expect(eqSpy).toHaveBeenCalledWith("subgenre", "private_school");
  });

  it("5. ?page=2&limit=5 returns correct page/limit in response", async () => {
    const res = await request(app).get("/api/tracks?page=2&limit=5");
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
  });

});

describe("GET /api/tracks/:id", () => {

  beforeEach(() => {
    jest.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: TRACK_1, error: null }),
        };
      }
      if (table === "ctls") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { ctl_json: { global: { bpm: 112 } }, version: 1 },
            error: null,
          }),
        };
      }
      if (table === "generations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: "gen-001", mode: "mode_1_suno", status: "complete", prompt_style: "Amapiano", created_at: "2026-04-30T10:00:00Z" },
            error: null,
          }),
        };
      }
      if (table === "evaluations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { composite_score: 0.82, passed_gate: true, authenticity_score: 0.9, groove_clarity_score: 0.78 },
            error: null,
          }),
        };
      }
      if (table === "producer_feedback") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({
            data: [{ rating: 4 }, { rating: 5 }],
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });
  });

  it("6. GET /api/tracks/:id → 200, returns track", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TRACK_1.id);
    expect(res.body.title).toBe(TRACK_1.title);
  });

  it("7. Response includes ctl_snapshot", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001");
    expect(res.body.ctl_snapshot).toBeDefined();
    expect(res.body.ctl_snapshot.global.bpm).toBe(112);
  });

  it("8. Response includes composite_score and feedback", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001");
    expect(res.body.composite_score).toBe(0.82);
    expect(res.body.feedback_count).toBe(2);
    expect(res.body.feedback_avg).toBe(4.5);
  });

  it("9. GET /api/tracks/:id → 404 for unknown track", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = await request(app).get("/api/tracks/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("10. Response includes generation metadata", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001");
    expect(res.body.generation).toBeDefined();
    expect(res.body.generation.id).toBe("gen-001");
    expect(res.body.generation.status).toBe("complete");
  });

});

describe("POST /api/tracks/:id/suno-result", () => {

  const SUNO_RESULT = {
    id: "track-aaa-001",
    title: "Johannesburg Rain",
    suno_approved: true,
    suno_classified_at: "2026-05-01T10:00:00Z",
    suno_style_tag: "amapiano",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => ({
      update:  jest.fn().mockReturnThis(),
      eq:      jest.fn().mockReturnThis(),
      select:  jest.fn().mockReturnThis(),
      single:  jest.fn().mockResolvedValue({ data: SUNO_RESULT, error: null }),
    }));
  });

  it("11. POST approved:true → 200 with suno_approved true", async () => {
    const res = await request(app)
      .post("/api/tracks/track-aaa-001/suno-result")
      .set("Authorization", "Bearer test-token")
      .send({ approved: true, style_tag: "amapiano" });
    expect(res.status).toBe(200);
    expect(res.body.suno_approved).toBe(true);
    expect(res.body.suno_style_tag).toBe("amapiano");
  });

  it("12. POST approved:false → 200 with suno_approved false", async () => {
    mockFrom.mockImplementation(() => ({
      update:  jest.fn().mockReturnThis(),
      eq:      jest.fn().mockReturnThis(),
      select:  jest.fn().mockReturnThis(),
      single:  jest.fn().mockResolvedValue({ data: { ...SUNO_RESULT, suno_approved: false }, error: null }),
    }));
    const res = await request(app)
      .post("/api/tracks/track-aaa-001/suno-result")
      .set("Authorization", "Bearer test-token")
      .send({ approved: false });
    expect(res.status).toBe(200);
    expect(res.body.suno_approved).toBe(false);
  });

  it("13. POST without approved → 400", async () => {
    const res = await request(app)
      .post("/api/tracks/track-aaa-001/suno-result")
      .set("Authorization", "Bearer test-token")
      .send({ style_tag: "amapiano" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approved must be a boolean/i);
  });

  it("14. POST approved as string → 400", async () => {
    const res = await request(app)
      .post("/api/tracks/track-aaa-001/suno-result")
      .set("Authorization", "Bearer test-token")
      .send({ approved: "true" });
    expect(res.status).toBe(400);
  });

  it("15. POST track not found → 404", async () => {
    mockFrom.mockImplementation(() => ({
      update:  jest.fn().mockReturnThis(),
      eq:      jest.fn().mockReturnThis(),
      select:  jest.fn().mockReturnThis(),
      single:  jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const res = await request(app)
      .post("/api/tracks/does-not-exist/suno-result")
      .set("Authorization", "Bearer test-token")
      .send({ approved: true });
    expect(res.status).toBe(404);
  });

});

describe("POST /api/tracks/:id/report", () => {

  const AUDIO_PATH = "track-aaa-001/raw_generation/file-123.wav";

  const FAKE_EVAL = { features: {}, laneScores: { bestFitLane: "private_school" }, quality: {}, groove: {}, perception: {}, stems: {}, cultural: {}, issues: [] };

  const FAKE_REPORT = {
    summary:         { lane: "private_school", bpm: 112, key: "F#m", passesThreshold: true, grade: "A", readyForRelease: true, overallScore: 0.83 },
    qualityGate:     { grade: "A", allPass: true, passCount: 5, overallScore: 0.83, gates: [], readyForRelease: true, summary: "Grade A" },
    mixSpec:         { masterVolume: -6, tracks: [] },
    samplePack:      { lane: "private_school", samples: [] },
    arrangement:     { sections: [] },
    recommendations: ["Add log drum on beats 2 and 4"],
    generatedAt:     "2026-05-01T10:00:00Z",
  };

  function makeTrackMock(found = true) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: found ? { id: "track-aaa-001" } : null, error: null }),
    };
  }

  function makeAudioFileMock(found = true) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: found ? { storage_path: AUDIO_PATH } : null,
        error: null,
      }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Default supabase mock: track found, audio file found
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTrackMock(true);
      if (table === "audio_files") return makeAudioFileMock(true);
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });

    // Default storage mock: download succeeds
    const fakeBlob = { arrayBuffer: jest.fn().mockResolvedValue(Buffer.from("fake-wav").buffer) };
    mockStorageFrom.mockReturnValue({ download: mockDownload });
    mockDownload.mockResolvedValue({ data: fakeBlob, error: null });

    // Default engine mocks: evaluation + report succeed
    mockEvaluateBuffer.mockReturnValue(FAKE_EVAL);
    mockGenerateProductionReport.mockReturnValue(FAKE_REPORT);
  });

  it("16. POST /api/tracks/:id/report → 200 with report shape", async () => {
    const res = await request(app).post("/api/tracks/track-aaa-001/report");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      summary:         expect.any(Object),
      qualityGate:     expect.any(Object),
      mixSpec:         expect.any(Object),
      samplePack:      expect.any(Object),
      arrangement:     expect.any(Object),
      recommendations: expect.any(Array),
      generatedAt:     expect.any(String),
    });
  });

  it("17. evaluateBuffer called with a Buffer", async () => {
    await request(app).post("/api/tracks/track-aaa-001/report");
    expect(mockEvaluateBuffer).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("18. generateProductionReport called with evaluation result", async () => {
    await request(app).post("/api/tracks/track-aaa-001/report");
    expect(mockGenerateProductionReport).toHaveBeenCalledWith(FAKE_EVAL);
  });

  it("19. summary.grade and summary.lane present in response", async () => {
    const res = await request(app).post("/api/tracks/track-aaa-001/report");
    expect(res.body.summary.grade).toBe("A");
    expect(res.body.summary.lane).toBe("private_school");
  });

  it("20. recommendations is a non-empty array", async () => {
    const res = await request(app).post("/api/tracks/track-aaa-001/report");
    expect(res.body.recommendations).toHaveLength(1);
    expect(res.body.recommendations[0]).toMatch(/log drum/i);
  });

  it("21. Track not found → 404", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTrackMock(false);
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });
    const res = await request(app).post("/api/tracks/does-not-exist/report");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("22. No audio file for track → 422 with message", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTrackMock(true);
      if (table === "audio_files") return makeAudioFileMock(false);
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });
    const res = await request(app).post("/api/tracks/track-aaa-001/report");
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/generate first/i);
  });

  it("23. Storage download fails → 500", async () => {
    mockDownload.mockResolvedValue({ data: null, error: { message: "object not found" } });
    const res = await request(app).post("/api/tracks/track-aaa-001/report");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to retrieve/i);
  });

  it("24. evaluateBuffer throws → 422 with message", async () => {
    mockEvaluateBuffer.mockImplementation(() => { throw new Error("Not a WAV"); });
    const res = await request(app).post("/api/tracks/track-aaa-001/report");
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/WAV/i);
  });

  it("25. storage.from called with 'aura-x-audio'", async () => {
    await request(app).post("/api/tracks/track-aaa-001/report");
    expect(mockStorageFrom).toHaveBeenCalledWith("aura-x-audio");
    expect(mockDownload).toHaveBeenCalledWith(AUDIO_PATH);
  });

});

describe("GET /api/tracks/:id/midi", () => {

  const TRACK_META = { id: "track-aaa-001", title: "Johannesburg Rain", subgenre: "private_school", bpm: 112 };

  const FAKE_GROOVE_SET = { main: { lane: "private_school", swing: 0.54, steps: 16, kickPattern: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], hatPattern: [], shakerPattern: [], logDrumPattern: [], densityProfile: "medium", microtimingProfile: "forward_shuffle", styleBiasApplied: true, grooveType: "private_school_main" } };

  function makeTrackQuery(found = true) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: found ? TRACK_META : null, error: null }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTrackQuery(true);
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });

    mockGenerateGrooveVariations.mockReturnValue(FAKE_GROOVE_SET);
    mockExportGrooveToMidi.mockReturnValue({ buffer: new Uint8Array(FAKE_MIDI_BUFFER), noteCount: 8, durationTicks: 3840, bars: 4, bpm: 112 });
    mockBuildChordProgression.mockReturnValue({ lane: "private_school", key: "Am", voicings: [], loopable: true, amapianoStyle: true });
    mockExportChordToMidi.mockReturnValue({ buffer: FAKE_MIDI_BUFFER, lane: "private_school", bpm: 112, chordCount: 8, totalBars: 8, beatsPerChord: 4 });
  });

  it("26. GET /api/tracks/:id/midi → 200", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001/midi");
    expect(res.status).toBe(200);
  });

  it("27. Default track=drums → Content-Type audio/midi", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001/midi");
    expect(res.headers["content-type"]).toMatch(/audio\/midi/);
  });

  it("28. Content-Disposition contains filename ending in .mid", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001/midi");
    expect(res.headers["content-disposition"]).toMatch(/\.mid"/);
  });

  it("29. Default track=drums calls generateGrooveVariations with lane and bpm", async () => {
    await request(app).get("/api/tracks/track-aaa-001/midi");
    expect(mockGenerateGrooveVariations).toHaveBeenCalledWith("private_school", { bpm: 112 });
  });

  it("30. Default track=drums calls exportGrooveToMidi with variationSet.main", async () => {
    await request(app).get("/api/tracks/track-aaa-001/midi");
    expect(mockExportGrooveToMidi).toHaveBeenCalledWith(FAKE_GROOVE_SET.main, 112, 4);
  });

  it("31. ?track=drums filename contains _drums.mid", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001/midi?track=drums");
    expect(res.headers["content-disposition"]).toMatch(/_drums\.mid/);
  });

  it("32. ?track=chords calls buildChordProgression with lane", async () => {
    await request(app).get("/api/tracks/track-aaa-001/midi?track=chords");
    expect(mockBuildChordProgression).toHaveBeenCalledWith({ lane: "private_school" });
  });

  it("33. ?track=chords calls exportChordProgressionToMidi with bpm", async () => {
    await request(app).get("/api/tracks/track-aaa-001/midi?track=chords");
    expect(mockExportChordToMidi).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ bpm: 112 })
    );
  });

  it("34. ?track=chords filename contains _chords.mid", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001/midi?track=chords");
    expect(res.headers["content-disposition"]).toMatch(/_chords\.mid/);
  });

  it("35. ?bars=8 passes bars=8 to exportGrooveToMidi", async () => {
    await request(app).get("/api/tracks/track-aaa-001/midi?bars=8");
    expect(mockExportGrooveToMidi).toHaveBeenCalledWith(expect.any(Object), 112, 8);
  });

  it("36. ?bars=0 clamps to 1", async () => {
    await request(app).get("/api/tracks/track-aaa-001/midi?bars=0");
    expect(mockExportGrooveToMidi).toHaveBeenCalledWith(expect.any(Object), 112, 1);
  });

  it("37. ?bars=999 clamps to 32", async () => {
    await request(app).get("/api/tracks/track-aaa-001/midi?bars=999");
    expect(mockExportGrooveToMidi).toHaveBeenCalledWith(expect.any(Object), 112, 32);
  });

  it("38. Track not found → 404", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") return makeTrackQuery(false);
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });
    const res = await request(app).get("/api/tracks/does-not-exist/midi");
    expect(res.status).toBe(404);
  });

  it("39. ?track=invalid → 400 with error message", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001/midi?track=xml");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/drums.*chords/i);
  });

  it("40. Response body is non-empty binary", async () => {
    const res = await request(app).get("/api/tracks/track-aaa-001/midi").buffer(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

});

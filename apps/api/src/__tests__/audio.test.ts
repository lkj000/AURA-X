import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import axios from "axios";
import FormData from "form-data";
import { supabase } from "../lib/supabase";

const AUDIO_URL = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";
const TEST_MARKER = "test_job_05";

let trackId: string;
let audioFileId: string;

// Minimal valid WAV: 44-byte header + 100 bytes silence
function makeWavBuffer(): Buffer {
  const dataSize = 100;
  const buf = Buffer.alloc(44 + dataSize, 0);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);       // chunk size
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(44100, 24);    // sample rate
  buf.writeUInt32LE(88200, 28);    // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

beforeAll(async () => {
  const { data, error } = await supabase
    .from("tracks")
    .insert({
      title: "Audio Test Track Job 05",
      subgenre: "private_school",
      bpm: 112,
      key: "F#m",
      generation_mode: "mode_1_suno",
      created_by: TEST_MARKER,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  trackId = data!.id;
});

afterAll(async () => {
  await supabase.from("tracks").delete().eq("created_by", TEST_MARKER);
});

describe("Audio ingestion", () => {
  it("1. audio service health check", async () => {
    const res = await axios.get(`${AUDIO_URL}/health`);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("ok");
  });

  it("2. upload valid WAV → 200, returns audio_file_id", async () => {
    const form = new FormData();
    form.append("file", makeWavBuffer(), {
      filename: "test.wav",
      contentType: "audio/wav",
    });
    form.append("track_id", trackId);
    form.append("file_type", "raw_generation");

    const res = await axios.post(`${AUDIO_URL}/audio/upload`, form, {
      headers: form.getHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.data.audio_file_id).toBeDefined();
    audioFileId = res.data.audio_file_id;
  });

  it("3. returned audio_file_id is a valid UUID", () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(audioFileId).toMatch(uuidRe);
  });

  it("4. audio_files record exists in Supabase after upload", async () => {
    const { data } = await supabase
      .from("audio_files")
      .select("*")
      .eq("id", audioFileId)
      .single();
    expect(data).not.toBeNull();
  });

  it("5. audio_files record has correct track_id", async () => {
    const { data } = await supabase
      .from("audio_files")
      .select("track_id")
      .eq("id", audioFileId)
      .single();
    expect(data!.track_id).toBe(trackId);
  });

  it("6. audio_files record has correct file_type = raw_generation", async () => {
    const { data } = await supabase
      .from("audio_files")
      .select("file_type")
      .eq("id", audioFileId)
      .single();
    expect(data!.file_type).toBe("raw_generation");
  });

  it("7. audio_files record has correct format = wav", async () => {
    const { data } = await supabase
      .from("audio_files")
      .select("format")
      .eq("id", audioFileId)
      .single();
    expect(data!.format).toBe("wav");
  });

  it("8. GET /audio/signed-url/{audio_file_id} → 200, returns signed_url", async () => {
    const res = await axios.get(`${AUDIO_URL}/audio/signed-url/${audioFileId}`);
    expect(res.status).toBe(200);
    expect(res.data.signed_url).toBeDefined();
    expect(typeof res.data.signed_url).toBe("string");
  });

  it("9. upload with unsupported content type → 400", async () => {
    const form = new FormData();
    form.append("file", Buffer.from("fake"), {
      filename: "test.txt",
      contentType: "text/plain",
    });
    form.append("track_id", trackId);

    try {
      await axios.post(`${AUDIO_URL}/audio/upload`, form, { headers: form.getHeaders() });
      throw new Error("Expected 400 but got success");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        expect(err.response?.status).toBe(400);
      } else {
        throw err;
      }
    }
  });

  it("10. upload without track_id → 422 (FastAPI validation)", async () => {
    const form = new FormData();
    form.append("file", makeWavBuffer(), {
      filename: "test.wav",
      contentType: "audio/wav",
    });
    // no track_id

    try {
      await axios.post(`${AUDIO_URL}/audio/upload`, form, { headers: form.getHeaders() });
      throw new Error("Expected 422 but got success");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        expect(err.response?.status).toBe(422);
      } else {
        throw err;
      }
    }
  });
});

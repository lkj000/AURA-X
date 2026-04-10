import * as dotenv from "dotenv";
dotenv.config({ path: require("path").resolve(__dirname, "../../.env") });

import { supabase } from "../lib/supabase";

const TEST_MARKER = "test_job_03";
let trackId: string;
let ctlId: string;
let generationId: string;

describe("Supabase connectivity", () => {
  it("client initializes without throwing", () => {
    expect(supabase).toBeDefined();
  });

  it("insert track → returns id", async () => {
    const { data, error } = await supabase
      .from("tracks")
      .insert({
        title: "Test Track Job 03",
        subgenre: "private_school",
        bpm: 112,
        key: "F#m",
        generation_mode: "mode_1_suno",
        created_by: TEST_MARKER,
        status: "draft",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBeDefined();
    trackId = data!.id;
  });

  it("read track by id", async () => {
    const { data, error } = await supabase
      .from("tracks")
      .select("*")
      .eq("id", trackId)
      .single();

    expect(error).toBeNull();
    expect(data!.title).toBe("Test Track Job 03");
    expect(data!.bpm).toBe(112);
  });

  it("insert CTL record linked to track", async () => {
    const { data, error } = await supabase
      .from("ctls")
      .insert({
        track_id: trackId,
        version: 1,
        ctl_json: { schema_version: "ctl_v1", title: "Test", bpm: 112 },
        is_active: true,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.track_id).toBe(trackId);
    ctlId = data!.id;
  });

  it("query ctls by track_id", async () => {
    const { data, error } = await supabase
      .from("ctls")
      .select("*")
      .eq("track_id", trackId);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
    expect(data![0].track_id).toBe(trackId);
  });

  it("insert generation record linked to track + ctl", async () => {
    const { data, error } = await supabase
      .from("generations")
      .insert({
        track_id: trackId,
        ctl_id: ctlId,
        mode: "mode_1_suno",
        status: "pending",
        prompt_style: "amapiano private school, 112 BPM, F#m, soft log drum",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.track_id).toBe(trackId);
    generationId = data!.id;
  });

  it("insert evaluation record linked to track + generation", async () => {
    const { data, error } = await supabase
      .from("evaluations")
      .insert({
        track_id: trackId,
        generation_id: generationId,
        authenticity_score: 0.85,
        groove_clarity_score: 0.90,
        composite_score: 0.87,
        evaluator: "auto",
        passed_gate: true,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.composite_score).toBe(0.87);
  });

  it("cleanup: delete all test records by created_by = test_job_03", async () => {
    // Cascades handle ctls, generations, evaluations via track FK
    const { error } = await supabase
      .from("tracks")
      .delete()
      .eq("created_by", TEST_MARKER);

    expect(error).toBeNull();
  });
});

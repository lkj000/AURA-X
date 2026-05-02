import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "../middleware/auth";
import {
  evaluateBuffer,
  generateProductionReport,
  buildChordProgression,
  exportChordProgressionToMidi,
  generateGrooveVariations,
  exportGrooveToMidi,
} from "@aura-x/engine";
import type { Lane } from "@aura-x/engine";
import { suggestGroove, planMelody, exportMelodyToMidi, mergeToMultiTrackMidi } from "@aura-x/ac-ami";

const router = Router();

// GET /api/tracks
// Query: ?subgenre= &bpm_min= &bpm_max= &key= &page= &limit=
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { subgenre, bpm_min, bpm_max, key } = req.query;
  const pageNum  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const from = (pageNum - 1) * limitNum;
  const to   = from + limitNum - 1;

  let query = supabase
    .from("tracks")
    .select("id, title, subgenre, bpm, key, created_by, created_at", { count: "exact" });

  if (subgenre) query = query.eq("subgenre", subgenre as string);
  if (bpm_min)  query = query.gte("bpm", Number(bpm_min));
  if (bpm_max)  query = query.lte("bpm", Number(bpm_max));
  if (key)      query = query.eq("key", key as string);

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data: tracks, count, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const trackIds = (tracks ?? []).map((t) => t.id);
  const scoresMap: Record<string, number> = {};
  const genMap:    Record<string, string> = {};

  if (trackIds.length > 0) {
    const { data: evals } = await supabase
      .from("evaluations")
      .select("track_id, composite_score")
      .in("track_id", trackIds)
      .order("composite_score", { ascending: false });

    for (const e of evals ?? []) {
      if (e.track_id && !scoresMap[e.track_id]) {
        scoresMap[e.track_id] = e.composite_score;
      }
    }

    const { data: gens } = await supabase
      .from("generations")
      .select("id, track_id")
      .in("track_id", trackIds)
      .order("created_at", { ascending: false });

    for (const g of gens ?? []) {
      if (g.track_id && !genMap[g.track_id]) {
        genMap[g.track_id] = g.id;
      }
    }
  }

  const enriched = (tracks ?? []).map((t) => ({
    ...t,
    composite_score: scoresMap[t.id] ?? null,
    generation_id:   genMap[t.id]    ?? null,
  }));

  res.json({ tracks: enriched, total: count ?? 0, page: pageNum, limit: limitNum });
});

// GET /api/tracks/:id
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (trackError) {
    res.status(500).json({ error: trackError.message });
    return;
  }
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }

  const [ctlRes, genRes, evalRes, fbRes] = await Promise.all([
    supabase.from("ctls").select("ctl_json, version").eq("track_id", id).eq("is_active", true).maybeSingle(),
    supabase.from("generations").select("id, mode, status, prompt_style, created_at").eq("track_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("evaluations").select("composite_score, passed_gate, authenticity_score, groove_clarity_score").eq("track_id", id).order("composite_score", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("producer_feedback").select("rating").eq("track_id", id),
  ]);

  const ratings = ((fbRes.data ?? []) as { rating: number }[]).map((f) => f.rating);
  const feedback_count = ratings.length;
  const feedback_avg   = feedback_count > 0
    ? parseFloat((ratings.reduce((a, b) => a + b, 0) / feedback_count).toFixed(2))
    : null;

  res.json({
    ...track,
    ctl_snapshot:    ctlRes.data?.ctl_json ?? null,
    generation:      genRes.data ?? null,
    composite_score: evalRes.data?.composite_score ?? null,
    passed_gate:     evalRes.data?.passed_gate ?? null,
    feedback_count,
    feedback_avg,
  });
});

// GET /api/tracks/:id/midi/full
// Query: ?bars=1-32 (default 4)
// Returns a Type-1 MIDI file with three tracks: drums (ch 10), chords (ch 0),
// melody (ch 1) — all derived from track metadata, no audio needed.
router.get("/:id/midi/full", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const barsParsed = parseInt(String(req.query.bars ?? "4"), 10);
  const bars       = Math.min(32, Math.max(1, isNaN(barsParsed) ? 4 : barsParsed));

  const { data: track } = await supabase
    .from("tracks")
    .select("id, title, subgenre, bpm, key")
    .eq("id", id)
    .maybeSingle();

  if (!track) { res.status(404).json({ error: "Track not found" }); return; }

  const lane      = track.subgenre as Lane;
  const bpm       = track.bpm       as number;
  const trackKey  = (track.key as string | null) ?? "C";
  const safeTitle = String(track.title ?? id).replace(/[^a-zA-Z0-9_-]/g, "_");

  // Drums
  const variationSet = generateGrooveVariations(lane, { bpm });
  const drumsMidi    = exportGrooveToMidi(variationSet.main, bpm, bars);
  const drumsBuffer  = Buffer.from(drumsMidi.buffer);

  // Chords
  const progression  = buildChordProgression({ lane });
  const chordsMidi   = exportChordProgressionToMidi(progression, { bpm, beatsPerChord: 4, repeat: bars });
  const chordsBuffer = chordsMidi.buffer;

  // Melody
  const melodyPlan   = planMelody(lane, trackKey, bpm, { bars });
  const melodyMidi   = exportMelodyToMidi(melodyPlan);
  const melodyBuffer = melodyMidi.buffer;

  const { buffer } = mergeToMultiTrackMidi([
    { buffer: drumsBuffer  },
    { buffer: chordsBuffer },
    { buffer: melodyBuffer },
  ]);

  res.setHeader("Content-Type", "audio/midi");
  res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}_full.mid"`);
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
});

// GET /api/tracks/:id/midi
// Query: ?track=drums|chords (default drums), ?bars=1-32 (default 4)
// Generates a MIDI file from track metadata (subgenre, bpm) — no audio needed.
// Returns a downloadable .mid binary.
router.get("/:id/midi", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const trackParam = String(req.query.track ?? "drums");
  const barsParsed = parseInt(String(req.query.bars ?? "4"), 10);
  const barsParam  = Math.min(32, Math.max(1, isNaN(barsParsed) ? 4 : barsParsed));

  if (trackParam !== "drums" && trackParam !== "chords") {
    res.status(400).json({ error: "?track must be 'drums' or 'chords'" });
    return;
  }

  const { data: track } = await supabase
    .from("tracks")
    .select("id, title, subgenre, bpm")
    .eq("id", id)
    .maybeSingle();

  if (!track) { res.status(404).json({ error: "Track not found" }); return; }

  const lane = track.subgenre as Lane;
  const bpm  = track.bpm as number;

  let midiBuffer: Buffer;
  let filename:   string;
  const safeTitle = String(track.title ?? id).replace(/[^a-zA-Z0-9_-]/g, "_");

  if (trackParam === "chords") {
    const progression = buildChordProgression({ lane });
    const result      = exportChordProgressionToMidi(progression, { bpm, beatsPerChord: 4, repeat: barsParam });
    midiBuffer = result.buffer;
    filename   = `${safeTitle}_chords.mid`;
  } else {
    const variationSet = generateGrooveVariations(lane, { bpm });
    const result       = exportGrooveToMidi(variationSet.main, bpm, barsParam);
    midiBuffer = Buffer.from(result.buffer);
    filename   = `${safeTitle}_drums.mid`;
  }

  res.setHeader("Content-Type", "audio/midi");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", midiBuffer.length);
  res.send(midiBuffer);
});

// POST /api/tracks/:id/report
// Downloads the latest raw_generation audio for the track, runs the full
// engine evaluation stack, and returns a ProductionReport (grade, mix spec,
// sample recommendations, arrangement arc, ranked recommendations).
router.post("/:id/report", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data: track } = await supabase.from("tracks").select("id").eq("id", id).maybeSingle();
  if (!track) { res.status(404).json({ error: "Track not found" }); return; }

  const { data: audioFile } = await supabase
    .from("audio_files")
    .select("storage_path")
    .eq("track_id", id)
    .eq("file_type", "raw_generation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!audioFile) {
    res.status(422).json({ error: "No audio available for this track — generate first" });
    return;
  }

  const { data: blob, error: dlError } = await supabase.storage
    .from("aura-x-audio")
    .download(audioFile.storage_path);

  if (dlError || !blob) {
    res.status(500).json({ error: "Failed to retrieve audio file" });
    return;
  }

  const audioBuffer = Buffer.from(await (blob as Blob).arrayBuffer());

  try {
    const evaluation = evaluateBuffer(audioBuffer);
    const report     = generateProductionReport(evaluation);
    res.json(report);
  } catch {
    res.status(422).json({ error: "Audio could not be analysed — WAV 16-bit PCM required" });
  }
});

// POST /api/tracks/:id/suno-result  (requires JWT)
// Body: { approved: boolean, style_tag?: string }
router.post("/:id/suno-result", verifyToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { approved, style_tag } = req.body as { approved: unknown; style_tag?: string };

  if (typeof approved !== "boolean") {
    res.status(400).json({ error: "approved must be a boolean" });
    return;
  }

  const { data, error } = await supabase
    .from("tracks")
    .update({
      suno_approved:      approved,
      suno_classified_at: new Date().toISOString(),
      suno_style_tag:     style_tag ?? null,
    })
    .eq("id", id)
    .select("id, title, suno_approved, suno_classified_at, suno_style_tag")
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data)  { res.status(404).json({ error: "Track not found" }); return; }

  res.json(data);
});

// GET /api/tracks/:id/groove-suggest
// Query: ?intensity=0-1 &variation_level=0-1 &max=1-10
// Returns ranked groove pattern suggestions adapted to the track's lane and
// the latest evaluation scores (groove_clarity, composite).
router.get("/:id/groove-suggest", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const intensityRaw     = parseFloat(String(req.query.intensity      ?? "0.6"));
  const variationRaw     = parseFloat(String(req.query.variation_level ?? "0.3"));
  const maxRaw           = parseInt(String(req.query.max               ?? "5"), 10);

  const intensity      = isNaN(intensityRaw) ? 0.6 : Math.min(1, Math.max(0, intensityRaw));
  const variationLevel = isNaN(variationRaw) ? 0.3 : Math.min(1, Math.max(0, variationRaw));
  const maxSuggestions = isNaN(maxRaw)       ? 5   : Math.min(10, Math.max(1, maxRaw));

  const { data: track } = await supabase
    .from("tracks")
    .select("id, subgenre")
    .eq("id", id)
    .maybeSingle();

  if (!track) { res.status(404).json({ error: "Track not found" }); return; }

  const { data: evaluation } = await supabase
    .from("evaluations")
    .select("groove_clarity_score, composite_score")
    .eq("track_id", id)
    .order("composite_score", { ascending: false })
    .limit(1)
    .maybeSingle();

  const suggestions = suggestGroove(track.subgenre as Lane, {
    grooveClarityScore: evaluation?.groove_clarity_score ?? undefined,
    compositeScore:     evaluation?.composite_score     ?? undefined,
    intensity,
    variationLevel,
    maxSuggestions,
  });

  res.json({ track_id: id, lane: track.subgenre, suggestions });
});

// GET /api/tracks/:id/melody
// Query: ?bars=1-32 &density=0-1 &register=low|mid|high &style=stepwise|arpeggiated|mixed
// Returns a downloadable .mid binary with a pentatonic melody derived from the track's key and lane.
router.get("/:id/melody", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const barsParsed    = parseInt(String(req.query.bars     ?? "4"), 10);
  const densityParsed = parseFloat(String(req.query.density  ?? "0.5"));
  const registerRaw   = String(req.query.register ?? "mid");
  const styleRaw      = String(req.query.style    ?? "mixed");

  const bars     = Math.min(32, Math.max(1, isNaN(barsParsed)    ? 4   : barsParsed));
  const density  = Math.min(1,  Math.max(0, isNaN(densityParsed) ? 0.5 : densityParsed));
  const register = (["low", "mid", "high"] as const).includes(registerRaw as "low" | "mid" | "high")
    ? (registerRaw as "low" | "mid" | "high") : "mid";
  const style    = (["stepwise", "arpeggiated", "mixed"] as const).includes(styleRaw as "stepwise" | "arpeggiated" | "mixed")
    ? (styleRaw as "stepwise" | "arpeggiated" | "mixed") : "mixed";

  const { data: track } = await supabase
    .from("tracks")
    .select("id, title, subgenre, bpm, key")
    .eq("id", id)
    .maybeSingle();

  if (!track) { res.status(404).json({ error: "Track not found" }); return; }

  const trackKey = (track.key as string | null) ?? "C";

  const plan   = planMelody(track.subgenre as Lane, trackKey, track.bpm as number, { bars, density, register, style });
  const result = exportMelodyToMidi(plan);

  const safeTitle = String(track.title ?? id).replace(/[^a-zA-Z0-9_-]/g, "_");
  res.setHeader("Content-Type", "audio/midi");
  res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}_melody.mid"`);
  res.setHeader("Content-Length", result.buffer.length);
  res.send(result.buffer);
});

export default router;

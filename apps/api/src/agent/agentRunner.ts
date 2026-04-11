import axios from "axios";
import { CTLv1 } from "@aura-x/ctl";
import {
  applyHarmonyPlan,
  applyGroovePlan,
  applyInstrumentationPlan,
  evaluateSignal,
  ObservedFeatures,
} from "@aura-x/ac-ami";
import {
  privateSchoolPreset,
  bacardiPreset,
  sgijaPreset,
  stixxSgijaPreset,
  mbiraianoPreset,
  gqomFusionPreset,
  hybridRnbPreset,
} from "@aura-x/ctl";
import { runRevisionLoop } from "./revisionLoop";
import { storeResult } from "./resultsStore";
import { supabase } from "../lib/supabase";

export type AgentGoal = {
  title: string;
  subgenre: string;
  bpm?: number;
  key?: string;
  emotional_profile?: string;
  generation_mode?: "mode_1_suno" | "mode_2_musicgen" | "mode_3_suno_api";
  created_by: string;
};

export type AgentRunResult = {
  status: "complete" | "partial" | "failed";
  track_id: string;
  generation_id?: string;
  ctl: CTLv1;
  validation_passed: boolean;
  composite_score: number;
  signal_composite_score?: number;
  passed_signal_gate?: boolean;
  iterations_run: number;
  mutations_applied: number;
  suno_bundle?: {
    style_prompt: string;
    lyrics_prompt: string;
  };
  agent_log: string[];
};

// ─── PRESET SELECTOR ─────────────────────────────────────────────────────────

const PRESET_MAP: Record<string, CTLv1> = {
  private_school:      privateSchoolPreset,
  bacardi:             bacardiPreset,
  sgija:               sgijaPreset,
  stixx_sgija:         stixxSgijaPreset,
  mbiraiano:           mbiraianoPreset,
  gqom_fusion:         gqomFusionPreset,
  hybrid_rnb_amapiano: hybridRnbPreset,
};

function selectPreset(subgenre: string, overrides: Partial<AgentGoal>): CTLv1 {
  const base = PRESET_MAP[subgenre] ?? privateSchoolPreset;

  return {
    ...base,
    global: {
      ...base.global,
      title:             overrides.title             ?? base.global.title,
      bpm:               overrides.bpm               ?? base.global.bpm,
      key:               overrides.key               ?? base.global.key,
      emotional_profile: overrides.emotional_profile ?? base.global.emotional_profile,
      generation_mode:   overrides.generation_mode   ?? base.global.generation_mode,
      created_by:        overrides.created_by        ?? base.global.created_by,
      created_at:        new Date().toISOString(),
    },
  };
}

// ─── MAIN AGENT RUNNER ───────────────────────────────────────────────────────

export async function runAgent(goal: AgentGoal): Promise<AgentRunResult> {
  const agentLog: string[] = [];
  agentLog.push(`[agent] Goal received: ${goal.subgenre} — "${goal.title}"`);

  // ─── 1. Create track record ───────────────────────
  const { data: trackData, error: trackError } = await supabase
    .from("tracks")
    .insert({
      title:           goal.title,
      subgenre:        goal.subgenre,
      bpm:             goal.bpm ?? 110,
      key:             goal.key ?? "F#m",
      generation_mode: goal.generation_mode ?? "mode_1_suno",
      created_by:      goal.created_by,
      status:          "draft",
    })
    .select("id")
    .single();

  if (trackError || !trackData) {
    return {
      status: "failed",
      track_id: "unknown",
      ctl: {} as CTLv1,
      validation_passed: false,
      composite_score: 0,
      iterations_run: 0,
      mutations_applied: 0,
      agent_log: [...agentLog, `[agent] ERROR: Failed to create track record`],
    };
  }

  const track_id = trackData.id;
  agentLog.push(`[agent] Track created: ${track_id}`);

  // ─── 2. Select and plan CTL ───────────────────────
  let ctl = selectPreset(goal.subgenre, goal);
  agentLog.push(`[agent] Preset selected: ${goal.subgenre}`);

  ctl = applyHarmonyPlan(ctl);
  ctl = applyGroovePlan(ctl);
  ctl = applyInstrumentationPlan(ctl);
  agentLog.push(`[agent] Planners applied: harmony + groove + instrumentation`);

  // ─── 3. Write CTL record ──────────────────────────
  const { data: ctlData, error: ctlError } = await supabase
    .from("ctls")
    .insert({
      track_id,
      version:   1,
      ctl_json:  ctl as unknown as Record<string, unknown>,
      is_active: true,
    })
    .select("id")
    .single();

  if (ctlError || !ctlData) {
    agentLog.push(`[agent] WARNING: Could not write CTL record`);
  }

  const ctl_id = ctlData?.id ?? "unknown";

  // ─── 4. Run revision loop ─────────────────────────
  agentLog.push(`[agent] Starting revision loop (max 3 iterations)`);

  const revision = await runRevisionLoop({
    track_id,
    ctl_id,
    ctl,
    max_iterations: 3,
  });

  const lastIter = revision.iterations[revision.iterations.length - 1];
  agentLog.push(
    `[agent] Revision complete: ${revision.iterations_run} iterations, ` +
    `passed=${revision.final_passed}, score=${lastIter?.composite_score}`
  );

  // ─── 5. Store result ──────────────────────────────
  const finalCtl = revision.final_ctl;
  const compositeScore = lastIter?.composite_score ?? 0;

  try {
    await storeResult({
      track_id,
      generation_id:    revision.final_generation_id ?? ctl_id,
      ctl_snapshot:     finalCtl,
      composite_score:  compositeScore,
      passed:           revision.final_passed,
      subgenre:         goal.subgenre,
      bpm:              goal.bpm ?? finalCtl.global.bpm,
      key:              goal.key ?? finalCtl.global.key,
      mutations_applied: revision.iterations.flatMap(i => i.mutations_applied),
      iterations_run:   revision.iterations_run,
      notes:            `Agent run: ${goal.title}`,
    });
    agentLog.push(`[agent] Result stored`);
  } catch (e) {
    agentLog.push(`[agent] WARNING: Could not store result: ${e}`);
  }

  // ─── 6. Extract Mode 1 bundle if available ────────
  let sunoBundle: AgentRunResult["suno_bundle"];
  const lastItWithGen = revision.iterations.find(i => i.generation_id);
  if (lastItWithGen?.generation_id) {
    const { data: genData } = await supabase
      .from("generations")
      .select("prompt_style, prompt_lyrics")
      .eq("id", lastItWithGen.generation_id)
      .single();

    if (genData?.prompt_style) {
      sunoBundle = {
        style_prompt:  genData.prompt_style,
        lyrics_prompt: genData.prompt_lyrics ?? "",
      };
      agentLog.push(`[agent] Mode 1 bundle retrieved`);
    }
  }

  // ─── 7. Update track status ───────────────────────
  await supabase.from("tracks").update({
    status:     revision.final_passed ? "produced" : "draft",
    updated_at: new Date().toISOString(),
  }).eq("id", track_id);

  // ─── 8. Signal evaluation (audio → CTL gap) ───────
  let signalCompositeScore: number | undefined;
  let passedSignalGate: boolean | undefined;

  try {
    const AUDIO_SERVICE = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";
    const analysisRes = await axios.post<ObservedFeatures>(
      `${AUDIO_SERVICE}/analysis/analyze`,
      { track_id, generation_id: revision.final_generation_id },
      { timeout: 10_000 },
    );
    const observed = analysisRes.data;
    const signalResult = evaluateSignal(finalCtl, observed);
    signalCompositeScore = signalResult.signal_composite_score;
    passedSignalGate     = signalResult.passed_signal_gate;

    agentLog.push(
      `[agent] Signal eval: score=${signalResult.signal_composite_score}, ` +
      `gate=${signalResult.passed_signal_gate}` +
      (signalResult.signal_notes.length > 0
        ? `, notes: ${signalResult.signal_notes.join(" | ")}`
        : "")
    );
  } catch {
    agentLog.push(`[agent] Signal eval skipped (audio service unavailable)`);
  }

  agentLog.push(`[agent] ✓ Complete`);

  return {
    status: revision.final_passed ? "complete" : "partial",
    track_id,
    generation_id: revision.final_generation_id,
    ctl: finalCtl,
    validation_passed:     revision.final_passed,
    composite_score:       compositeScore,
    signal_composite_score: signalCompositeScore,
    passed_signal_gate:    passedSignalGate,
    iterations_run:        revision.iterations_run,
    mutations_applied:     revision.total_mutations_applied,
    suno_bundle:           sunoBundle,
    agent_log:             agentLog,
  };
}

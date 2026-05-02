import axios from "axios";
import { supabase } from "../../lib/supabase";
import {
  applyHarmonyPlan,
  applyGroovePlan,
  applyInstrumentationPlan,
  evaluateSignal,
  ObservedFeatures,
} from "@aura-x/ac-ami";
import type { CTLv1 } from "@aura-x/ctl";
import { synthesizeCtlFromGoal, optimizeCTLForHarmonicState } from "@aura-x/engine";
import type { Lane } from "@aura-x/engine";
import { runRevisionLoop } from "../../agent/revisionLoop";
import { storeResult } from "../../agent/resultsStore";

const AUDIO_SERVICE = process.env.AUDIO_SERVICE_URL ?? "http://localhost:8000";

// ─── I/O types ────────────────────────────────────────────────────────────────

export type AgentGoalInput = {
  title: string;
  subgenre: string;
  bpm?: number;
  key?: string;
  emotional_profile?: string;
  generation_mode?: "mode_1_suno" | "mode_2_musicgen" | "mode_3_suno_api";
  created_by: string;
};

export type BuildCtlResult = {
  ctl: CTLv1;
  ctl_id: string;
};

export type RevisionResult = {
  track_id: string;
  final_ctl: CTLv1;
  final_passed: boolean;
  iterations_run: number;
  iterations: Array<{
    iteration: number;
    validation_passed: boolean;
    issue_count: number;
    mutations_applied: string[];
    generation_id?: string;
    composite_score: number;
  }>;
  final_generation_id?: string;
  total_mutations_applied: number;
};

export type SunoBundle = {
  style_prompt: string;
  lyrics_prompt: string;
};

export type SignalEvalResult = {
  signal_composite_score: number;
  passed_signal_gate: boolean;
  signal_notes: string[];
};


// ─── Activity implementations ─────────────────────────────────────────────────

export type AgentActivities = typeof agentActivities;

export const agentActivities = {

  async createTrack(goal: AgentGoalInput): Promise<{ track_id: string }> {
    const { data, error } = await supabase
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

    if (error || !data) {
      throw new Error(`Failed to create track: ${error?.message}`);
    }
    return { track_id: data.id };
  },

  async buildCtl(input: { track_id: string; goal: AgentGoalInput }): Promise<BuildCtlResult> {
    const { track_id, goal } = input;

    // ── 1. Try Python intelligence engine first ────────────────────────────────
    let ctl: CTLv1;
    const { ctlFromGoal } = await import("../../lib/auraEngine");
    const engineResult = await ctlFromGoal({
      title:             goal.title,
      subgenre:          goal.subgenre,
      bpm:               goal.bpm,
      key:               goal.key,
      emotional_profile: goal.emotional_profile,
      created_by:        goal.created_by,
      generation_mode:   goal.generation_mode,
    });

    if (engineResult) {
      ctl = engineResult.ctl as CTLv1;
      console.log(
        `[buildCtl] Engine CTL: lane=${ctl.global?.subgenre} ` +
        `source=${engineResult.generation_source} quality=${engineResult.quality_score}`
      );
    } else {
      // Fallback: TypeScript synthesizeCtlFromGoal
      ctl = synthesizeCtlFromGoal({
        title:            goal.title,
        subgenre:         goal.subgenre as Lane,
        bpm:              goal.bpm,
        key:              goal.key,
        emotionalProfile: goal.emotional_profile,
        createdBy:        goal.created_by,
      });
      console.log(`[buildCtl] TypeScript fallback CTL: lane=${ctl.global?.subgenre}`);
    }

    // ── 2. Stamp timestamps and generation mode ────────────────────────────────
    ctl = {
      ...ctl,
      global: {
        ...ctl.global,
        generation_mode: goal.generation_mode ?? ctl.global.generation_mode,
        created_at:      new Date().toISOString(),
      },
    };

    // ── 3. Perception optimizer (TypeScript C1/C2/C3 guarantee layer) ──────────
    const perceptResult = optimizeCTLForHarmonicState(ctl);
    ctl = perceptResult.ctl;

    // ── 4. AC-AMI enrichment (harmony, groove, instrumentation) ───────────────
    ctl = applyHarmonyPlan(ctl);
    ctl = applyGroovePlan(ctl);
    ctl = applyInstrumentationPlan(ctl);

    const { data: ctlData } = await supabase
      .from("ctls")
      .insert({
        track_id,
        version:   1,
        ctl_json:  ctl as unknown as Record<string, unknown>,
        is_active: true,
      })
      .select("id")
      .single();

    return { ctl, ctl_id: ctlData?.id ?? "unknown" };
  },

  async runAgentRevision(input: {
    track_id: string;
    ctl_id: string;
    ctl: CTLv1;
  }): Promise<RevisionResult> {
    return runRevisionLoop({
      track_id:       input.track_id,
      ctl_id:         input.ctl_id,
      ctl:            input.ctl,
      max_iterations: 3,
    }) as Promise<RevisionResult>;
  },

  async storeAgentResult(input: {
    track_id: string;
    generation_id: string;
    ctl_snapshot: CTLv1;
    composite_score: number;
    passed: boolean;
    subgenre: string;
    bpm: number;
    key: string;
    mutations_applied: string[];
    iterations_run: number;
  }): Promise<void> {
    await storeResult({
      track_id:          input.track_id,
      generation_id:     input.generation_id,
      ctl_snapshot:      input.ctl_snapshot,
      composite_score:   input.composite_score,
      passed:            input.passed,
      subgenre:          input.subgenre,
      bpm:               input.bpm,
      key:               input.key,
      mutations_applied: input.mutations_applied,
      iterations_run:    input.iterations_run,
      notes:             "Agent workflow run",
    });
  },

  async extractSunoBundle(input: { generation_id: string }): Promise<SunoBundle | null> {
    const { data } = await supabase
      .from("generations")
      .select("prompt_style, prompt_lyrics")
      .eq("id", input.generation_id)
      .single();

    if (!data?.prompt_style) return null;
    return {
      style_prompt:  data.prompt_style,
      lyrics_prompt: data.prompt_lyrics ?? "",
    };
  },

  async updateTrackStatus(input: { track_id: string; passed: boolean }): Promise<void> {
    await supabase.from("tracks").update({
      status:     input.passed ? "produced" : "draft",
      updated_at: new Date().toISOString(),
    }).eq("id", input.track_id);
  },

  async runSignalEval(input: {
    track_id: string;
    generation_id: string;
    ctl: CTLv1;
  }): Promise<SignalEvalResult | null> {
    try {
      const { data: observed } = await axios.post<ObservedFeatures>(
        `${AUDIO_SERVICE}/analysis/analyze`,
        { track_id: input.track_id, generation_id: input.generation_id },
        { timeout: 10_000 },
      );
      const result = evaluateSignal(input.ctl, observed);
      return {
        signal_composite_score: result.signal_composite_score,
        passed_signal_gate:     result.passed_signal_gate,
        signal_notes:           result.signal_notes,
      };
    } catch {
      return null;
    }
  },
};

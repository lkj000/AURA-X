import { Router, Request, Response } from "express";
import { CTLv1Schema } from "@aura-x/ctl";
import { validateAll, recommendMutations, evaluateSignal } from "@aura-x/ac-ami";
import { supabase } from "../lib/supabase";

const router = Router();

// POST /api/evaluate
// Body: { generation_id, track_id, ctl }
// Runs CTL validation + mutation recommendations, writes to evaluations table
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { generation_id, track_id } = req.body;

  if (!generation_id || !track_id) {
    res.status(400).json({ error: "generation_id and track_id are required" });
    return;
  }

  const parsedCtl = CTLv1Schema.safeParse(req.body.ctl);
  if (!parsedCtl.success) {
    res.status(400).json({ error: "Invalid CTL", issues: parsedCtl.error.issues });
    return;
  }

  const ctl = parsedCtl.data;

  // ─── Run AC-AMI validators ────────────────────────────────────────────────
  const validation = validateAll(ctl);
  const mutations = recommendMutations(validation.issues);

  // ─── Compute composite score ──────────────────────────────────────────────
  // passed = 1.0, each error reduces by 0.15, each warning by 0.05
  const errorCount   = validation.issues.filter(i => i.severity === "error").length;
  const warningCount = validation.issues.filter(i => i.severity === "warning").length;
  const compositeScore = Math.max(
    0,
    1.0 - (errorCount * 0.15) - (warningCount * 0.05)
  );

  // ─── Write evaluation record ──────────────────────────────────────────────
  const evalRecord = {
    track_id,
    generation_id,
    evaluator: "auto",
    passed_gate: validation.passed,
    revision_needed: !validation.passed,
    revision_notes: mutations.length > 0
      ? `Recommended mutations: ${mutations.join(", ")}`
      : null,
    composite_score: parseFloat(compositeScore.toFixed(3)),
    authenticity_score:        ctl.evaluation_targets.authenticity_target,
    groove_clarity_score:      ctl.evaluation_targets.groove_clarity_target,
    harmonic_density_score:    ctl.evaluation_targets.harmonic_density_target,
    dj_mix_friendliness_score: ctl.evaluation_targets.dj_mix_friendliness_target,
    cultural_lineage_coherence: ctl.evaluation_targets.cultural_lineage_coherence,
    raw_features: {
      validation_issues: validation.issues,
      recommended_mutations: mutations,
    },
  };

  const { data: evalData, error: evalError } = await supabase
    .from("evaluations")
    .insert(evalRecord)
    .select("id")
    .single();

  if (evalError) {
    res.status(500).json({ error: "Failed to write evaluation record" });
    return;
  }

  res.json({
    evaluation_id: evalData.id,
    generation_id,
    track_id,
    passed: validation.passed,
    composite_score: compositeScore,
    issue_count: validation.issues.length,
    error_count: errorCount,
    warning_count: warningCount,
    issues: validation.issues,
    recommended_mutations: mutations,
    revision_needed: !validation.passed,
  });
});

// POST /api/evaluate/signal
// Body: { track_id, generation_id, ctl, observed_features }
// Runs audio signal evaluation against CTL intent, writes signal scores to evaluations
router.post("/signal", async (req: Request, res: Response): Promise<void> => {
  const { track_id, generation_id, observed_features } = req.body;

  if (!track_id || !generation_id || !observed_features) {
    res.status(400).json({ error: "track_id, generation_id, and observed_features are required" });
    return;
  }

  const parsedCtl = CTLv1Schema.safeParse(req.body.ctl);
  if (!parsedCtl.success) {
    res.status(400).json({ error: "Invalid CTL", issues: parsedCtl.error.issues });
    return;
  }

  const ctl = parsedCtl.data;
  const signalResult = evaluateSignal(ctl, observed_features);

  // Write signal eval as a separate evaluation record
  const evalRecord = {
    track_id,
    generation_id,
    evaluator: "signal",
    passed_gate: signalResult.passed_signal_gate,
    revision_needed: !signalResult.passed_signal_gate,
    revision_notes: signalResult.signal_notes.length > 0
      ? signalResult.signal_notes.join("; ")
      : null,
    composite_score: signalResult.signal_composite_score,
    authenticity_score: signalResult.energy_accuracy,
    raw_features: {
      bpm_accuracy:          signalResult.bpm_accuracy,
      key_accuracy:          signalResult.key_accuracy,
      energy_accuracy:       signalResult.energy_accuracy,
      groove_density_score:  signalResult.groove_density_score,
      cultural_signal_score: signalResult.cultural_signal_score,
      bpm_gap:               signalResult.bpm_gap,
      key_match:             signalResult.key_match,
      energy_gap:            signalResult.energy_gap,
      signal_notes:          signalResult.signal_notes,
      observed_features,
    },
  };

  const { data: evalData, error: evalError } = await supabase
    .from("evaluations")
    .insert(evalRecord)
    .select("id")
    .single();

  if (evalError) {
    res.status(500).json({ error: "Failed to write signal evaluation record" });
    return;
  }

  res.json({
    evaluation_id: evalData.id,
    generation_id,
    track_id,
    ...signalResult,
  });
});

// GET /api/evaluate/:generationId
// Returns evaluation history for a generation
router.get(
  "/:generationId",
  async (req: Request, res: Response): Promise<void> => {
    const { generationId } = req.params;

    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("generation_id", generationId)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: "Failed to fetch evaluations" });
      return;
    }

    res.json({
      generation_id: generationId,
      evaluations: data ?? [],
      count: (data ?? []).length,
    });
  }
);

export default router;

"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  agentRun,
  pollWorkflowStatus,
  generateVideo,
  submitFeedback,
  type WorkflowStartResult,
  type WorkflowPollResult,
  type VideoGenerationResult,
  type FeedbackResult,
} from "@/lib/api";
import { SUBGENRES, SUBGENRE_LABELS, KEYS, SUBGENRE_DEFAULT_KEYS, SUBGENRE_DEFAULT_BPM, fmt, scoreColor, cn } from "@/lib/utils";

const EMOTIONAL_PROFILES = [
  "melancholic longing",
  "euphoric celebration",
  "late night introspection",
  "spiritual elevation",
  "community joy",
  "romantic tension",
  "ancestral reverence",
];

const TERMINAL_STATUSES = new Set([
  "completed", "failed", "incompatible", "degraded",
  "terminated", "timed_out", "cancelled", "not_found",
]);

// ─── History entry ────────────────────────────────────────────────────────────

interface HistoryEntry {
  workflow_id: string;
  status: WorkflowPollResult["status"] | "started";
  timestamp: number;
  poll?: WorkflowPollResult;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    running:    "bg-blue-500/20 text-blue-400 border-blue-800",
    completed:  "bg-emerald-500/20 text-emerald-400 border-emerald-800",
    degraded:   "bg-yellow-500/20 text-yellow-400 border-yellow-800",
    incompatible: "bg-red-500/20 text-red-400 border-red-800",
    failed:     "bg-red-500/20 text-red-400 border-red-800",
    terminated: "bg-red-500/20 text-red-400 border-red-800",
    timed_out:  "bg-red-500/20 text-red-400 border-red-800",
    cancelled:  "bg-zinc-500/20 text-zinc-400 border-zinc-700",
    not_found:  "bg-zinc-500/20 text-zinc-400 border-zinc-700",
    started:    "bg-blue-500/20 text-blue-400 border-blue-800",
  };
  const labels: Record<string, string> = {
    running: "Running",
    completed: "Complete",
    degraded: "Degraded",
    incompatible: "Incompatible BPM",
    failed: "Failed",
    terminated: "Terminated",
    timed_out: "Timed Out",
    cancelled: "Cancelled",
    not_found: "Not Found",
    started: "Starting",
  };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", cfg[status] ?? cfg.failed)}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Generation status panel ──────────────────────────────────────────────────

function GenerationStatusPanel({
  poll,
  elapsed,
  workflowId,
  onRetry,
}: {
  poll: WorkflowPollResult | null;
  elapsed: number;
  workflowId: string;
  onRetry: () => void;
}) {
  const status = poll?.status ?? "running";
  const shortId = workflowId.slice(-12);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <span className="text-xs text-zinc-500 font-mono">…{shortId}</span>
        </div>
        {status === "running" && (
          <span className="text-xs text-zinc-500">{elapsed}s</span>
        )}
      </div>

      {/* Running */}
      {status === "running" && (
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <span className="text-sm text-zinc-400">Generating… polling every 3s</span>
        </div>
      )}

      {/* Completed */}
      {status === "completed" && poll?.result && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className={cn("font-medium", poll.result.validation_passed ? "text-emerald-400" : "text-red-400")}>
              {poll.result.validation_passed ? "✓ Validation passed" : "✗ Validation failed"}
            </span>
            <span className="text-zinc-400">
              Score:{" "}
              <span className={scoreColor(poll.result.composite_score)}>
                {fmt(poll.result.composite_score)}
              </span>
            </span>
            <span className="text-zinc-400">
              {poll.result.iterations_run} iteration{poll.result.iterations_run !== 1 ? "s" : ""}
            </span>
            <span className="text-zinc-400">
              {poll.result.mutations_applied} mutation{poll.result.mutations_applied !== 1 ? "s" : ""}
            </span>
          </div>
          {poll.result.signal_composite_score !== undefined && (
            <p className="text-xs text-zinc-500">
              Signal score:{" "}
              <span className={scoreColor(poll.result.signal_composite_score)}>
                {fmt(poll.result.signal_composite_score)}
              </span>
              {poll.result.passed_signal_gate !== undefined && (
                <span className="ml-2">
                  {poll.result.passed_signal_gate ? "✓ gate passed" : "✗ gate failed"}
                </span>
              )}
            </p>
          )}
          {poll.result.suno_bundle && (
            <details className="rounded-lg border border-zinc-700">
              <summary className="px-4 py-2 text-xs text-zinc-400 cursor-pointer hover:text-white">
                Suno bundle
              </summary>
              <div className="px-4 pb-4 pt-2 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">Style prompt</p>
                  <pre className="text-xs text-zinc-300 bg-zinc-800 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                    {poll.result.suno_bundle.style_prompt}
                  </pre>
                </div>
                {poll.result.suno_bundle.lyrics_prompt && (
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">Lyrics prompt</p>
                    <pre className="text-xs text-zinc-300 bg-zinc-800 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                      {poll.result.suno_bundle.lyrics_prompt}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Degraded */}
      {status === "degraded" && (
        <div className="space-y-3">
          <p className="text-sm text-yellow-400">
            Output did not meet Amapiano quality threshold
          </p>
          {poll?.contrast_score !== undefined && (
            <p className="text-xs text-zinc-400">
              Contrast score:{" "}
              <span className="text-yellow-400">{fmt(poll.contrast_score)}</span>
              {" "}(threshold: 60%)
            </p>
          )}
          <button
            onClick={onRetry}
            className="px-4 py-1.5 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Incompatible */}
      {status === "incompatible" && (
        <div className="space-y-3">
          <p className="text-sm text-red-400">{poll?.error ?? "BPM has no Amapiano path"}</p>
          <p className="text-xs text-zinc-500">
            Valid Amapiano range: <span className="text-zinc-300">104–116 BPM</span>
          </p>
          <button
            onClick={onRetry}
            className="px-4 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs font-medium transition-colors"
          >
            Retry with valid BPM
          </button>
        </div>
      )}

      {/* Failed / terminated / timed_out / cancelled */}
      {(status === "failed" || status === "terminated" ||
        status === "timed_out" || status === "cancelled") && (
        <div className="space-y-3">
          {poll?.error && (
            <p className="text-sm text-red-400 break-words">{poll.error}</p>
          )}
          <button
            onClick={onRetry}
            className="px-4 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Rating panel ────────────────────────────────────────────────────────────

function RatingPanel({
  trackId,
  generationId,
  ctlSnapshot,
  compositeScore,
  subgenre,
  bpm,
  musicalKey,
}: {
  trackId: string;
  generationId: string;
  ctlSnapshot?: Record<string, unknown>;
  compositeScore?: number;
  subgenre?: string;
  bpm?: number;
  musicalKey?: string;
}) {
  const [rating, setRating]         = useState<number | null>(null);
  const [hover, setHover]           = useState<number | null>(null);
  const [cultural, setCultural]     = useState<number | null>(null);
  const [notes, setNotes]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<FeedbackResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-5">
        <p className="text-sm font-medium text-emerald-400">
          {result.promoted_to_gold ? "Promoted to gold standard" : "Feedback saved"}
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          {result.promoted_to_gold
            ? "This generation will be used to fine-tune the model."
            : "Rating recorded. Needs score ≥ 4 + CTL snapshot to promote."}
        </p>
      </div>
    );
  }

  async function handleSubmit() {
    if (!rating) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitFeedback({
        track_id: trackId,
        generation_id: generationId,
        rating,
        subgenre_notes: notes || undefined,
        cultural_accuracy: cultural ?? undefined,
        ctl_snapshot: ctlSnapshot,
        composite_score: compositeScore,
        subgenre: subgenre,
        bpm: bpm,
        key: musicalKey,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feedback failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <p className="text-sm font-medium text-white">Rate this generation</p>

      {/* Star rating */}
      <div className="space-y-1">
        <p className="text-xs text-zinc-500">Overall quality</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(null)}
              className="text-2xl leading-none transition-colors"
            >
              <span className={(hover ?? rating ?? 0) >= star ? "text-yellow-400" : "text-zinc-700"}>
                ★
              </span>
            </button>
          ))}
          {rating && (
            <span className="ml-2 text-xs text-zinc-500 self-center">
              {["", "Poor", "Below average", "Average", "Good", "Excellent"][rating]}
            </span>
          )}
        </div>
      </div>

      {/* Cultural accuracy */}
      <div className="space-y-1">
        <p className="text-xs text-zinc-500">Cultural accuracy (optional)</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setCultural(cultural === star ? null : star)}
              className="text-xl leading-none transition-colors"
            >
              <span className={(cultural ?? 0) >= star ? "text-violet-400" : "text-zinc-700"}>
                ★
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <p className="text-xs text-zinc-500">Subgenre notes (optional)</p>
        <textarea
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
          placeholder="e.g. log drum a bit weak, piano chords feel authentic…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!rating || submitting}
        className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {submitting ? "Saving…" : "Submit rating"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [form, setForm] = useState({
    title: "",
    subgenre: "private_school",
    bpm: String(SUBGENRE_DEFAULT_BPM["private_school"]),
    key: SUBGENRE_DEFAULT_KEYS["private_school"],
    emotional_profile: "late night introspection",
    created_by: "producer",
  });

  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);
  const [workflowId, setWorkflowId]     = useState<string | null>(null);
  const [poll, setPoll]                 = useState<WorkflowPollResult | null>(null);
  const [elapsed, setElapsed]           = useState(0);
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [activeHistory, setActiveHistory] = useState<HistoryEntry | null>(null);

  // Video state (preserved from Phase 1)
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult]   = useState<VideoGenerationResult | null>(null);
  const [videoError, setVideoError]     = useState<string | null>(null);
  const [audioFile, setAudioFile]       = useState<File | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError]     = useState<string | null>(null);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current)   { clearInterval(pollRef.current);   pollRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }, []);

  const startPolling = useCallback((wfId: string) => {
    stopPolling();
    setElapsed(0);

    elapsedRef.current = setInterval(() => setElapsed((n) => n + 1), 1000);

    const doPoll = async () => {
      try {
        const result = await pollWorkflowStatus(wfId);
        setPoll(result);
        setHistory((prev) => {
          const updated = prev.map((h) =>
            h.workflow_id === wfId ? { ...h, status: result.status, poll: result } : h
          );
          return updated;
        });
        if (TERMINAL_STATUSES.has(result.status)) {
          stopPolling();
        }
      } catch {
        // Network error — keep polling
      }
    };

    doPoll();
    pollRef.current = setInterval(doPoll, 3000);
  }, [stopPolling]);

  // Clean up on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  async function handleGenerate() {
    if (!form.title.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setPoll(null);
    setWorkflowId(null);
    setActiveHistory(null);
    stopPolling();

    try {
      const started: WorkflowStartResult = await agentRun({
        title:            form.title,
        subgenre:         form.subgenre,
        bpm:              form.bpm ? Number(form.bpm) : undefined,
        key:              form.key || undefined,
        emotional_profile: form.emotional_profile || undefined,
        generation_mode:  "mode_1_suno",
        created_by:       form.created_by || "producer",
      });

      const wfId = started.workflow_id;
      setWorkflowId(wfId);

      const entry: HistoryEntry = {
        workflow_id: wfId,
        status: "started",
        timestamp: Date.now(),
      };
      setHistory((prev) => [entry, ...prev].slice(0, 5));
      startPolling(wfId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    handleGenerate();
  }

  function loadHistory(entry: HistoryEntry) {
    stopPolling();
    setActiveHistory(entry);
    setWorkflowId(entry.workflow_id);
    if (entry.poll) {
      setPoll(entry.poll);
    } else {
      setPoll(null);
      startPolling(entry.workflow_id);
    }
  }

  // Video helpers (preserved)
  async function handleGenerateVideo() {
    if (!poll?.result?.track_id || !poll?.result?.generation_id) return;
    setVideoLoading(true);
    setVideoError(null);
    setVideoResult(null);
    try {
      const res = await generateVideo({
        track_id:         poll.result.track_id,
        generation_id:    poll.result.generation_id,
        subgenre:         form.subgenre,
        bpm:              Number(form.bpm),
        key:              form.key,
        emotional_profile: form.emotional_profile,
        title:            form.title,
        duration:         5,
        resolution:       "720p",
      });
      setVideoResult(res);
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Video generation failed");
    } finally {
      setVideoLoading(false);
    }
  }

  async function handleMerge() {
    if (!videoResult?.video_url || !audioFile) return;
    setMergeLoading(true);
    setMergeError(null);
    setMergedVideoUrl(null);
    try {
      const fd = new FormData();
      fd.append("video_url", videoResult.video_url);
      fd.append("audio", audioFile, audioFile.name);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003"}/api/video/merge`,
        { method: "POST", body: fd }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
      }
      const blob = await res.blob();
      setMergedVideoUrl(URL.createObjectURL(blob));
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMergeLoading(false);
    }
  }

  const displayPoll = activeHistory?.poll ?? poll;
  const displayWfId = activeHistory?.workflow_id ?? workflowId;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Generate</h1>
        <p className="text-zinc-400 text-sm mt-1">
          AC-AMI builds the CTL, runs the revision loop, evaluates against the signal gate.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Track title</label>
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
            placeholder="e.g. Johannesburg Rain"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Subgenre</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              value={form.subgenre}
              onChange={(e) => {
                const s = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  subgenre: s,
                  key: SUBGENRE_DEFAULT_KEYS[s] ?? prev.key,
                  bpm: String(SUBGENRE_DEFAULT_BPM[s] ?? prev.bpm),
                }));
              }}
            >
              {SUBGENRES.map((s) => (
                <option key={s} value={s}>{SUBGENRE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Key</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            >
              {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">BPM (95–130)</label>
            <input
              type="number"
              min={95}
              max={130}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              value={form.bpm}
              onChange={(e) => setForm({ ...form, bpm: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Emotional profile</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              value={form.emotional_profile}
              onChange={(e) => setForm({ ...form, emotional_profile: e.target.value })}
            >
              {EMOTIONAL_PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={submitting || !form.title.trim()}
          className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {submitting ? "Starting…" : "Generate track"}
        </button>
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-sm text-red-400">
          {submitError}
        </div>
      )}

      {/* Generation status panel */}
      {displayWfId && (
        <GenerationStatusPanel
          poll={displayPoll}
          elapsed={elapsed}
          workflowId={displayWfId}
          onRetry={handleRetry}
        />
      )}

      {/* Producer rating — only show once completed with a generation_id */}
      {displayPoll?.status === "completed" && displayPoll.result?.generation_id && (
        <RatingPanel
          trackId={displayPoll.result.track_id}
          generationId={displayPoll.result.generation_id}
          ctlSnapshot={displayPoll.result.ctl as Record<string, unknown>}
          compositeScore={displayPoll.result.composite_score}
          subgenre={form.subgenre}
          bpm={Number(form.bpm)}
          musicalKey={form.key}
        />
      )}

      {/* Video generation — only show once completed with a generation_id */}
      {displayPoll?.status === "completed" && displayPoll.result?.generation_id && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Music video</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Seedance 2.0 · ByteDance · native audio · 720p · 16:9
              </p>
            </div>
            <button
              onClick={handleGenerateVideo}
              disabled={videoLoading}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
            >
              {videoLoading ? "Generating…" : "Generate video"}
            </button>
          </div>

          {videoError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-xs text-red-400">
              {videoError}
            </div>
          )}

          {videoLoading && (
            <div className="rounded-lg bg-zinc-800 p-4 text-xs text-zinc-400 space-y-1">
              <p>Running Seedance 2.0 on Replicate…</p>
              <p className="text-zinc-600">Video generation typically takes 60–120 seconds.</p>
            </div>
          )}

          {videoResult && (
            <div className="space-y-3">
              {videoResult.status === "complete" && videoResult.video_url ? (
                <video
                  src={videoResult.video_url}
                  controls
                  autoPlay
                  loop
                  muted
                  className="w-full rounded-lg border border-zinc-700"
                />
              ) : (
                <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-xs text-red-400">
                  Video generation failed: {videoResult.error ?? "unknown error"}
                </div>
              )}
              <details>
                <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">
                  Visual prompt
                </summary>
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  {videoResult.visual_prompt}
                </p>
              </details>

              <div className="border-t border-zinc-800 pt-4 space-y-3">
                <p className="text-xs text-zinc-400 font-medium">Merge Suno audio</p>
                <p className="text-xs text-zinc-600">Upload the MP3 downloaded from Suno.</p>
                <div className="flex gap-2">
                  <label className="flex-1 flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 cursor-pointer hover:border-zinc-500 transition-colors">
                    <span className="text-xs text-zinc-500">
                      {audioFile ? audioFile.name : "Choose MP3…"}
                    </span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.m4a,.wav"
                      className="hidden"
                      onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    onClick={handleMerge}
                    disabled={mergeLoading || !audioFile}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    {mergeLoading ? "Merging…" : "Merge"}
                  </button>
                </div>
                {mergeError && <p className="text-xs text-red-400">{mergeError}</p>}
                {mergedVideoUrl && (
                  <div className="space-y-2">
                    <video
                      src={mergedVideoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full rounded-lg border border-emerald-800"
                    />
                    <a
                      href={mergedVideoUrl}
                      download="aura-x-merged.mp4"
                      className="block text-center text-xs text-emerald-400 hover:text-emerald-300"
                    >
                      Download merged MP4
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session history */}
      {history.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
            Session history
          </p>
          <div className="space-y-1.5">
            {history.map((entry) => {
              const isActive =
                (activeHistory?.workflow_id ?? workflowId) === entry.workflow_id;
              return (
                <button
                  key={entry.workflow_id}
                  onClick={() => loadHistory(entry)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors text-left",
                    isActive
                      ? "bg-zinc-700 text-white"
                      : "hover:bg-zinc-800 text-zinc-400"
                  )}
                >
                  <span className="font-mono truncate">…{entry.workflow_id.slice(-16)}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge status={entry.status} />
                    <span className="text-zinc-600">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

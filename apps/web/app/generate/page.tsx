"use client";
import { useState } from "react";
import { agentRun, generateVideo, type AgentRunResult, type VideoGenerationResult } from "@/lib/api";
import { SUBGENRES, SUBGENRE_LABELS, KEYS, fmt, scoreColor, cn } from "@/lib/utils";

const EMOTIONAL_PROFILES = [
  "melancholic longing",
  "euphoric celebration",
  "late night introspection",
  "spiritual elevation",
  "community joy",
  "romantic tension",
  "ancestral reverence",
];

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={scoreColor(score)}>{fmt(score)}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            score >= 0.75 ? "bg-emerald-400" : score >= 0.6 ? "bg-yellow-400" : "bg-red-400"
          )}
          style={{ width: `${score * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function GeneratePage() {
  const [form, setForm] = useState({
    title: "",
    subgenre: "private_school",
    bpm: "110",
    key: "F#m",
    emotional_profile: "late night introspection",
    created_by: "producer",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<VideoGenerationResult | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

  async function handleMerge() {
    if (!videoResult?.video_url || !audioFile) return;
    setMergeLoading(true);
    setMergeError(null);
    setMergedVideoUrl(null);
    try {
      const form = new FormData();
      form.append("video_url", videoResult.video_url);
      form.append("audio", audioFile, audioFile.name);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003"}/api/video/merge`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status} ${res.statusText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setMergedVideoUrl(url);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMergeLoading(false);
    }
  }

  async function handleGenerateVideo() {
    if (!result?.track_id || !result?.generation_id) return;
    setVideoLoading(true);
    setVideoError(null);
    setVideoResult(null);
    try {
      const res = await generateVideo({
        track_id: result.track_id,
        generation_id: result.generation_id!,
        subgenre: form.subgenre,
        bpm: Number(form.bpm),
        key: form.key,
        emotional_profile: form.emotional_profile,
        title: form.title,
        duration: 5,
        resolution: "720p",
      });
      setVideoResult(res);
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Video generation failed");
    } finally {
      setVideoLoading(false);
    }
  }

  async function handleGenerate() {
    if (!form.title.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLog([]);

    try {
      const res = await agentRun({
        title: form.title,
        subgenre: form.subgenre,
        bpm: form.bpm ? Number(form.bpm) : undefined,
        key: form.key || undefined,
        emotional_profile: form.emotional_profile || undefined,
        generation_mode: "mode_1_suno",
        created_by: form.created_by || "producer",
      });
      setResult(res);
      setLog(res.agent_log ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  const evals = result
    ? [
        { label: "Authenticity", score: 0 },
        { label: "Subgenre recognizability", score: 0 },
        { label: "Groove clarity", score: 0 },
        { label: "Harmonic density", score: 0 },
        { label: "DJ mix friendliness", score: 0 },
        { label: "Cultural lineage coherence", score: 0 },
      ]
    : [];

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
              onChange={(e) => setForm({ ...form, subgenre: e.target.value })}
            >
              {SUBGENRES.map((s) => (
                <option key={s} value={s}>
                  {SUBGENRE_LABELS[s]}
                </option>
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
              {KEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
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
              {EMOTIONAL_PROFILES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !form.title.trim()}
          className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {loading ? "Generating…" : "Generate track"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Status banner */}
          <div className={cn(
            "rounded-xl border p-4 flex items-center gap-3",
            result.status === "complete"
              ? "border-emerald-800 bg-emerald-950/40"
              : "border-yellow-800 bg-yellow-950/40"
          )}>
            <span className={cn(
              "text-sm font-medium",
              result.status === "complete" ? "text-emerald-400" : "text-yellow-400"
            )}>
              {result.status === "complete" ? "✓ Complete" : "⚠ Partial"}
            </span>
            <span className="text-sm text-zinc-400">
              Composite score:{" "}
              <span className={scoreColor(result.composite_score)}>
                {fmt(result.composite_score)}
              </span>
              {" · "}
              {result.iterations_run} iteration{result.iterations_run !== 1 ? "s" : ""}
              {" · "}
              {result.mutations_applied} mutation{result.mutations_applied !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Signal gate */}
          {result.passed_signal_gate !== undefined && (
            <div className={cn(
              "rounded-lg border px-4 py-2 text-xs",
              result.passed_signal_gate
                ? "border-emerald-800 text-emerald-400"
                : "border-zinc-800 text-zinc-500"
            )}>
              Signal gate: {result.passed_signal_gate ? "passed (≥ 0.68)" : "not evaluated"}
              {result.signal_composite_score !== undefined && (
                <span className="ml-2">{fmt(result.signal_composite_score)}</span>
              )}
            </div>
          )}

          {/* Suno bundle */}
          {result.suno_bundle && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
              <p className="text-sm font-medium text-white">Suno bundle</p>
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Style prompt</p>
                <pre className="text-xs text-zinc-300 bg-zinc-800 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                  {result.suno_bundle.style_prompt}
                </pre>
              </div>
              {result.suno_bundle.lyrics_prompt && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">Lyrics prompt</p>
                  <pre className="text-xs text-zinc-300 bg-zinc-800 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                    {result.suno_bundle.lyrics_prompt}
                  </pre>
                </div>
              )}
              <p className="text-xs text-zinc-600">
                Track ID: <code className="text-zinc-400">{result.track_id}</code>
              </p>
            </div>
          )}

          {/* Agent log */}
          {log.length > 0 && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900">
              <summary className="px-5 py-3 text-sm text-zinc-400 cursor-pointer hover:text-white">
                Agent log ({log.length} entries)
              </summary>
              <div className="px-5 pb-4 space-y-1 max-h-64 overflow-y-auto">
                {log.map((entry, i) => (
                  <p key={i} className="text-xs text-zinc-500 font-mono">{entry}</p>
                ))}
              </div>
            </details>
          )}

          {/* Video generation */}
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
                disabled={videoLoading || !result?.generation_id}
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

                {/* Audio merge */}
                <div className="border-t border-zinc-800 pt-4 space-y-3">
                  <p className="text-xs text-zinc-400 font-medium">Merge Suno audio</p>
                  <p className="text-xs text-zinc-600">
                    Upload the MP3 downloaded from Suno.
                  </p>
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
                  {mergeError && (
                    <p className="text-xs text-red-400">{mergeError}</p>
                  )}
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
        </div>
      )}
    </div>
  );
}

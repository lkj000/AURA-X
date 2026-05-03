"use client";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";

type GateReport = { b_eff: boolean; transient_density: boolean; groove_clarity: boolean };
type Evaluation = Record<string, number>;
type Enhancement = Record<string, unknown>;
type AmapianorizeResult = {
  evaluation: Evaluation;
  enhancement: Enhancement;
  ctl: Record<string, unknown>;
  gates: GateReport;
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-violet-500" : "bg-amber-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={cn("font-mono font-medium", pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-violet-400" : "text-amber-400")}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GatePill({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium",
      pass
        ? "bg-emerald-500/15 text-emerald-400 border-emerald-800"
        : "bg-red-500/15 text-red-400 border-red-800"
    )}>
      {pass ? "✓" : "✗"} {label}
    </span>
  );
}

const SCORE_LABELS: Record<string, string> = {
  quality:     "Overall quality",
  groove:      "Groove strength",
  logDrum:     "Log drum presence",
  harmonic:    "Harmonic density",
  perception:  "Perception score",
  cultural:    "Cultural authenticity",
  composite:   "Composite",
  authenticity:             "Authenticity",
  subgenre_recognizability: "Subgenre recognizability",
  groove_clarity:           "Groove clarity",
  harmonic_density:         "Harmonic density",
  dj_mix_friendliness:      "DJ mix friendliness",
  cultural_lineage:         "Cultural lineage",
};

// Only render fields that are plain 0–1 numeric scores
function isScoreField(key: string, val: unknown): val is number {
  const skip = new Set(["threshold", "lane", "subgenre", "bpm", "swing", "steps"]);
  return typeof val === "number" && val >= 0 && val <= 1 && !skip.has(key);
}

export default function AmapianorizePage() {
  const [file, setFile]         = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<AmapianorizeResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  async function analyse() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("audio", file, file.name);
      const res = await fetch(`${API}/api/amapianorize`, { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      setResult(body as AmapianorizeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const scores = result
    ? Object.entries(result.evaluation).filter(([k, v]) => isScoreField(k, v)) as [string, number][]
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Amapianorizer</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload a WAV file. The engine scores it across 6 Amapiano dimensions and returns an enhancement CTL plan.
        </p>
      </div>

      {/* Upload */}
      <div
        onClick={() => inputRef.current?.click()}
        className={cn(
          "rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
          file ? "border-violet-600 bg-violet-950/20" : "border-zinc-700 hover:border-zinc-500"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/wav,.wav"
          className="hidden"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }}
        />
        {file ? (
          <div className="space-y-1">
            <p className="text-sm text-violet-300 font-medium">{file.name}</p>
            <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(1)} MB · WAV</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-zinc-400">Drop a WAV file or click to browse</p>
            <p className="text-xs text-zinc-600">WAV format required · max 100 MB</p>
          </div>
        )}
      </div>

      <button
        onClick={analyse}
        disabled={!file || loading}
        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
      >
        {loading ? "Analysing…" : "Analyse track"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Quality gates */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <p className="text-sm font-medium text-white">Quality gates</p>
            <div className="flex flex-wrap gap-2">
              <GatePill label="B_eff"           pass={result.gates.b_eff} />
              <GatePill label="Transient density" pass={result.gates.transient_density} />
              <GatePill label="Groove clarity"  pass={result.gates.groove_clarity} />
            </div>
          </div>

          {/* Scores */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Evaluation scores</p>
              <div className="flex gap-3 text-xs text-zinc-500">
                {result.evaluation.lane && (
                  <span>Lane detected: <span className="text-zinc-300">{String(result.evaluation.lane)}</span></span>
                )}
                {typeof result.evaluation.threshold === "number" && (
                  <span>Threshold: <span className="text-zinc-300">{Math.round((result.evaluation.threshold as number) * 100)}%</span></span>
                )}
              </div>
            </div>
            {scores.length === 0 && (
              <p className="text-xs text-zinc-600">No numeric scores returned — track may need re-encoding as WAV.</p>
            )}
            {scores.map(([key, val]) => (
              <ScoreBar key={key} label={SCORE_LABELS[key] ?? key} value={val} />
            ))}
          </div>

          {/* Enhancement */}
          {Object.keys(result.enhancement).length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-2">
              <p className="text-sm font-medium text-white">Enhancement plan</p>
              <pre className="text-xs text-zinc-400 overflow-auto max-h-64 font-mono leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(result.enhancement, null, 2)}
              </pre>
            </div>
          )}

          {/* CTL toggle */}
          <details className="rounded-xl border border-zinc-800 bg-zinc-900">
            <summary className="p-5 text-sm font-medium text-zinc-400 cursor-pointer hover:text-white">
              Generated CTL snapshot
            </summary>
            <pre className="px-5 pb-5 text-xs text-zinc-500 overflow-auto max-h-80 font-mono leading-relaxed whitespace-pre-wrap">
              {JSON.stringify(result.ctl, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

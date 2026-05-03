"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";

// ── Types ──────────────────────────────────────────────────────────────────────

type GateReport = {
  b_eff: boolean;
  transient_density: boolean;
  groove_clarity: boolean;
  all_pass?: boolean;
  bEff_value?: number;
  authenticity_score?: number;
  cultural_score?: number;
  violations?: string[];
};

type Evaluation = {
  authenticity: number;
  laneConfidence: number;
  producerScore: number;
  culturalAlignment: number;
  harmonicCompatibility: number;
  groovePocket: number;
  grooveDensity: number;
  lane: string;
  bpm: number;
  threshold: number;
  issues: string[];
};

type GroovePlan = {
  kickPattern: number[];
  hatPattern: number[];
  shakerPattern: number[];
  logDrumPattern: number[];
  swing: number;
  steps: 16;
};

type RecommendedCtl = {
  lane: string;
  bpm: number;
  bpmTarget?: number;
  bpmDelta?: number;
  swing: number;
  swingDetected?: number;
  logDrum: string;
  quality: string;
  laneDistance?: number | null;
  correctionMode?: string;
};

type Enhancement = {
  recommendedCtl: RecommendedCtl;
  groovePlan: GroovePlan;
  suggestions: string[];
  canAutoEnhance: boolean;
};

type AmapianorizeResult = {
  evaluation: Evaluation;
  enhancement: Enhancement;
  ctl: Record<string, unknown>;
  gates: GateReport;
};

// ── Score bar ──────────────────────────────────────────────────────────────────

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

// ── Gate pill ──────────────────────────────────────────────────────────────────

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

// ── Groove step grid ──────────────────────────────────────────────────────────

const VOICE_CONFIG = [
  { key: "kickPattern",     label: "Kick",     color: "bg-blue-500",    dot: "bg-blue-400"    },
  { key: "logDrumPattern",  label: "Log drum", color: "bg-violet-500",  dot: "bg-violet-400"  },
  { key: "hatPattern",      label: "Hi-hat",   color: "bg-emerald-500", dot: "bg-emerald-400" },
  { key: "shakerPattern",   label: "Shaker",   color: "bg-amber-500",   dot: "bg-amber-400"   },
] as const;

function GrooveGrid({ groovePlan }: { groovePlan: GroovePlan }) {
  return (
    <div className="space-y-2">
      {VOICE_CONFIG.map(({ key, label, color }) => {
        const pattern = groovePlan[key] as number[];
        const activeSteps = pattern.map((v, i) => v ? i : -1).filter((i) => i >= 0);
        return (
          <div key={key} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 w-16 shrink-0 text-right">{label}</span>
              <div className="flex gap-px">
                {Array.from({ length: 16 }, (_, i) => (
                  <div key={i} className={cn(
                    "w-[18px] h-[18px] rounded-sm",
                    i > 0 && i % 4 === 0 ? "ml-1.5" : "",
                    pattern[i] ? color : "bg-zinc-800 border border-zinc-700"
                  )} />
                ))}
              </div>
              <span className="text-xs text-zinc-600 font-mono">
                {activeSteps.length > 0 ? `steps ${activeSteps.map((s) => s + 1).join(", ")}` : "—"}
              </span>
            </div>
          </div>
        );
      })}
      {/* Beat markers */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0" />
        <div className="flex gap-px">
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} className={cn(
              "w-[18px] text-center text-zinc-700 text-[10px] font-mono",
              i > 0 && i % 4 === 0 ? "ml-1.5" : ""
            )}>
              {i % 4 === 0 ? i / 4 + 1 : "·"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Score labels ───────────────────────────────────────────────────────────────

const SCORE_LABELS: Record<string, string> = {
  authenticity:          "Authenticity",
  laneConfidence:        "Lane confidence",
  producerScore:         "Producer quality",
  culturalAlignment:     "Cultural alignment",
  harmonicCompatibility: "Harmonic compatibility",
  groovePocket:          "Groove pocket",
  grooveDensity:         "Groove density",
};

function isScoreField(key: string, val: unknown): val is number {
  const skip = new Set(["threshold", "lane", "subgenre", "bpm", "swing", "steps", "issues"]);
  return typeof val === "number" && val >= 0 && val <= 1 && !skip.has(key);
}

// ── WAV encoder (AudioBuffer → Blob) ──────────────────────────────────────────

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function audioBufferToWavBlob(buf: AudioBuffer): Blob {
  const numSamples = buf.length;
  const sampleRate = buf.sampleRate;
  const ab = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(ab);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, numSamples * 2, true);
  const samples = buf.getChannelData(0);
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

// ── Groove synthesizer (original OfflineAudioContext approach, restored) ──────

function ensureMinHits(pattern: number[], min: number, fallback: number[]): number[] {
  if (pattern.filter(Boolean).length >= min) return pattern;
  const p = [...pattern];
  for (const s of fallback) p[s] = 1;
  return p;
}

async function synthesizeGroove(enhancement: Enhancement): Promise<string> {
  const bpm      = enhancement.recommendedCtl.bpm > 0 ? enhancement.recommendedCtl.bpm : 112;
  const stepSec  = (60 / bpm) / 4;
  const loops    = 8;
  const totalSec = stepSec * 16 * loops;
  const sr       = 44100;

  const ctx = new OfflineAudioContext(1, Math.ceil(totalSec * sr), sr);
  const gp  = enhancement.groovePlan;

  // Guard against sparse detected patterns producing near-silence
  const kick    = ensureMinHits([...gp.kickPattern],    2, [0, 8]);
  const logDrum = ensureMinHits([...gp.logDrumPattern], 3, [3, 6, 11]);
  const hat     = ensureMinHits([...gp.hatPattern],     4, [0, 2, 4, 6, 8, 10, 12, 14]);
  const shaker  = ensureMinHits([...gp.shakerPattern],  4, [1, 3, 5, 7, 9, 11, 13, 15]);

  for (let loop = 0; loop < loops; loop++) {
    const loopOffset = loop * stepSec * 16;

    for (let step = 0; step < 16; step++) {
      const t = loopOffset + step * stepSec;

      if (kick[step]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.14);
        gain.gain.setValueAtTime(1.0, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.18);
      }

      if (logDrum[step]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(62, t + 0.32);
        gain.gain.setValueAtTime(0.85, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.40);
      }

      if (hat[step]) {
        const len = Math.ceil(0.035 * sr);
        const nb  = ctx.createBuffer(1, len, sr);
        const nd  = nb.getChannelData(0);
        for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
        const src  = ctx.createBufferSource();
        src.buffer = nb;
        const hp   = ctx.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 8000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
        src.connect(hp); hp.connect(gain); gain.connect(ctx.destination);
        src.start(t);
      }

      if (shaker[step]) {
        const len = Math.ceil(0.055 * sr);
        const nb  = ctx.createBuffer(1, len, sr);
        const nd  = nb.getChannelData(0);
        for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
        const src  = ctx.createBufferSource();
        src.buffer = nb;
        const bp   = ctx.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 4000; bp.Q.value = 1.2;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
        src.connect(bp); bp.connect(gain); gain.connect(ctx.destination);
        src.start(t);
      }
    }
  }

  const rendered = await ctx.startRendering();
  return URL.createObjectURL(audioBufferToWavBlob(rendered));
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AmapianorizePage() {
  const [file, setFile]               = useState<File | null>(null);
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<AmapianorizeResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const inputRef                      = useRef<HTMLInputElement>(null);

  // Create original audio URL when file is chosen
  useEffect(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (!file) { setOriginalUrl(null); return; }
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Auto-synthesize enhanced groove when result arrives
  const synthRef = useRef<string | null>(null);
  useEffect(() => {
    if (synthRef.current) { URL.revokeObjectURL(synthRef.current); synthRef.current = null; }
    if (!result) { setEnhancedUrl(null); return; }
    let cancelled = false;
    setSynthesizing(true);
    synthesizeGroove(result.enhancement)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        synthRef.current = url;
        setEnhancedUrl(url);
      })
      .catch(() => {/* synthesis optional — fail silently */})
      .finally(() => { if (!cancelled) setSynthesizing(false); });
    return () => { cancelled = true; };
  }, [result]);

  const handleFile = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
    setEnhancedUrl(null);
  }, []);

  async function analyse() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEnhancedUrl(null);
    try {
      const fd = new FormData();
      fd.append("audio", file, file.name);
      const res  = await fetch(`${API}/api/amapianorize`, { method: "POST", body: fd });
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
    ? (Object.entries(result.evaluation).filter(([k, v]) => isScoreField(k, v)) as [string, number][])
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Amapianorizer</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload a WAV file. The engine scores it across Amapiano dimensions, synthesizes an enhanced groove, and returns a CTL plan.
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
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
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

      {/* ── Playback ── */}
      {(originalUrl || (result && (synthesizing || enhancedUrl))) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <p className="text-sm font-medium text-white">Playback</p>

          {originalUrl && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Original upload</p>
              <audio src={originalUrl} controls className="w-full" style={{ colorScheme: "dark" }} />
            </div>
          )}

          {result && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-500">Enhanced groove (8-bar preview)</p>
                {synthesizing && (
                  <span className="flex items-center gap-1 text-xs text-violet-400">
                    <span className="w-3 h-3 rounded-full border border-violet-400 border-t-transparent animate-spin inline-block" />
                    Synthesizing…
                  </span>
                )}
                {!synthesizing && (() => {
                  const mode = result.enhancement.recommendedCtl.correctionMode ?? "";
                  if (!mode) return null;
                  const cls =
                    mode === "analysis_verified"  ? "bg-emerald-900/40 text-emerald-400" :
                    mode === "analysis_corrected" ? "bg-violet-900/40 text-violet-400"   :
                                                    "bg-zinc-800 text-zinc-500";
                  return (
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", cls)}>
                      {mode.replace(/_/g, " ")}
                    </span>
                  );
                })()}
              </div>
              {enhancedUrl && (
                <audio src={enhancedUrl} controls className="w-full" style={{ colorScheme: "dark" }} />
              )}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Quality gates */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <p className="text-sm font-medium text-white">Quality gates</p>
            <div className="flex flex-wrap gap-2">
              <GatePill label="Perception"      pass={result.gates.b_eff} />
              <GatePill label="Authenticity"    pass={result.gates.transient_density} />
              <GatePill label="Cultural"        pass={result.gates.groove_clarity} />
            </div>
            {result.gates.violations && result.gates.violations.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {result.gates.violations.map((v, i) => (
                  <li key={i} className="text-xs text-red-400">· {v}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Scores */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Evaluation scores</p>
              <div className="flex gap-3 text-xs text-zinc-500">
                {result.evaluation.lane && (
                  <span>Lane: <span className="text-zinc-300">{result.evaluation.lane}</span></span>
                )}
                {result.evaluation.bpm != null && (
                  <span>{(result.evaluation.bpm as number).toFixed(1)} BPM</span>
                )}
              </div>
            </div>
            {scores.map(([key, val]) => (
              <ScoreBar key={key} label={SCORE_LABELS[key] ?? key} value={val} />
            ))}
          </div>

          {/* Issues */}
          {result.evaluation.issues && result.evaluation.issues.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-2">
              <p className="text-sm font-medium text-white">Issues detected</p>
              <ul className="space-y-1">
                {result.evaluation.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-amber-400 flex gap-2">
                    <span className="shrink-0">·</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Enhancement plan */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Enhancement plan</p>
              {result.enhancement.canAutoEnhance && (
                <span className="text-xs text-emerald-400">✓ Quality sufficient for auto-enhancement</span>
              )}
            </div>

            {/* Production numbers */}
            {(() => {
              const ctl = result.enhancement.recommendedCtl;
              const rows: { label: string; value: string; action?: string; urgent?: boolean }[] = [];

              if (ctl.bpmDelta != null && Math.abs(ctl.bpmDelta) > 0.5) {
                rows.push({
                  label: "Tempo",
                  value: `${(ctl.bpm).toFixed(1)} BPM detected → target ${ctl.bpmTarget ?? "—"} BPM`,
                  action: `${ctl.bpmDelta > 0 ? "Speed up" : "Slow down"} by ${Math.abs(ctl.bpmDelta).toFixed(1)} BPM`,
                  urgent: Math.abs(ctl.bpmDelta) > 3,
                });
              }

              if (ctl.swingDetected != null) {
                const swingPct      = Math.round(ctl.swing * 100);
                const detectedPct   = Math.round(ctl.swingDetected * 100);
                rows.push({
                  label: "Swing",
                  value: `Detected ${detectedPct}% → set DAW swing to ${swingPct}%`,
                  action: Math.abs(ctl.swing - ctl.swingDetected) > 0.015
                    ? `Adjust swing in your DAW/sampler to ${swingPct}% (${swingPct >= 50 ? "push 16th-note offbeats later" : "tighten offbeats earlier"})`
                    : "Swing feels right — no change needed",
                });
              }

              if (ctl.logDrum === "add") {
                rows.push({
                  label: "Log drum",
                  value: "Not detected",
                  action: "Add a pitched sample (60–200 Hz) with a downward pitch glide of ≥ 1.0 semitones. Place on the steps shown in the grid below. Keep it mono-centred.",
                  urgent: true,
                });
              } else if (ctl.logDrum === "strengthen") {
                rows.push({
                  label: "Log drum",
                  value: "Weak / developing",
                  action: "Deepen the pitch envelope — increase glide depth to ≥ 1.0 st. Layer a second sample an octave lower (30–80 Hz) to reinforce the wood resonance.",
                });
              }

              if (ctl.laneDistance != null && ctl.laneDistance > 0) {
                rows.push({
                  label: "Pattern",
                  value: `${ctl.laneDistance} step${ctl.laneDistance !== 1 ? "s" : ""} from ideal ${ctl.lane} pattern`,
                  action: ctl.laneDistance <= 2
                    ? "Groove is very close to target — keep detected pattern"
                    : `Re-program the drum machine to match the grid below. Focus on log drum placement first.`,
                  urgent: ctl.laneDistance > 6,
                });
              }

              return rows.length > 0 ? (
                <div className="divide-y divide-zinc-800">
                  {rows.map((r, i) => (
                    <div key={i} className="py-3 space-y-0.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs font-medium w-20 shrink-0", r.urgent ? "text-red-400" : "text-zinc-400")}>{r.label}</span>
                        <span className="text-xs text-zinc-500 font-mono">{r.value}</span>
                      </div>
                      {r.action && (
                        <p className={cn("text-xs pl-[88px]", r.urgent ? "text-amber-300" : "text-violet-300")}>
                          → {r.action}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : null;
            })()}

            {/* Step grid */}
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 font-medium">Target groove pattern — program this into your drum machine / sampler</p>
              <GrooveGrid groovePlan={result.enhancement.groovePlan} />
              <p className="text-xs text-zinc-600">
                Swing: {Math.round(result.enhancement.recommendedCtl.swing * 100)}% ·
                Lane: {result.enhancement.recommendedCtl.lane} ·
                {result.enhancement.groovePlan.steps} steps per bar
              </p>
            </div>

            {/* Remaining suggestions (harmonic, cultural) */}
            {result.enhancement.suggestions.length > 0 && (
              <div className="space-y-1 border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500 font-medium mb-2">Additional suggestions</p>
                {result.enhancement.suggestions.map((s, i) => (
                  <div key={i} className="text-xs text-violet-300 flex gap-2">
                    <span className="shrink-0 text-violet-600">→</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

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

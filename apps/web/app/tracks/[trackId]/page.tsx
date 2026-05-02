"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getTrack, getGenerationStatus, getSignedUrl, recordSunoResult, type TrackDetail } from "@/lib/api";
import { SUBGENRE_LABELS, fmt, scoreColor, cn } from "@/lib/utils";

// ─── Copy link button ─────────────────────────────────────────────────────────

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition-colors"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// ─── Star display ─────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <span className="text-yellow-400 tracking-tight">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= Math.round(value) ? "text-yellow-400" : "text-zinc-700"}>★</span>
      ))}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TrackDetailPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = use(params);
  const [track, setTrack]           = useState<TrackDetail | null>(null);
  const [audioUrl, setAudioUrl]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [sunoToken, setSunoToken]   = useState("");
  const [sunoTag, setSunoTag]       = useState("");
  const [sunoSaving, setSunoSaving] = useState(false);
  const [sunoError, setSunoError]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = await getTrack(trackId);
        setTrack(t);

        // Try to load audio if a generation exists
        if (t.generation?.id) {
          try {
            const status = await getGenerationStatus(t.generation.id);
            const first = status.audio_files?.[0];
            if (first?.id) {
              const { url } = await getSignedUrl(first.id);
              setAudioUrl(url);
            }
          } catch {
            // Audio not available — not an error
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Track not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [trackId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-zinc-500 text-sm mt-8">
        <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        Loading…
      </div>
    );
  }

  if (error || !track) {
    return (
      <div className="max-w-2xl mt-8 space-y-4">
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-5 text-sm text-red-400">
          {error ?? "Track not found"}
        </div>
        <Link href="/tracks" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to library
        </Link>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/tracks/${track.id}`
    : "";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <Link href="/tracks" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Track library
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-white leading-tight">{track.title}</h1>
          <CopyLinkButton url={shareUrl} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-2 py-0.5 rounded-full bg-violet-900/50 border border-violet-700 text-violet-300 text-xs">
            {SUBGENRE_LABELS[track.subgenre] ?? track.subgenre}
          </span>
          <span className="text-zinc-400">{track.bpm} BPM</span>
          <span className="text-zinc-400">{track.key}</span>
          <span className="text-zinc-600">by {track.created_by}</span>
        </div>
      </div>

      {/* Score card */}
      {track.composite_score != null && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center gap-6">
          <div className="space-y-0.5">
            <p className="text-xs text-zinc-500">Composite score</p>
            <p className={cn("text-3xl font-bold font-mono", scoreColor(track.composite_score))}>
              {fmt(track.composite_score)}
            </p>
          </div>
          {track.passed_gate != null && (
            <div className="space-y-0.5">
              <p className="text-xs text-zinc-500">Signal gate</p>
              <p className={cn("text-sm font-medium", track.passed_gate ? "text-emerald-400" : "text-red-400")}>
                {track.passed_gate ? "✓ Passed" : "✗ Failed"}
              </p>
            </div>
          )}
          {track.feedback_count > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs text-zinc-500">Producer rating</p>
              <div className="flex items-center gap-1.5">
                <Stars value={track.feedback_avg ?? 0} />
                <span className="text-xs text-zinc-500">({track.feedback_count})</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio player + download */}
      {audioUrl && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Audio</p>
            <a
              href={audioUrl}
              download={`${track.title}.mp3`}
              className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition-colors"
            >
              Download
            </a>
          </div>
          <audio src={audioUrl} controls className="w-full" style={{ colorScheme: "dark" }} />
        </div>
      )}

      {/* Suno validation panel */}
      {track.passed_gate && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Suno validation</p>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full border",
              track.suno_approved === true  ? "bg-emerald-500/20 text-emerald-400 border-emerald-800" :
              track.suno_approved === false ? "bg-red-500/20 text-red-400 border-red-800" :
              "bg-zinc-700/50 text-zinc-400 border-zinc-700"
            )}>
              {track.suno_approved === true ? "✓ Suno approved" :
               track.suno_approved === false ? "✗ Suno rejected" :
               "Pending Suno classification"}
            </span>
          </div>

          {track.suno_approved == null && (
            <p className="text-xs text-zinc-500">
              Download the track above, upload to Suno, and record the result. If Suno classifies it as Amapiano, mark approved — the track becomes marketplace-eligible.
            </p>
          )}

          {track.suno_approved != null && track.suno_classified_at && (
            <p className="text-xs text-zinc-600">
              Classified {new Date(track.suno_classified_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
              {track.suno_style_tag ? ` · "${track.suno_style_tag}"` : ""}
            </p>
          )}

          <div className="space-y-2">
            <input
              type="text"
              placeholder="Your JWT"
              value={sunoToken}
              onChange={(e) => setSunoToken(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-violet-500"
            />
            <input
              type="text"
              placeholder="Suno style tag (e.g. amapiano, log drum, sgija)"
              value={sunoTag}
              onChange={(e) => setSunoTag(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {sunoError && (
            <p className="text-xs text-red-400">{sunoError}</p>
          )}

          <div className="flex gap-2">
            <button
              disabled={sunoSaving || !sunoToken.trim()}
              onClick={async () => {
                setSunoSaving(true); setSunoError(null);
                try {
                  const result = await recordSunoResult(track.id, true, sunoToken.trim(), sunoTag.trim() || undefined);
                  setTrack((prev) => prev ? { ...prev, suno_approved: result.suno_approved, suno_classified_at: result.suno_classified_at, suno_style_tag: result.suno_style_tag } : prev);
                } catch (e) { setSunoError(e instanceof Error ? e.message : "Failed"); }
                finally { setSunoSaving(false); }
              }}
              className="flex-1 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors"
            >
              Mark approved
            </button>
            <button
              disabled={sunoSaving || !sunoToken.trim()}
              onClick={async () => {
                setSunoSaving(true); setSunoError(null);
                try {
                  const result = await recordSunoResult(track.id, false, sunoToken.trim(), sunoTag.trim() || undefined);
                  setTrack((prev) => prev ? { ...prev, suno_approved: result.suno_approved, suno_classified_at: result.suno_classified_at, suno_style_tag: result.suno_style_tag } : prev);
                } catch (e) { setSunoError(e instanceof Error ? e.message : "Failed"); }
                finally { setSunoSaving(false); }
              }}
              className="flex-1 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 disabled:opacity-40 text-white text-xs font-medium transition-colors"
            >
              Mark rejected
            </button>
          </div>
        </div>
      )}

      {/* Generation metadata */}
      {track.generation && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-white">Generation</p>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full border",
              track.generation.status === "complete"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-800"
                : "bg-zinc-700/50 text-zinc-400 border-zinc-700"
            )}>
              {track.generation.status}
            </span>
            <span className="text-xs text-zinc-600 font-mono">{track.generation.mode}</span>
          </div>

          {track.generation.prompt_style && (
            <details className="rounded-lg border border-zinc-700">
              <summary className="px-4 py-2 text-xs text-zinc-400 cursor-pointer hover:text-white">
                Suno style prompt
              </summary>
              <pre className="px-4 pb-4 pt-2 text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                {track.generation.prompt_style}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* CTL snapshot */}
      {track.ctl_snapshot && (
        <details className="rounded-xl border border-zinc-800 bg-zinc-900">
          <summary className="px-5 py-4 text-sm font-medium text-white cursor-pointer hover:text-violet-300">
            CTL snapshot
          </summary>
          <div className="px-5 pb-5">
            <pre className="text-xs text-zinc-400 bg-zinc-800 rounded-lg p-4 overflow-x-auto leading-relaxed">
              {JSON.stringify(track.ctl_snapshot, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {/* Metadata footer */}
      <p className="text-xs text-zinc-600">
        Created {new Date(track.created_at).toLocaleDateString("en-ZA", {
          day: "numeric", month: "long", year: "numeric",
        })}
        {" · "}
        <span className="font-mono">{track.id.slice(-8)}</span>
      </p>
    </div>
  );
}

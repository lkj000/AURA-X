"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getTrack, getGenerationStatus, getSignedUrl, type TrackDetail } from "@/lib/api";
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

export default function TrackDetailPage({ params }: { params: { trackId: string } }) {
  const [track, setTrack]       = useState<TrackDetail | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = await getTrack(params.trackId);
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
  }, [params.trackId]);

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

      {/* Audio player */}
      {audioUrl && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-xs text-zinc-500">Audio</p>
          <audio
            src={audioUrl}
            controls
            className="w-full"
            style={{ colorScheme: "dark" }}
          />
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

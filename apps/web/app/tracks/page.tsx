"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { listTracks, type TrackSummary } from "@/lib/api";
import { SUBGENRES, SUBGENRE_LABELS, KEYS, fmt, scoreColor, cn } from "@/lib/utils";

export default function TracksPage() {
  const [tracks, setTracks]     = useState<TrackSummary[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [subgenre, setSubgenre] = useState("");
  const [key, setKey]           = useState("");
  const [bpmMin, setBpmMin]     = useState("");
  const [bpmMax, setBpmMax]     = useState("");

  const LIMIT = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTracks({
        subgenre: subgenre || undefined,
        key:      key || undefined,
        bpm_min:  bpmMin ? Number(bpmMin) : undefined,
        bpm_max:  bpmMax ? Number(bpmMax) : undefined,
        page: p,
        limit: LIMIT,
      });
      setTracks(res.tracks);
      setTotal(res.total);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tracks");
    } finally {
      setLoading(false);
    }
  }, [subgenre, key, bpmMin, bpmMax]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Track Library</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {total > 0 ? `${total} track${total !== 1 ? "s" : ""}` : "Generated tracks, evaluation scores, Suno bundles."}
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Subgenre</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              value={subgenre}
              onChange={(e) => setSubgenre(e.target.value)}
            >
              <option value="">All</option>
              {SUBGENRES.map((s) => (
                <option key={s} value={s}>{SUBGENRE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Key</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            >
              <option value="">All</option>
              {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">BPM min</label>
            <input
              type="number" min={95} max={130}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              placeholder="95"
              value={bpmMin}
              onChange={(e) => setBpmMin(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">BPM max</label>
            <input
              type="number" min={95} max={130}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              placeholder="130"
              value={bpmMax}
              onChange={(e) => setBpmMax(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-500 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          Loading tracks…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && tracks.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center space-y-3">
          <p className="text-zinc-400 text-sm">No tracks found.</p>
          <Link
            href="/generate"
            className="inline-block px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            Generate a track
          </Link>
        </div>
      )}

      {/* Track grid */}
      {!loading && tracks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tracks.map((track) => (
            <Link
              key={track.id}
              href={`/tracks/${track.id}`}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors space-y-3 block"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-white truncate">{track.title}</p>
                {track.composite_score != null && (
                  <span className={cn("text-xs font-mono shrink-0", scoreColor(track.composite_score))}>
                    {fmt(track.composite_score)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {SUBGENRE_LABELS[track.subgenre] ?? track.subgenre}
                </span>
                <span>{track.bpm} BPM</span>
                <span>{track.key}</span>
              </div>
              <p className="text-xs text-zinc-600">
                {new Date(track.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-center">
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-xs transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">{page} / {totalPages}</span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-xs transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

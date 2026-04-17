import Link from "next/link";
import { SUBGENRE_LABELS, fmt, scoreColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

// The AURA X API doesn't expose a GET /tracks list endpoint yet.
// This page will show instructions until that endpoint exists,
// or tracks passed via searchParams from the generate page.
export default function TracksPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Track Library</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Generated tracks, evaluation scores, Suno prompts.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center space-y-4">
        <p className="text-zinc-400 text-sm">
          Track history is stored in Supabase.
        </p>
        <p className="text-xs text-zinc-600">
          To browse tracks directly, open Supabase Studio → tracks table, or
          use the API:
        </p>
        <div className="text-left space-y-1 font-mono text-xs text-zinc-400 bg-zinc-800 rounded-lg p-4">
          <p className="text-zinc-500"># Get generation history for a track</p>
          <p>GET /api/generate/track/:trackId</p>
          <p className="text-zinc-500 mt-2"># Get evaluation scores for a generation</p>
          <p>GET /api/evaluate/:generationId</p>
        </div>
        <p className="text-xs text-zinc-600 mt-4">
          Generate a track to see its scores and Suno bundle.
        </p>
        <Link
          href="/generate"
          className="inline-block px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          Generate a track
        </Link>
      </div>

      {/* Subgenre reference */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <p className="text-sm font-medium text-white">Subgenre reference</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(SUBGENRE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
              <span className="text-zinc-300">{label}</span>
              <span className="text-zinc-600 font-mono">{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Score reference */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <p className="text-sm font-medium text-white">Evaluation scores</p>
        <div className="space-y-2 text-xs text-zinc-400">
          {[
            { label: "Authenticity", desc: "How Amapiano does it sound?" },
            { label: "Subgenre recognizability", desc: "Private school vs Bacardi vs Sgija?" },
            { label: "Groove clarity", desc: "Is the log drum pattern clean and present?" },
            { label: "Harmonic density", desc: "Piano voicings — sparse to dense" },
            { label: "DJ mix friendliness", desc: "Camelot wheel + BPM compatibility" },
            { label: "Cultural lineage coherence", desc: "Deep house + kwaito + jazz weights balanced?" },
          ].map((s) => (
            <div key={s.label} className="flex gap-2">
              <span className="text-zinc-300 w-48 shrink-0">{s.label}</span>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600 mt-2">
          Signal gate threshold: <span className="text-violet-400">0.68</span>.
          Tracks above this score are eligible for dataset ingestion.
        </p>
      </div>
    </div>
  );
}

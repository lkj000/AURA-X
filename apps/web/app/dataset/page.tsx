import { getDatasetStats } from "@/lib/api";
import { fmt, scoreBg, SUBGENRE_LABELS, cn } from "@/lib/utils";
import DatasetActions from "./DatasetActions";

export const dynamic = "force-dynamic";

export default async function DatasetPage() {
  let stats = null;
  try {
    stats = await getDatasetStats();
  } catch {}

  const trainCount = stats?.by_split?.train ?? 0;
  const threshold = stats?.training_threshold ?? 100;
  const pct = Math.min(100, Math.round((trainCount / threshold) * 100));

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Dataset Monitor</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Training data pipeline status and finetune controls.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total records", value: stats?.total?.toString() ?? "0" },
          { label: "Training", value: (stats?.by_split?.train ?? 0).toString() },
          { label: "Validation", value: (stats?.by_split?.val ?? 0).toString() },
          { label: "Test", value: (stats?.by_split?.test ?? 0).toString() },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
            <p className="text-xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Training progress bar */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">Training threshold</p>
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            stats?.ready_for_training
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-zinc-800 text-zinc-400"
          )}>
            {stats?.ready_for_training ? "ready_for_training: true ✓" : `${pct}% complete`}
          </span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", scoreBg(pct / 100))}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{trainCount} training records</span>
          <span>threshold: {threshold}</span>
        </div>
      </div>

      {/* Mean score */}
      {stats && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-2">
          <p className="text-sm font-medium text-white">
            Mean composite score:{" "}
            <span className={cn("font-bold", scoreBg(stats.mean_score).replace("bg-", "text-"))}>
              {fmt(stats.mean_score)}
            </span>
          </p>
          <p className="text-xs text-zinc-500">
            AC-AMI signal gate threshold: 0.68. Records below this score are excluded from training splits.
          </p>
        </div>
      )}

      {/* By source */}
      {stats?.by_source && Object.keys(stats.by_source).length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <p className="text-sm font-medium text-white">By source</p>
          <div className="flex gap-4">
            {Object.entries(stats.by_source).map(([source, count]) => (
              <div key={source} className="text-center">
                <p className="text-lg font-bold text-white">{count}</p>
                <p className="text-xs text-zinc-500 capitalize">{source}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By subgenre */}
      {stats?.by_subgenre && Object.keys(stats.by_subgenre).length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <p className="text-sm font-medium text-white">By subgenre</p>
          <div className="space-y-2">
            {Object.entries(stats.by_subgenre)
              .sort(([, a], [, b]) => b - a)
              .map(([sg, count]) => (
                <div key={sg} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-48 shrink-0">
                    {SUBGENRE_LABELS[sg] ?? sg}
                  </span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (count / (stats.total || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500 w-6 text-right">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Finetune controls */}
      <DatasetActions ready={stats?.ready_for_training ?? false} />

      {/* Instructions */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <p className="text-sm font-medium text-white">How to ingest tracks</p>
        <div className="space-y-2 text-xs text-zinc-400 font-mono">
          <p className="text-zinc-500"># 1. Generate a track via the agent</p>
          <p>POST /api/agent/run {"{"} title, subgenre, ... {"}"}</p>
          <p className="text-zinc-500 mt-2"># 2. Ingest to dataset pipeline</p>
          <p>POST /api/agent/ingest {"{"} track_id, generation_id, audio_url, source: "generated" {"}"}</p>
          <p className="text-zinc-500 mt-2"># 3. Monitor workflow</p>
          <p>GET /api/agent/workflow/:workflowId</p>
          <p className="text-zinc-500 mt-2"># 4. Auto-trigger fires when ready</p>
          <p>modal deploy apps/audio/modal_auto_trigger.py</p>
        </div>
      </div>
    </div>
  );
}

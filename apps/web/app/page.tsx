import { getDatasetStats, getAgentStatus } from "@/lib/api";
import { fmt, scoreBg, SUBGENRE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  let stats = null;
  let agent = null;
  try {
    [stats, agent] = await Promise.all([getDatasetStats(), getAgentStatus()]);
  } catch {}

  const trainCount = stats?.by_split?.train ?? 0;
  const threshold = stats?.training_threshold ?? 100;
  const pct = Math.min(100, Math.round((trainCount / threshold) * 100));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Producer Studio</h1>
        <p className="text-zinc-400 text-sm mt-1">Amapiano AI — Cultural intelligence platform</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Dataset records"
          value={stats?.total?.toString() ?? "—"}
          sub={`${trainCount} training`}
        />
        <StatCard
          label="Mean score"
          value={stats ? fmt(stats.mean_score) : "—"}
          sub="composite across all records"
        />
        <StatCard
          label="Agent level"
          value={agent ? `Level ${agent.agent_level}` : "—"}
          sub={agent ? `${agent.capabilities.length} capabilities` : undefined}
        />
        <StatCard
          label="Model status"
          value={stats?.ready_for_training ? "Ready" : "Ingesting"}
          sub={stats?.ready_for_training ? "100+ training records" : `${pct}% to threshold`}
        />
      </div>

      {/* Training progress */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">Training dataset progress</p>
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            stats?.ready_for_training
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-zinc-800 text-zinc-400"
          )}>
            {stats?.ready_for_training
              ? "ready_for_training: true"
              : `${trainCount} / ${threshold}`}
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", scoreBg(pct / 100))}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-zinc-500">
          Auto-trigger fires when training records ≥ {threshold}.{" "}
          <code className="text-violet-400">modal deploy modal_auto_trigger.py</code> to enable.
        </p>
      </div>

      {/* Subgenre breakdown */}
      {stats?.by_subgenre && Object.keys(stats.by_subgenre).length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <p className="text-sm font-medium text-white">Records by subgenre</p>
          <div className="space-y-2">
            {Object.entries(stats.by_subgenre).map(([sg, count]) => (
              <div key={sg} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-44 shrink-0">
                  {SUBGENRE_LABELS[sg] ?? sg}
                </span>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full"
                    style={{ width: `${Math.min(100, (count / (stats.total || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-500 w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            href: "/generate",
            title: "Generate track →",
            desc: "Subgenre + BPM + key → AC-AMI → evaluation",
          },
          {
            href: "/tracks",
            title: "Track library →",
            desc: "Browse generations, scores, Suno prompts",
          },
          {
            href: "/dataset",
            title: "Dataset monitor →",
            desc: "Ingest status, training readiness, finetune",
          },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors p-5 group"
          >
            <p className="font-medium text-white group-hover:text-violet-400 transition-colors">
              {a.title}
            </p>
            <p className="text-xs text-zinc-500 mt-1">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

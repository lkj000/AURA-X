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
  // WHY THE ERROR IS KEPT RATHER THAN SWALLOWED.
  //
  // This was `catch {}`. With the API unreachable, `stats` stayed null and the row count below read
  // `?? 0` — so a failed fetch rendered as "0 training rows", indistinguishable from a dataset that
  // is genuinely empty. Every other card on this page guards on null and shows an em-dash; that one
  // field invented a number.
  //
  // Which is the same reasoning the comment on `distinctTrain` already rejects two lines down: do not
  // substitute a number you can stand behind for one you cannot. That rule was applied to the harder
  // field and missed on the easier one.
  let loadError: string | null = null;
  try {
    [stats, agent] = await Promise.all([getDatasetStats(), getAgentStatus()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "unknown error";
  }

  // PROGRESS IS MEASURED IN RECORDINGS, NOT ROWS.
  //
  // This read `by_split.train` — the row count. On the live dataset that is 315 train rows over 123
  // distinct recordings, because most files were ingested three times and one six times. The bar
  // showed a corpus three times the size of the one that exists.
  //
  // `distinct_train_audio` is null until every record resolves to a content hash, and null means
  // UNKNOWN. The progress bar is hidden in that state rather than falling back to the row count,
  // which is the number that was wrong in the first place.
  const trainRows      = stats?.by_split?.train ?? null;   // null = unknown, never 0
  const distinctTrain  = stats?.distinct_train_audio ?? null;
  const threshold      = stats?.training_threshold ?? 100;
  const pct = distinctTrain === null ? null : Math.min(100, Math.round((distinctTrain / threshold) * 100));

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
          // Both numbers, because the gap between them is the point: rows count uploads, and the
          // same recording is stored many times over.
          sub={loadError
            ? "could not be loaded"
            : stats?.distinct_audio != null
              ? `${stats.distinct_audio} distinct recordings · ${trainRows} training rows`
              : trainRows === null
                ? "row count unknown · distinct count unknown"
                : `${trainRows} training rows · distinct count unknown`}
        />
        <StatCard
          label="Mean score"
          value={stats ? fmt(stats.mean_score) : "—"}
          sub="composite across all records"
        />
        <StatCard
          label="Agent level"
          value={agent ? `Level ${agent.level}` : "—"}
          sub={agent ? `${agent.capabilities.length} capabilities` : undefined}
        />
        <StatCard
          label="Model status"
          value={loadError ? "Unavailable" : stats?.ready_for_training ? "Ready" : distinctTrain === null ? "Unverified" : "Ingesting"}
          sub={loadError
            ? "dataset service could not be reached"
            : stats?.ready_for_training
              ? `${distinctTrain} distinct training recordings`
              : distinctTrain === null
                ? "content identity not yet established"
                : `${pct}% to threshold`}
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
            {loadError
              ? "unavailable"
              : stats?.ready_for_training
                ? `${distinctTrain} distinct recordings`
                : distinctTrain === null
                  ? "distinct count unknown"
                  : `${distinctTrain} / ${threshold} distinct`}
          </span>
        </div>
        {/* No bar when the distinct count is unknown. A bar drawn from the row count would show a
            corpus three times its real size, which is precisely the reading being corrected. */}
        {loadError ? (
          /* Two different unknowns. This one is "we could not ask", and saying the other thing here
             would report a dataset condition that has not been observed. */
          <p className="text-xs text-amber-400">
            Progress cannot be shown: the dataset service could not be reached, so no count — of rows
            or of recordings — has been read. This is not a statement about the corpus.
            <span className="block text-zinc-500 mt-1">{loadError}</span>
          </p>
        ) : pct === null ? (
          <p className="text-xs text-amber-400">
            Progress cannot be shown: audio content identity has not been established for every
            record, and counting upload rows would overstate the corpus.
          </p>
        ) : (
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", scoreBg(pct / 100))}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
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

"use client";
import { useState, useEffect, useCallback } from "react";
import { getEarningsSummary, getEarningsHistory, withdrawEarnings, type EarningsSummary, type EarningsHistoryRow } from "@/lib/api";

export default function EarningsPage() {
  const [token, setToken]         = useState("");
  const [summary, setSummary]     = useState<EarningsSummary | null>(null);
  const [history, setHistory]     = useState<EarningsHistoryRow[]>([]);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<string | null>(null);
  const [withdrawError, setWithdrawError]   = useState<string | null>(null);

  const LIMIT = 10;

  const load = useCallback(async (p: number) => {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [sumRes, histRes] = await Promise.all([
        getEarningsSummary(token.trim()),
        getEarningsHistory(token.trim(), { page: p, limit: LIMIT }),
      ]);
      setSummary(sumRes);
      setHistory(histRes.history);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load earnings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Re-load when token changes (debounce via effect dep)
  useEffect(() => {
    if (token.trim().length > 20) { load(1); }
  }, [token, load]);

  async function withdraw() {
    const amt = parseFloat(withdrawAmt);
    if (!amt || amt <= 0) { setWithdrawError("Enter a valid positive amount."); return; }
    if (!token.trim()) { setWithdrawError("JWT token required."); return; }
    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawResult(null);
    try {
      const res = await withdrawEarnings(token.trim(), amt);
      setWithdrawResult(`Withdrawn $${res.amount_usd} — NEXUS TX: ${res.nexus_tx_id ?? "n/a"}`);
      setWithdrawAmt("");
      load(page);
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Earnings</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Producer royalty dashboard. Paste your JWT to view balance and withdraw.
        </p>
      </div>

      {/* Token input */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
        <label className="text-xs text-zinc-500">Your JWT (from POST /api/auth/login)</label>
        <input
          type="text"
          placeholder="eyJhbGci..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-500 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          Loading earnings…
        </div>
      )}

      {/* Summary cards */}
      {summary && !loading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Earned", value: `$${summary.total_earned.toFixed(2)}`, accent: "text-emerald-400" },
            { label: "Splits",       value: summary.split_count,                   accent: "text-white" },
            { label: "Tracks",       value: summary.track_count,                   accent: "text-white" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-1">
              <p className="text-xs text-zinc-500">{card.label}</p>
              <p className={`text-xl font-bold ${card.accent}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Withdraw */}
      {summary && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <p className="text-sm font-medium text-white">Withdraw to NEXUS Wallet</p>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              step={0.01}
              placeholder={`Max $${summary.total_earned.toFixed(2)}`}
              value={withdrawAmt}
              onChange={(e) => setWithdrawAmt(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={withdraw}
              disabled={withdrawing}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>
          {withdrawError && <p className="text-xs text-red-400">{withdrawError}</p>}
          {withdrawResult && <p className="text-xs text-emerald-400">{withdrawResult}</p>}
        </div>
      )}

      {/* History table */}
      {history.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-zinc-800">
              <tr className="text-zinc-500">
                <th className="text-left px-4 py-2">Period</th>
                <th className="text-left px-4 py-2">Track</th>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.split_id} className="border-t border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-2 font-mono text-zinc-400">{row.period}</td>
                  <td className="px-4 py-2 font-mono text-zinc-500 max-w-[100px] truncate">{row.track_id.slice(0, 8)}…</td>
                  <td className="px-4 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 capitalize">{row.role}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-400">${row.amount_usd.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={row.status === "PAID" ? "text-emerald-400" : "text-red-400"}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-zinc-800 px-4 py-2 flex gap-3 justify-center">
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs transition-colors"
            >
              Prev
            </button>
            <span className="text-xs text-zinc-500 self-center">Page {page}</span>
            <button
              onClick={() => load(page + 1)}
              disabled={history.length < LIMIT || loading}
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {!loading && summary && history.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
          <p className="text-zinc-500 text-sm">No royalty splits found for this account.</p>
        </div>
      )}
    </div>
  );
}

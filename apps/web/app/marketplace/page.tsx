"use client";
import { useState, useEffect, useCallback } from "react";
import { listMarketplace, purchaseLicense, type MarketplaceListing } from "@/lib/api";
import { SUBGENRE_LABELS, cn } from "@/lib/utils";

const TIERS = ["STANDARD", "PREMIUM", "EXCLUSIVE"] as const;
type Tier = (typeof TIERS)[number];

const TIER_COLOR: Record<Tier, string> = {
  STANDARD:  "border-zinc-700 hover:border-zinc-500",
  PREMIUM:   "border-violet-800 hover:border-violet-500",
  EXCLUSIVE: "border-amber-700 hover:border-amber-500",
};

const TIER_LABEL_COLOR: Record<Tier, string> = {
  STANDARD:  "text-zinc-300",
  PREMIUM:   "text-violet-300",
  EXCLUSIVE: "text-amber-400",
};

export default function MarketplacePage() {
  const [listings, setListings]     = useState<MarketplaceListing[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [token, setToken]           = useState("");
  const [buying, setBuying]         = useState<string | null>(null);
  const [buyResult, setBuyResult]   = useState<Record<string, unknown> | null>(null);
  const [buyError, setBuyError]     = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<Record<string, Tier>>({});

  const LIMIT = 12;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMarketplace({ page: p, limit: LIMIT });
      setListings(res.listings);
      setTotal(res.total);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load marketplace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  async function buy(trackId: string) {
    const tier = selectedTier[trackId] ?? "STANDARD";
    if (!token.trim()) { setBuyError("Paste your JWT token below to purchase."); return; }
    setBuying(trackId);
    setBuyError(null);
    setBuyResult(null);
    try {
      const res = await purchaseLicense(trackId, tier, token.trim());
      setBuyResult({ ...res, trackId, tier });
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketplace</h1>
        <p className="text-zinc-400 text-sm mt-1">
          License quality-gate-passed tracks. 80% of revenue goes to the producer.
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

      {/* Error / result banners */}
      {buyError && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-400">{buyError}</div>
      )}
      {buyResult && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/50 p-4 text-xs text-emerald-300 space-y-1">
          <p className="font-medium text-emerald-200">License purchased</p>
          <p>License ID: <span className="font-mono">{buyResult.license_id as string}</span></p>
          <p>Tier: <span className="font-mono">{buyResult.tier as string}</span> — ${buyResult.price_usd as number}</p>
          <p>Split status: <span className="font-mono">{buyResult.split_status as string}</span></p>
          <p className="text-zinc-500 break-all">Access token: {(buyResult.access_token as string).slice(0, 60)}…</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-500 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          Loading listings…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-sm text-red-400">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && listings.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400 text-sm">No tracks available in the marketplace yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Tracks must pass the quality gate to appear here.</p>
        </div>
      )}

      {/* Grid */}
      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((listing) => {
            const tier = selectedTier[listing.id] ?? "STANDARD";
            const price = listing.tiers[tier].price_usd;
            return (
              <div
                key={listing.id}
                className={cn(
                  "rounded-xl border bg-zinc-900 p-4 space-y-4 transition-colors",
                  TIER_COLOR[tier]
                )}
              >
                <div>
                  <p className="text-sm font-medium text-white truncate">{listing.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {SUBGENRE_LABELS[listing.subgenre] ?? listing.subgenre} · {listing.bpm} BPM · {listing.key}
                  </p>
                </div>

                {/* Tier selector */}
                <div className="flex gap-1">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTier((prev) => ({ ...prev, [listing.id]: t }))}
                      className={cn(
                        "flex-1 text-xs py-1 rounded-md border transition-colors",
                        tier === t
                          ? "border-violet-500 bg-violet-900/40 text-white"
                          : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {t[0] + t.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={cn("text-sm font-bold", TIER_LABEL_COLOR[tier])}>
                      ${price}
                    </p>
                    <p className="text-xs text-zinc-600">{listing.tiers[tier].rights}</p>
                  </div>
                  <button
                    onClick={() => buy(listing.id)}
                    disabled={buying === listing.id}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                  >
                    {buying === listing.id ? "Buying…" : "Buy"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-center">
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">{page} / {totalPages}</span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs transition-colors"
          >
            Next
          </button>
        </div>
      )}

      <p className="text-xs text-zinc-700">
        80% of each purchase goes directly to the producer via NEXUS. 20% retained by AURA X.
      </p>
    </div>
  );
}

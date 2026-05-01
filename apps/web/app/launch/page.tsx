import Link from "next/link";

const FEATURES = [
  {
    icon: "♪",
    title: "AI Amapiano Generation",
    desc: "Prompt the agent with subgenre, BPM, and key. CTL_v1 cultural intelligence ensures every track sounds authentically African.",
  },
  {
    icon: "$",
    title: "Royalty Marketplace",
    desc: "List tracks that pass the quality gate. Buyers license them at STANDARD, PREMIUM, or EXCLUSIVE tiers. 80% goes directly to you.",
  },
  {
    icon: "↗",
    title: "NEXUS Payouts",
    desc: "Royalties hit your NEXUS wallet automatically. Withdraw to mobile money, card, or stablecoin anywhere in Africa.",
  },
  {
    icon: "✓",
    title: "Quality Gate",
    desc: "Every track is scored on 6 dimensions — authenticity, groove, harmonic density, DJ-mix friendliness. Only the best reach the marketplace.",
  },
];

const SUBGENRES = [
  "Private School", "Sgija", "Bacardi", "Mbiraiano", "Gqom Fusion", "Hybrid R&B Amapiano",
];

export default function LaunchPage() {
  return (
    <div className="space-y-16 max-w-4xl">
      {/* Hero */}
      <div className="space-y-6 pt-8">
        <div className="inline-block px-3 py-1 rounded-full border border-violet-700 bg-violet-950/40 text-violet-300 text-xs font-medium">
          Phase 4 — Public Launch
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
          The Amapiano AI<br />
          <span className="text-violet-400">Revenue Platform</span>
        </h1>
        <p className="text-zinc-400 text-lg max-w-xl">
          Generate, evaluate, and sell African music. Built by Okovanggo AI —
          for producers across the continent.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/onboarding"
            className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            Start for free
          </Link>
          <Link
            href="/marketplace"
            className="px-6 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-medium transition-colors"
          >
            Browse marketplace
          </Link>
        </div>
      </div>

      {/* Subgenres ticker */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-600 uppercase tracking-widest">Supported subgenres</p>
        <div className="flex flex-wrap gap-2">
          {SUBGENRES.map((s) => (
            <span key={s} className="px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 text-xs">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-violet-900/50 flex items-center justify-center text-violet-400 text-lg font-bold">
              {f.icon}
            </div>
            <p className="text-sm font-medium text-white">{f.title}</p>
            <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Split breakdown */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
        <p className="text-sm font-medium text-white">Revenue split — every license</p>
        <div className="space-y-3">
          {[
            { label: "Producer",  pct: 80, color: "bg-violet-500" },
            { label: "Platform",  pct: 20, color: "bg-zinc-700" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-4">
              <span className="text-xs text-zinc-400 w-20">{row.label}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full ${row.color} rounded-full`} style={{ width: `${row.pct}%` }} />
              </div>
              <span className="text-xs font-mono text-zinc-300 w-8 text-right">{row.pct}%</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600">
          STANDARD $25 · PREMIUM $150 · EXCLUSIVE $500. Payouts via NEXUS within the same session.
        </p>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-violet-800 bg-violet-950/20 p-8 text-center space-y-4">
        <p className="text-xl font-bold text-white">Ready to earn from your music?</p>
        <p className="text-zinc-400 text-sm">Join the first wave of producers on AURA X.</p>
        <Link
          href="/onboarding"
          className="inline-block px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
        >
          Create your producer account
        </Link>
      </div>

      <p className="text-xs text-zinc-700 text-center">
        Built by Okovanggo AI · Powered by NEXUS · Johannesburg, 2026
      </p>
    </div>
  );
}

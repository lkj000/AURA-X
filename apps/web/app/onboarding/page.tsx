"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerArtist, loginArtist } from "@/lib/api";
import { cn } from "@/lib/utils";

const COUNTRIES = [
  "South Africa", "Nigeria", "Kenya", "Ghana", "Zimbabwe",
  "Uganda", "Tanzania", "Zambia", "Mozambique", "Other",
];

type Step = "account" | "profile" | "nexus" | "done";

interface Profile {
  name: string;
  email: string;
  password: string;
  country: string;
}

interface NexusLink {
  nexusId: string;
  nexusKey: string;
}

const STEPS: { key: Step; label: string }[] = [
  { key: "account", label: "Account" },
  { key: "profile", label: "Profile" },
  { key: "nexus",   label: "NEXUS" },
  { key: "done",    label: "Done" },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
            i < idx  ? "bg-emerald-600 text-white" :
            i === idx ? "bg-violet-600 text-white" :
                        "bg-zinc-800 text-zinc-500"
          )}>
            {i < idx ? "✓" : i + 1}
          </div>
          <span className={cn(
            "text-xs hidden sm:block",
            i === idx ? "text-white font-medium" : "text-zinc-500"
          )}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <div className="w-6 h-px bg-zinc-700" />}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]       = useState<Step>("account");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1 — account
  const [mode, setMode]             = useState<"register" | "login">("register");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [token, setToken]           = useState("");
  const [artistId, setArtistId]     = useState("");

  // Step 2 — profile
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", password: "", country: "South Africa" });

  // Step 3 — NEXUS
  const [nexus, setNexus] = useState<NexusLink>({ nexusId: "", nexusKey: "" });
  const [nexusLinked, setNexusLinked] = useState(false);

  async function submitAccount() {
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        if (!profile.name.trim()) { setError("Name is required"); setLoading(false); return; }
        const res = await registerArtist({ name: profile.name, email, password, country: profile.country });
        setToken(res.token);
        setArtistId(res.artist_id);
      } else {
        const res = await loginArtist({ email, password });
        setToken(res.token);
        setArtistId(res.artist_id);
      }
      setStep("profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  function submitProfile() {
    setError(null);
    if (!profile.name.trim()) { setError("Name is required"); return; }
    setStep("nexus");
  }

  function submitNexus() {
    setError(null);
    // NEXUS link is optional — store in localStorage for Marketplace/Earnings pages
    if (nexus.nexusId.trim() || nexus.nexusKey.trim()) {
      try {
        localStorage.setItem("aura_nexus_id",  nexus.nexusId.trim());
        localStorage.setItem("aura_nexus_key", nexus.nexusKey.trim());
        setNexusLinked(true);
      } catch {}
    }
    // Always persist the JWT so other pages can read it
    try {
      localStorage.setItem("aura_token", token);
      localStorage.setItem("aura_artist_id", artistId);
    } catch {}
    setStep("done");
  }

  return (
    <div className="max-w-md mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome to AURA X</h1>
        <p className="text-zinc-400 text-sm mt-1">Set up your producer account in 3 steps.</p>
      </div>

      <StepIndicator current={step} />

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Step 1 — Account */}
      {step === "account" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
          <div className="flex gap-2">
            {(["register", "login"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                  mode === m ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                )}
              >
                {m === "register" ? "New account" : "Sign in"}
              </button>
            ))}
          </div>

          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Name</label>
              <input
                type="text"
                placeholder="DJ Okovanggo"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Country</label>
              <select
                value={profile.country}
                onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={submitAccount}
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
          </button>
        </div>
      )}

      {/* Step 2 — Profile */}
      {step === "profile" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
          <p className="text-sm text-zinc-400">
            Your AURA X profile — what producers and buyers will see.
          </p>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Display name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Country</label>
            <select
              value={profile.country}
              onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            >
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-500">
            Artist ID: <span className="font-mono text-zinc-300">{artistId}</span>
          </div>

          <button
            onClick={submitProfile}
            className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 3 — NEXUS wallet */}
      {step === "nexus" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-white">Link your NEXUS wallet</p>
            <p className="text-xs text-zinc-500 mt-1">
              NEXUS is the payment rail that delivers your royalty payouts. You can skip this and add it later from the Earnings page.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">NEXUS Artist ID</label>
            <input
              type="text"
              placeholder="nexus-artist-..."
              value={nexus.nexusId}
              onChange={(e) => setNexus((n) => ({ ...n, nexusId: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-500">NEXUS API key</label>
            <input
              type="password"
              placeholder="gig-key-..."
              value={nexus.nexusKey}
              onChange={(e) => setNexus((n) => ({ ...n, nexusKey: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep("done"); try { localStorage.setItem("aura_token", token); localStorage.setItem("aura_artist_id", artistId); } catch {} }}
              className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={submitNexus}
              className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
            >
              {nexusLinked ? "Linked" : "Link & continue"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Done */}
      {step === "done" && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-emerald-600/20 flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <div>
            <p className="text-lg font-bold text-white">You&apos;re in.</p>
            <p className="text-sm text-zinc-400 mt-1">
              Account created. JWT saved to your browser. Start generating tracks.
            </p>
          </div>
          <div className="rounded-lg bg-zinc-900 p-3 text-xs text-zinc-500 text-left break-all">
            <span className="text-zinc-400 font-medium block mb-1">Your JWT (copy it):</span>
            <span className="font-mono text-violet-300">{token}</span>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.push("/generate")}
              className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
            >
              Generate your first track
            </button>
            <button
              onClick={() => router.push("/marketplace")}
              className="w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
            >
              Browse marketplace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

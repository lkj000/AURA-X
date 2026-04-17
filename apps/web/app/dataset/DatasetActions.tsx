"use client";
import { useState } from "react";
import { triggerFinetune } from "@/lib/api";

export default function DatasetActions({ ready }: { ready: boolean }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleTrigger() {
    if (!ready) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await triggerFinetune({
        min_score: 0.65,
        training_steps: 1000,
        triggered_by: "producer_studio",
      });
      setResult(`${res.status}: ${res.message}`);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
      <p className="text-sm font-medium text-white">Finetune controls</p>
      <p className="text-xs text-zinc-500">
        Triggers MusicGen fine-tuning on Modal (A10G GPU, ~45 min, ~$3).
        Only available when dataset is ready.
      </p>
      <button
        onClick={handleTrigger}
        disabled={!ready || loading}
        className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? "Queuing…" : ready ? "Trigger finetune" : "Dataset not ready"}
      </button>
      {result && (
        <p className="text-xs text-zinc-400 font-mono">{result}</p>
      )}
    </div>
  );
}

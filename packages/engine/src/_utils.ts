// Shared utilities — mirrors aura-x-engine/_utils.py

export function clamp(value: number, lo = 0.0, hi = 1.0): number {
  return Math.max(lo, Math.min(hi, value));
}

export function gaussScore(val: number, target: number, sigma: number): number {
  const d = (val - target) / sigma;
  return Math.exp(-0.5 * d * d);
}

export function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum === 0 ? scores.map(() => 1 / scores.length) : exps.map((e) => e / sum);
}

// Deterministic hash for EMA tie-breaking exploration floor
export function hashString(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

export function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function hammingDistance(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    if (!!a[i] !== !!b[i]) dist++;
  }
  return dist;
}

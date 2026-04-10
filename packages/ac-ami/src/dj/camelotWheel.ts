export type CamelotCode = string; // e.g. "8A", "11B"

// ─── KEY → CAMELOT MAPPING ────────────────────────────────────────────────────
// Standard Camelot wheel used by DJs worldwide.
// A = minor, B = major. Numbers 1-12 arranged in a circle.

export const KEY_TO_CAMELOT: Record<string, CamelotCode> = {
  // Minor keys (A)
  "Am":   "8A",  "Em":  "9A",  "Bm":  "10A",
  "F#m":  "11A", "C#m": "12A", "G#m": "1A",
  "Abm":  "1A",  "Ebm": "2A",  "D#m": "2A",
  "Bbm":  "3A",  "A#m": "3A",  "Fm":  "4A",
  "Cm":   "5A",  "Gm":  "6A",  "Dm":  "7A",
  // Major keys (B)
  "C":    "8B",  "G":   "9B",  "D":   "10B",
  "A":    "11B", "E":   "12B", "B":   "1B",
  "Gb":   "2B",  "F#":  "2B",  "Db":  "3B",
  "C#":   "3B",  "Ab":  "4B",  "G#":  "4B",
  "Eb":   "5B",  "D#":  "5B",  "Bb":  "6B",
  "A#":   "6B",  "F":   "7B",
};

export const CAMELOT_TO_KEY: Record<CamelotCode, string> =
  Object.fromEntries(
    Object.entries(KEY_TO_CAMELOT).map(([k, v]) => [v, k])
  );

// ─── GET CAMELOT CODE ─────────────────────────────────────────────────────────

export function getCamelotCode(key: string): CamelotCode | null {
  return KEY_TO_CAMELOT[key] ?? null;
}

// ─── HARMONIC COMPATIBILITY ───────────────────────────────────────────────────
// Returns all Camelot codes that mix harmonically with input.
// Rules: same code, +/-1 number (same letter), same number A↔B.

export function getCompatibleKeys(code: CamelotCode): CamelotCode[] {
  const num = parseInt(code.slice(0, -1), 10);
  const letter = code.slice(-1) as "A" | "B";

  const compatible: CamelotCode[] = [
    code,                                          // Same key
    `${num}${letter === "A" ? "B" : "A"}`,        // Parallel major/minor
    `${((num - 2 + 12) % 12) + 1}${letter}`,      // -1 step
    `${(num % 12) + 1}${letter}`,                 // +1 step
  ];

  return compatible.filter(c => {
    const n = parseInt(c.slice(0, -1), 10);
    return n >= 1 && n <= 12;
  });
}

// ─── COMPATIBILITY SCORE ──────────────────────────────────────────────────────
// How well do two keys mix? 1.0 = perfect, 0.0 = clash

export function harmonicCompatibilityScore(
  codeA: CamelotCode,
  codeB: CamelotCode,
): number {
  if (codeA === codeB) return 1.0;

  const numA = parseInt(codeA.slice(0, -1), 10);
  const numB = parseInt(codeB.slice(0, -1), 10);
  const letterA = codeA.slice(-1);
  const letterB = codeB.slice(-1);

  // Parallel (same number, different letter)
  if (numA === numB) return 0.9;

  // Circular distance
  const diff = Math.min(
    Math.abs(numA - numB),
    12 - Math.abs(numA - numB),
  );

  if (diff === 1 && letterA === letterB) return 0.85;
  if (diff === 1) return 0.7;
  if (diff === 2 && letterA === letterB) return 0.5;
  if (diff === 3 && letterA === letterB) return 0.3;

  return 0.1;
}

// ─── BPM COMPATIBILITY ────────────────────────────────────────────────────────
// Accounts for halftime / doubletime / 3/4 relationships

export function bpmCompatibilityScore(bpmA: number, bpmB: number): number {
  const ratios = [1, 0.5, 2, 0.75, 1.5];
  let best = 0;
  for (const ratio of ratios) {
    const diff = Math.abs(bpmA - bpmB * ratio) / bpmA;
    const score = Math.max(0, 1 - diff * 10); // 10% diff → score = 0
    if (score > best) best = score;
  }
  return best;
}

// ─── OVERALL MIX COMPATIBILITY ────────────────────────────────────────────────
// Harmonic weighted at 65%, BPM at 35% — authentic Amapiano DJ priorities

export function mixCompatibilityScore(
  trackA: { key: string; bpm: number },
  trackB: { key: string; bpm: number },
): number {
  const codeA = getCamelotCode(trackA.key);
  const codeB = getCamelotCode(trackB.key);

  const harmonic = codeA && codeB
    ? harmonicCompatibilityScore(codeA, codeB)
    : 0.5; // Unknown key → neutral

  const bpm = bpmCompatibilityScore(trackA.bpm, trackB.bpm);

  return (harmonic * 0.65) + (bpm * 0.35);
}

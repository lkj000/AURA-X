import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function scoreColor(score: number): string {
  if (score >= 0.75) return "text-emerald-400";
  if (score >= 0.6) return "text-yellow-400";
  return "text-red-400";
}

export function scoreBg(score: number): string {
  if (score >= 0.75) return "bg-emerald-400";
  if (score >= 0.6) return "bg-yellow-400";
  return "bg-red-400";
}

export function fmt(score: number): string {
  return (score * 100).toFixed(0) + "%";
}

export const SUBGENRES = [
  "private_school",
  "bacardi",
  "sgija",
  "stixx_sgija",
  "mbiraiano",
  "gqom_fusion",
  "hybrid_rnb_amapiano",
] as const;

export const SUBGENRE_LABELS: Record<string, string> = {
  private_school: "Private School",
  bacardi: "Bacardi",
  sgija: "Sgija",
  stixx_sgija: "Stixx Sgija",
  mbiraiano: "Mbiraiano",
  gqom_fusion: "Gqom Fusion",
  hybrid_rnb_amapiano: "Hybrid R&B Amapiano",
};

export const KEYS = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
  "Cm", "C#m", "Dm", "D#m", "Em", "Fm",
  "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
];

// First preferred key per subgenre — sourced from CULTURAL_PROFILES keyBias
export const SUBGENRE_DEFAULT_KEYS: Record<string, string> = {
  private_school:       "Am",
  sgija:                "Gm",
  bacardi:              "Am",
  stixx_sgija:          "Cm",
  mbiraiano:            "Am",
  gqom_fusion:          "Cm",
  hybrid_rnb_amapiano:  "Am",
};

// Middle of each subgenre's BPM range
export const SUBGENRE_DEFAULT_BPM: Record<string, number> = {
  private_school:       112,
  sgija:                114,
  bacardi:              119,
  stixx_sgija:          115,
  mbiraiano:            111,
  gqom_fusion:          119,
  hybrid_rnb_amapiano:  112,
};

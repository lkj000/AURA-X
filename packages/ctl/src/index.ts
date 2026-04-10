/**
 * CTL_v1 — Compositional Thought Language, version 1
 * Seed type — full schema implemented in Job 02
 *
 * CTLBase is the shared data model all AURA X agents read and write.
 * Every generation mode (Suno prompt / MusicGen / Suno API) derives from this.
 */
export type CTLBase = {
  schema_version: "ctl_v1";
  title: string;
  bpm: number;
  key: string;
  subgenre: string;
};

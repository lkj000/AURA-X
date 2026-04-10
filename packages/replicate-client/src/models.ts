// MusicGen model versions on Replicate
// We use facebook/musicgen — the standard open model
// Do NOT use unofficial or forked versions

export const MUSICGEN_MODELS = {
  // Standard MusicGen (melody + stereo)
  // Model: facebook/musicgen
  stereo_melody: "facebook/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eeab43",

  // Smaller model for faster generation (testing / lower latency)
  stereo_small: "facebook/musicgen:7be0f12c54a8d033a0fbd14418c9af98962da9a86f5ff7811f9b3423a1f0b7d7",
} as const;

export type MusicGenModelKey = keyof typeof MUSICGEN_MODELS;

// Default generation parameters for Amapiano
export const MUSICGEN_DEFAULTS = {
  model_version:    "stereo_melody",
  duration:         30,          // seconds — standard loop length
  temperature:      1.0,
  top_k:            250,
  top_p:            0.0,
  classifier_free_guidance: 3.0,
  output_format:    "wav",
  normalization_strategy: "peak",
} as const;

// Amapiano audio intelligence — TypeScript port of aura-x-engine DSP core.
// Implements 4-lane authenticity scoring without external dependencies.

export interface AudioFeatures {
  bpm: number;
  energyRms: number;
  spectralCentroid: number;
  swingRatio: number;
  syncopationIndex: number;
  durationSec: number;
  sampleRate: number;
}

export interface LaneScore {
  lane: "private_school" | "sgija" | "bacardi" | "commercial";
  score: number;
  probability: number;
}

export interface AmapianEvaluation {
  bpm: number;
  energyRms: number;
  spectralCentroid: number;
  swingRatio: number;
  syncopationIndex: number;
  durationSec: number;
  topLane: string;
  lanes: LaneScore[];
  authenticityScore: number;
  passesThreshold: boolean;
  threshold: number;
  isHybrid: boolean;
  issues: string[];
}

export interface Enhancement {
  recommendedCtl: Record<string, unknown>;
  suggestions: string[];
  canAutoEnhance: boolean;
}

// Acoustic targets per lane — ported from aura-x-engine authenticity_scoring.py
const LANE_TARGETS = {
  private_school: { bpm: 112, energy: 0.45, centroid: 1375, syncopation: 0.25, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  sgija:          { bpm: 114, energy: 0.80, centroid: 1525, syncopation: 0.50, bpmSigma: 3, energySigma: 0.10, centroidSigma: 200, syncopSigma: 0.12 },
  bacardi:        { bpm: 118, energy: 0.90, centroid: 1700, syncopation: 0.65, bpmSigma: 3, energySigma: 0.10, centroidSigma: 250, syncopSigma: 0.12 },
  commercial:     { bpm: 116, energy: 0.82, centroid: 1950, syncopation: 0.15, bpmSigma: 4, energySigma: 0.12, centroidSigma: 300, syncopSigma: 0.12 },
} as const;

const LANE_WEIGHTS = {
  private_school: { bpm: 0.30, energy: 0.25, centroid: 0.20, syncopation: 0.25 },
  sgija:          { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  bacardi:        { bpm: 0.25, energy: 0.30, centroid: 0.20, syncopation: 0.25 },
  commercial:     { bpm: 0.25, energy: 0.25, centroid: 0.30, syncopation: 0.20 },
};

export const AMAPIANO_THRESHOLD = 0.60;

// ── DSP primitives ────────────────────────────────────────────────────────────

function gaussScore(val: number, target: number, sigma: number): number {
  const d = (val - target) / sigma;
  return Math.exp(-0.5 * d * d);
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// ── WAV parser ────────────────────────────────────────────────────────────────

export function parseWavMono(buffer: Buffer): { samples: number[]; sampleRate: number; durationSec: number } {
  if (buffer.length < 44) throw new Error("File too small to be a valid WAV");

  if (buffer.slice(0, 4).toString("ascii") !== "RIFF" ||
      buffer.slice(8, 12).toString("ascii") !== "WAVE") {
    throw new Error("Not a valid WAV file (missing RIFF/WAVE header)");
  }

  let offset = 12;
  let sampleRate = 44100, channels = 1, bitsPerSample = 16, audioFormat = 1;
  let dataOffset = -1, dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId   = buffer.slice(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      audioFormat   = buffer.readUInt16LE(offset + 8);
      channels      = buffer.readUInt16LE(offset + 10);
      sampleRate    = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize   = chunkSize;
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2); // RIFF word-alignment
  }

  if (dataOffset < 0) throw new Error("No data chunk found in WAV");

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples   = Math.floor(dataSize / (bytesPerSample * channels));
  const samples: number[] = new Array(totalSamples);
  const scale = bitsPerSample < 32 ? 1 / (2 ** (bitsPerSample - 1)) : 1;

  for (let i = 0; i < totalSamples; i++) {
    const base = dataOffset + i * bytesPerSample * channels;
    let mono = 0;

    if (audioFormat === 3 && bitsPerSample === 32) {
      mono = buffer.readFloatLE(base);
    } else if (bitsPerSample === 16) {
      mono = buffer.readInt16LE(base) * scale;
    } else if (bitsPerSample === 24) {
      const b0 = buffer[base], b1 = buffer[base + 1], b2 = buffer[base + 2];
      let v = (b2 << 16) | (b1 << 8) | b0;
      if (v & 0x800000) v -= 0x1000000;
      mono = v / 0x800000;
    } else if (bitsPerSample === 32) {
      mono = buffer.readInt32LE(base) * scale;
    }

    // Downmix additional channels to mono
    if (channels > 1) {
      let sum = mono;
      for (let ch = 1; ch < channels; ch++) {
        const bPos = base + ch * bytesPerSample;
        if (audioFormat === 3 && bitsPerSample === 32) sum += buffer.readFloatLE(bPos);
        else if (bitsPerSample === 16) sum += buffer.readInt16LE(bPos) * scale;
        else if (bitsPerSample === 24) {
          const b0 = buffer[bPos], b1 = buffer[bPos + 1], b2 = buffer[bPos + 2];
          let v = (b2 << 16) | (b1 << 8) | b0;
          if (v & 0x800000) v -= 0x1000000;
          sum += v / 0x800000;
        }
      }
      mono = sum / channels;
    }

    samples[i] = mono;
  }

  return { samples, sampleRate, durationSec: totalSamples / sampleRate };
}

// ── Feature extraction ────────────────────────────────────────────────────────

// BPM via energy-envelope autocorrelation (ported from aura-x-engine feature_extraction.py)
function estimateBpm(samples: number[], sampleRate: number): number {
  const FRAME = 512;
  const fps   = sampleRate / FRAME;

  const energy: number[] = [];
  for (let i = 0; i + FRAME <= samples.length; i += FRAME) {
    let rms = 0;
    for (let j = 0; j < FRAME; j++) rms += samples[i + j] ** 2;
    energy.push(Math.sqrt(rms / FRAME));
  }

  if (energy.length < 30) return 112; // too short — fall back to Amapiano default

  const minLag = Math.max(1, Math.round(fps * 60 / 200));
  const maxLag = Math.min(Math.floor(energy.length / 2), Math.round(fps * 60 / 40));
  const n = energy.length;

  let bestLag = Math.round(fps * 60 / 112), bestCorr = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const len = n - lag;
    for (let i = 0; i < len; i++) corr += energy[i] * energy[i + lag];
    corr /= len;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  const bpm = fps * 60 / bestLag;
  return Math.min(160, Math.max(60, Math.round(bpm)));
}

function computeRmsEnergy(samples: number[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.min(1, Math.sqrt(sum / samples.length));
}

// Spectral centroid estimate via zero-crossing rate × Nyquist/2
function estimateSpectralCentroid(samples: number[], sampleRate: number): number {
  if (samples.length < 2) return 1375;
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings++;
  }
  const zcr = crossings / (samples.length - 1);
  return Math.max(100, Math.min(8000, zcr * sampleRate / 2));
}

// Swing ratio from inter-onset intervals
function estimateSwing(samples: number[], sampleRate: number): number {
  const FRAME = 128;
  const energy: number[] = [];
  for (let i = 0; i + FRAME <= samples.length; i += FRAME) {
    let rms = 0;
    for (let j = 0; j < FRAME; j++) rms += samples[i + j] ** 2;
    energy.push(Math.sqrt(rms / FRAME));
  }

  const threshold = Math.max(...energy) * 0.35;
  const onsets: number[] = [];
  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] > threshold && energy[i] > energy[i - 1] && energy[i] >= energy[i + 1]) {
      onsets.push(i);
    }
  }

  if (onsets.length < 4) return 0.50;

  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) gaps.push(onsets[i] - onsets[i - 1]);

  const even = gaps.filter((_, i) => i % 2 === 0);
  const odd  = gaps.filter((_, i) => i % 2 !== 0);
  if (!even.length || !odd.length) return 0.50;

  const meanEven = even.reduce((a, b) => a + b, 0) / even.length;
  const total    = meanEven + odd.reduce((a, b) => a + b, 0) / odd.length;
  if (total === 0) return 0.50;

  return Math.max(0.45, Math.min(0.58, meanEven / total));
}

// Syncopation index — fraction of onsets landing on weak metric positions
function estimateSyncopation(samples: number[], sampleRate: number, bpm: number): number {
  const FRAME = 128;
  const fps = sampleRate / FRAME;
  const framesPerStep = fps * 60 / (bpm * 4);

  const energy: number[] = [];
  for (let i = 0; i + FRAME <= samples.length; i += FRAME) {
    let rms = 0;
    for (let j = 0; j < FRAME; j++) rms += samples[i + j] ** 2;
    energy.push(Math.sqrt(rms / FRAME));
  }

  const threshold = Math.max(...energy) * 0.40;
  let onsets = 0, weakOnsets = 0;

  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] > threshold && energy[i] > energy[i - 1]) {
      onsets++;
      const step = Math.round(i / framesPerStep) % 4;
      if (step === 1 || step === 3) weakOnsets++;
    }
  }

  return onsets > 0 ? Math.min(1, weakOnsets / onsets) : 0.25;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function extractAudioFeatures(buffer: Buffer): AudioFeatures {
  const { samples, sampleRate, durationSec } = parseWavMono(buffer);

  const bpm              = estimateBpm(samples, sampleRate);
  const energyRms        = computeRmsEnergy(samples);
  const spectralCentroid = estimateSpectralCentroid(samples, sampleRate);
  const swingRatio       = estimateSwing(samples, sampleRate);
  const syncopationIndex = estimateSyncopation(samples, sampleRate, bpm);

  return { bpm, energyRms, spectralCentroid, swingRatio, syncopationIndex, durationSec, sampleRate };
}

export function scoreLanes(features: AudioFeatures): LaneScore[] {
  const laneNames = Object.keys(LANE_TARGETS) as Array<keyof typeof LANE_TARGETS>;

  const raw = laneNames.map((lane) => {
    const t = LANE_TARGETS[lane];
    const w = LANE_WEIGHTS[lane];
    return (
      w.bpm        * gaussScore(features.bpm,              t.bpm,        t.bpmSigma) +
      w.energy     * gaussScore(features.energyRms,        t.energy,     t.energySigma) +
      w.centroid   * gaussScore(features.spectralCentroid, t.centroid,   t.centroidSigma) +
      w.syncopation * gaussScore(features.syncopationIndex, t.syncopation, t.syncopSigma)
    );
  });

  const probs = softmax(raw);

  return laneNames
    .map((lane, i) => ({ lane, score: raw[i], probability: probs[i] }))
    .sort((a, b) => b.score - a.score);
}

export function evaluateAmapiano(features: AudioFeatures): AmapianEvaluation {
  const lanes    = scoreLanes(features);
  const top      = lanes[0];
  const second   = lanes[1];
  const t        = LANE_TARGETS[top.lane as keyof typeof LANE_TARGETS];
  const issues: string[] = [];

  if (Math.abs(features.bpm - t.bpm) > 6) {
    issues.push(`BPM ${features.bpm} outside ${top.lane} target (${t.bpm} ± 6)`);
  }
  if (Math.abs(features.energyRms - t.energy) > 0.20) {
    const dir = features.energyRms < t.energy ? "low" : "high";
    issues.push(`Energy too ${dir} for ${top.lane} (RMS ${features.energyRms.toFixed(2)}, target ${t.energy})`);
  }
  if (features.durationSec < 10) {
    issues.push("Track under 10 s — analysis confidence is reduced");
  }

  const passesThreshold = top.score >= AMAPIANO_THRESHOLD;
  if (!passesThreshold) {
    issues.push(`Authenticity ${top.score.toFixed(2)} below threshold ${AMAPIANO_THRESHOLD}`);
  }

  return {
    bpm:              features.bpm,
    energyRms:        features.energyRms,
    spectralCentroid: features.spectralCentroid,
    swingRatio:       features.swingRatio,
    syncopationIndex: features.syncopationIndex,
    durationSec:      features.durationSec,
    topLane:          top.lane,
    lanes,
    authenticityScore: top.score,
    passesThreshold,
    threshold:        AMAPIANO_THRESHOLD,
    isHybrid:         (top.probability - second.probability) < 0.10,
    issues,
  };
}

export function buildEnhancement(evaluation: AmapianEvaluation): Enhancement {
  const lane = evaluation.topLane as keyof typeof LANE_TARGETS;
  const t    = LANE_TARGETS[lane];
  const suggestions: string[] = [];

  const targetBpm = Math.abs(evaluation.bpm - t.bpm) > 6 ? t.bpm : evaluation.bpm;
  if (targetBpm !== evaluation.bpm) {
    suggestions.push(`Adjust BPM from ${evaluation.bpm} to ${t.bpm} (${lane} target)`);
  }
  if (Math.abs(evaluation.energyRms - t.energy) > 0.20) {
    const dir = evaluation.energyRms < t.energy ? "Increase" : "Reduce";
    suggestions.push(`${dir} overall energy (current RMS ${evaluation.energyRms.toFixed(2)}, target ${t.energy})`);
  }

  const laneHints: Record<string, string[]> = {
    private_school: [
      "Add log drum with ~110 Hz fundamental and characteristic pitch glide",
      "Keep arrangement sparse — space is the private school signature",
    ],
    sgija: [
      "Emphasize syncopated hi-hat on off-beats (sgija character)",
      "Layer vocal chants (ukusigqa) for authentic feel",
    ],
    bacardi: [
      "Increase percussive density and off-beat bassline drive",
      "Push hi-hat and shaker to top of the mix",
    ],
    commercial: [
      "Brighten the spectral mix — commercial Amapiano sits higher (~1950 Hz centroid)",
      "Reduce syncopation for a polished, accessible groove",
    ],
  };
  suggestions.push(...(laneHints[lane] ?? []));

  const recommendedCtl: Record<string, unknown> = {
    global: {
      bpm:              targetBpm,
      key:              "Am",
      subgenre:         lane,
      emotional_profile: lane === "private_school" ? "deep_groove"
                       : lane === "sgija"          ? "high_energy"
                       : lane === "commercial"     ? "polished"
                       :                            "raw",
    },
    amapiano: {
      log_drum_weight:           0.90,
      log_drum_fundamental_hz:   110,
      swing_ratio:               t.syncopation > 0.40 ? 0.52 : 0.50,
      syncopation_density:       t.syncopation,
      bass_piano_exclusivity:    0.32,
      event_density_per_bar:     4,
    },
    mix: {
      target_rms_energy:          t.energy,
      spectral_centroid_target_hz: t.centroid,
    },
    suno_generation: {
      style_prompt_bias: lane,
      bpm_override:      targetBpm,
    },
  };

  return {
    recommendedCtl,
    suggestions,
    canAutoEnhance: !evaluation.passesThreshold,
  };
}

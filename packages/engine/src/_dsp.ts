// DSP primitives — real FFT, autocorrelation, spectral analysis.
// Stdlib-only: no external dependencies. Mirrors aura-x-engine/intelligence/signal.py

// ── Cooley-Tukey in-place DIT FFT ────────────────────────────────────────────

export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }

  // Butterfly passes
  for (let half = 1; half < n; half <<= 1) {
    const theta = -Math.PI / half;
    const wr0 = Math.cos(theta);
    const wi0 = Math.sin(theta);

    for (let i = 0; i < n; i += half << 1) {
      let wr = 1.0, wi = 0.0;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k],         ui = im[i + k];
        const vr = re[i + k + half] * wr - im[i + k + half] * wi;
        const vi = re[i + k + half] * wi + im[i + k + half] * wr;

        re[i + k]        = ur + vr;
        im[i + k]        = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;

        const tmp = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = tmp;
      }
    }
  }
}

// Pad to next power-of-two
export function fftPadded(signal: ArrayLike<number>): Float64Array {
  let n = 1;
  while (n < signal.length) n <<= 1;
  const re = new Float64Array(n);
  for (let i = 0; i < signal.length; i++) re[i] = signal[i];
  return re;
}

// ── Hann window ───────────────────────────────────────────────────────────────

export function applyHann(buf: Float64Array, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
  }
}

// ── Spectral centroid (FFT-based, mirrors _spectral_centroid_fft) ─────────────

export function spectralCentroidFft(
  samples: number[],
  sampleRate: number,
  frameSize = 1024,
): number {
  const n = Math.min(frameSize, samples.length);
  const size = nextPow2(n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);

  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = samples[i] * w;
  }

  fftInPlace(re, im);

  const binWidth = sampleRate / size;
  let sumMagFreq = 0, sumMag = 0;

  for (let k = 1; k < size / 2; k++) {
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    sumMagFreq += k * binWidth * mag;
    sumMag += mag;
  }

  const centroid = sumMag > 0 ? sumMagFreq / sumMag : 1375;
  return Math.max(50, Math.min(12000, centroid));
}

// ── Band energy decomposition (mirrors _band_energies) ───────────────────────

export function bandEnergies(
  samples: number[],
  sampleRate: number,
  frameSize = 1024,
): { subBass: number; lowMid: number; high: number } {
  const n = Math.min(frameSize, samples.length);
  const size = nextPow2(n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);

  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = samples[i] * w;
  }

  fftInPlace(re, im);

  const binWidth = sampleRate / size;
  let subBassE = 0, lowMidE = 0, highE = 0, total = 0;

  for (let k = 1; k < size / 2; k++) {
    const freq = k * binWidth;
    const power = re[k] * re[k] + im[k] * im[k];
    if (freq < 150)      subBassE += power;
    else if (freq < 800) lowMidE  += power;
    else                 highE    += power;
    total += power;
  }

  if (total === 0) return { subBass: 0, lowMid: 0, high: 0 };
  return { subBass: subBassE / total, lowMid: lowMidE / total, high: highE / total };
}

// ── BPM estimation via energy-envelope autocorrelation + parabolic interp ────

export function estimateBpm(samples: number[], sampleRate: number): number {
  const FRAME = 512;
  const fps   = sampleRate / FRAME;

  const energy: number[] = [];
  for (let i = 0; i + FRAME <= samples.length; i += FRAME) {
    let rms = 0;
    for (let j = 0; j < FRAME; j++) rms += samples[i + j] ** 2;
    energy.push(Math.sqrt(rms / FRAME));
  }

  if (energy.length < 30) return 112;

  const minLag = Math.max(2, Math.round(fps * 60 / 200));
  const maxLag = Math.min(Math.floor(energy.length / 2), Math.round(fps * 60 / 40));
  const n      = energy.length;

  const corrs = new Float64Array(maxLag + 2);
  let bestLag  = Math.round(fps * 60 / 112);
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const len = n - lag;
    for (let i = 0; i < len; i++) corr += energy[i] * energy[i + lag];
    corr /= len;
    corrs[lag] = corr;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  // Parabolic interpolation for sub-integer precision
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = corrs[bestLag - 1], y1 = corrs[bestLag], y2 = corrs[bestLag + 1];
    const denom = 2 * (2 * y1 - y0 - y2);
    if (denom > 1e-10) refinedLag = bestLag + (y0 - y2) / denom;
  }

  const bpm = fps * 60 / refinedLag;
  return Math.max(60, Math.min(200, Math.round(bpm)));
}

// ── Pitch estimation (fundamental frequency) via autocorrelation ──────────────

export function estimateFundamental(samples: number[], sampleRate: number): number {
  if (samples.length < 128) return 110;

  const n      = Math.min(4096, samples.length);
  const minLag = Math.floor(sampleRate / 300);  // 300 Hz max
  const maxLag = Math.floor(sampleRate / 50);   // 50 Hz min

  let bestLag  = Math.floor(sampleRate / 110), bestCorr = -Infinity;

  for (let lag = minLag; lag <= Math.min(maxLag, n / 2); lag++) {
    let corr = 0;
    const len = n - lag;
    for (let i = 0; i < len; i++) corr += samples[i] * samples[i + lag];
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  return sampleRate / bestLag;
}

// ── RMS energy [0, 1] ─────────────────────────────────────────────────────────

export function computeRmsEnergy(samples: number[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.min(1, Math.sqrt(sum / samples.length));
}

// ── Chroma vector (12-bin pitch-class energy) ─────────────────────────────────

export function computeChroma(samples: number[], sampleRate: number): Float64Array {
  const N    = 4096;
  const n    = Math.min(N, samples.length);
  const size = nextPow2(n);
  const re   = new Float64Array(size);
  const im   = new Float64Array(size);

  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = samples[i] * w;
  }
  fftInPlace(re, im);

  const binWidth  = sampleRate / size;
  const chroma    = new Float64Array(12);
  const A4_HZ     = 440.0;

  for (let k = 1; k < size / 2; k++) {
    const freq = k * binWidth;
    if (freq < 80 || freq > 5000) continue;
    const power     = re[k] * re[k] + im[k] * im[k];
    const midiFloat = 69 + 12 * Math.log2(freq / A4_HZ);
    const pitchClass = ((Math.round(midiFloat) % 12) + 12) % 12;
    chroma[pitchClass] += power;
  }

  // Normalise
  let maxC = 0;
  for (let i = 0; i < 12; i++) if (chroma[i] > maxC) maxC = chroma[i];
  if (maxC > 0) for (let i = 0; i < 12; i++) chroma[i] /= maxC;

  return chroma;
}

// ── Onset envelope (half-wave rectified energy diff) ─────────────────────────

export function onsetEnvelope(samples: number[], frameSize = 512): number[] {
  const energy: number[] = [];
  for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
    let rms = 0;
    for (let j = 0; j < frameSize; j++) rms += samples[i + j] ** 2;
    energy.push(Math.sqrt(rms / frameSize));
  }

  const envelope: number[] = [0];
  for (let i = 1; i < energy.length; i++) {
    envelope.push(Math.max(0, energy[i] - energy[i - 1]));  // half-wave rectify
  }
  return envelope;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

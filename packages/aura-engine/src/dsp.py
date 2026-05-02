"""
Digital Signal Processing — first-principles audio analysis.

Five capabilities, all pure numpy/scipy:
  1. BPM via onset-envelope autocorrelation
  2. Key via Krumhansl-Schmuckler correlation
  3. B_eff — spectral energy ratio (20–300 Hz / total)
  4. Log drum fingerprinting — 4-feature characterisation
  5. Groove analysis — swing, syncopation, microtiming
"""

from __future__ import annotations
import math
import numpy as np
from dataclasses import dataclass
from typing import Optional
from scipy.signal import butter, sosfilt, find_peaks

# ── Constants ─────────────────────────────────────────────────────────────────

SR_DEFAULT   = 44100
HOP_SIZE     = 512        # frames between onset envelope samples
ONSET_FILT_N = 3          # order for onset smoothing Butterworth
BPM_MIN      = 60.0
BPM_MAX      = 180.0
B_EFF_LO_HZ  = 20.0
B_EFF_HI_HZ  = 300.0

# Krumhansl-Schmuckler key profiles (major / minor)
_KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                       2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                       2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

_NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

# ── Public data classes ────────────────────────────────────────────────────────

@dataclass
class BPMResult:
    bpm: float
    confidence: float        # 0–1, peak prominence / mean
    onset_count: int

@dataclass
class KeyResult:
    root: str                # e.g. "F#"
    mode: str                # "major" | "minor"
    correlation: float       # 0–1

@dataclass
class BEffResult:
    b_eff: float             # spectral ratio 20–300 Hz band
    low_energy_db: float     # dBFS of 20–300 Hz band
    total_energy_db: float   # dBFS of full spectrum

@dataclass
class LogDrumFingerprint:
    fundamental_hz: float    # dominant frequency in log drum hit
    decay_ms: float          # -60 dB decay time
    harmonic_ratio: float    # energy above 2nd harmonic / total
    centroid_hz: float       # spectral centroid of the hit

@dataclass
class GrooveResult:
    swing_ratio: float       # IOI ratio at 8th-note grid (1.0 = straight)
    syncopation: float       # fraction of onsets off the 4/4 beat grid
    microtiming_std_ms: float # std dev of onset-to-grid deviation in ms
    tempo_stability: float   # autocorrelation peak sharpness (0–1)


# ── 1. BPM via autocorrelation ─────────────────────────────────────────────────

def _onset_envelope(audio: np.ndarray, sr: int, hop: int) -> np.ndarray:
    """Spectral flux onset strength: sum of positive first-differences in |STFT|."""
    n_fft = hop * 4
    frames = (len(audio) - n_fft) // hop + 1
    if frames < 4:
        return np.zeros(max(1, frames))

    env = np.zeros(frames)
    prev_mag = None
    for i in range(frames):
        start = i * hop
        frame = audio[start : start + n_fft] * np.hanning(n_fft)
        mag = np.abs(np.fft.rfft(frame))
        if prev_mag is not None:
            diff = mag - prev_mag
            env[i] = float(np.sum(diff[diff > 0]))
        prev_mag = mag
    return env


def _lowpass(signal: np.ndarray, cutoff_hz: float, sr: float, order: int = 3) -> np.ndarray:
    nyq = sr / 2.0
    sos = butter(order, cutoff_hz / nyq, btype="low", output="sos")
    return sosfilt(sos, signal)


def estimate_bpm(audio: np.ndarray, sr: int = SR_DEFAULT) -> BPMResult:
    """
    BPM from onset-envelope autocorrelation.

    R[τ] = Σ_t env[t] · env[t+τ]

    The lag τ* with the highest peak in the BPM-valid range gives the beat period.
    """
    env = _onset_envelope(audio, sr, HOP_SIZE)
    env = _lowpass(env, 8.0, sr / HOP_SIZE)
    env -= env.mean()

    # Autocorrelation via FFT — O(n log n)
    n = len(env)
    padded = np.zeros(2 * n)
    padded[:n] = env
    ac = np.fft.irfft(np.abs(np.fft.rfft(padded)) ** 2)
    ac = ac[:n]

    # Convert lag range to sample indices
    hop_sr = sr / HOP_SIZE   # onset frames per second
    lag_min = int(hop_sr * 60.0 / BPM_MAX)
    lag_max = int(hop_sr * 60.0 / BPM_MIN)
    lag_min = max(1, lag_min)
    lag_max = min(n - 1, lag_max)

    if lag_min >= lag_max:
        return BPMResult(bpm=120.0, confidence=0.0, onset_count=int(np.sum(env > 0)))

    region = ac[lag_min : lag_max + 1]
    peak_idx = int(np.argmax(region))
    best_lag = peak_idx + lag_min

    bpm = 60.0 * hop_sr / best_lag
    confidence = float(region[peak_idx] / (np.mean(np.abs(region)) + 1e-9))
    confidence = float(np.clip(confidence / 5.0, 0.0, 1.0))  # normalise to 0-1

    onset_count = int((env > env.mean() + env.std()).sum())
    return BPMResult(bpm=round(bpm, 2), confidence=confidence, onset_count=onset_count)


# ── 2. Key via Krumhansl-Schmuckler ───────────────────────────────────────────

def _chroma_vector(audio: np.ndarray, sr: int) -> np.ndarray:
    """12-bin chroma vector built from constant-Q–like bin mapping."""
    n_fft = 4096
    if len(audio) < n_fft:
        audio = np.pad(audio, (0, n_fft - len(audio)))

    # Average magnitude spectrum over short frames
    hop = n_fft // 2
    n_frames = max(1, (len(audio) - n_fft) // hop + 1)
    mag_sum = np.zeros(n_fft // 2 + 1)
    for i in range(n_frames):
        frame = audio[i * hop : i * hop + n_fft] * np.hanning(n_fft)
        mag_sum += np.abs(np.fft.rfft(frame))
    mag = mag_sum / n_frames

    # Map each FFT bin to chroma class
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    chroma = np.zeros(12)
    for bin_idx, freq in enumerate(freqs):
        if freq < 27.5 or freq > 4200.0:
            continue
        midi = 12.0 * math.log2(freq / 440.0) + 69.0
        pitch_class = int(round(midi)) % 12
        chroma[pitch_class] += mag[bin_idx]

    total = chroma.sum()
    if total > 0:
        chroma /= total
    return chroma


def detect_key(audio: np.ndarray, sr: int = SR_DEFAULT) -> KeyResult:
    """
    Krumhansl-Schmuckler: correlate chroma profile with all 24 key templates.
    Best r → root + mode.
    """
    chroma = _chroma_vector(audio, sr)
    best_r = -2.0
    best_root = 0
    best_mode = "major"

    for root in range(12):
        major_template = np.roll(_KS_MAJOR, root)
        minor_template = np.roll(_KS_MINOR, root)

        r_maj = float(np.corrcoef(chroma, major_template)[0, 1])
        r_min = float(np.corrcoef(chroma, minor_template)[0, 1])

        if r_maj > best_r:
            best_r, best_root, best_mode = r_maj, root, "major"
        if r_min > best_r:
            best_r, best_root, best_mode = r_min, root, "minor"

    correlation = float(np.clip((best_r + 1.0) / 2.0, 0.0, 1.0))
    return KeyResult(
        root=_NOTE_NAMES[best_root],
        mode=best_mode,
        correlation=round(correlation, 4),
    )


# ── 3. B_eff — spectral energy ratio ──────────────────────────────────────────

def compute_b_eff(audio: np.ndarray, sr: int = SR_DEFAULT) -> BEffResult:
    """
    B_eff = E(20–300 Hz) / E(total).

    Uses short-time average power spectrum to smooth out transient peaks.
    """
    n_fft = 2048
    hop = n_fft // 2
    n_frames = max(1, (len(audio) - n_fft) // hop + 1)

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    lo_mask = (freqs >= B_EFF_LO_HZ) & (freqs <= B_EFF_HI_HZ)

    power_total = 0.0
    power_lo    = 0.0

    for i in range(n_frames):
        frame = audio[i * hop : i * hop + n_fft] * np.hanning(n_fft)
        if len(frame) < n_fft:
            frame = np.pad(frame, (0, n_fft - len(frame)))
        mag2 = np.abs(np.fft.rfft(frame)) ** 2
        power_total += float(mag2.sum())
        power_lo    += float(mag2[lo_mask].sum())

    power_total = max(power_total, 1e-12)
    b_eff = float(power_lo / power_total)

    # Normalize by n_frames and n_fft² so the result is relative to full-scale
    _norm = n_frames * (n_fft // 2) ** 2

    def _db(p: float) -> float:
        return 10.0 * math.log10(max(p / _norm, 1e-12))

    return BEffResult(
        b_eff=round(b_eff, 4),
        low_energy_db=round(_db(power_lo), 2),
        total_energy_db=round(_db(power_total), 2),
    )


# ── 4. Log drum fingerprinting ────────────────────────────────────────────────

def _isolate_hit(audio: np.ndarray, sr: int, onset_sample: int,
                  window_ms: float = 400.0) -> np.ndarray:
    """Extract a single percussion hit centred on onset_sample."""
    n = int(sr * window_ms / 1000.0)
    start = max(0, onset_sample - n // 8)
    end   = min(len(audio), start + n)
    return audio[start:end]


def _spectral_centroid(mag: np.ndarray, freqs: np.ndarray) -> float:
    total = mag.sum()
    if total < 1e-12:
        return 0.0
    return float((mag * freqs).sum() / total)


def _decay_time_ms(hit: np.ndarray, sr: int, threshold_db: float = -60.0) -> float:
    """Time from peak amplitude to threshold_db below peak."""
    env = np.abs(hit)
    peak_idx = int(np.argmax(env))
    peak_val = env[peak_idx]
    if peak_val < 1e-9:
        return 0.0
    threshold = peak_val * (10.0 ** (threshold_db / 20.0))
    after_peak = env[peak_idx:]
    below = np.where(after_peak < threshold)[0]
    if len(below) == 0:
        return float(len(after_peak)) / sr * 1000.0
    return float(below[0]) / sr * 1000.0


def fingerprint_log_drum(audio: np.ndarray, sr: int = SR_DEFAULT,
                          onset_sample: Optional[int] = None) -> LogDrumFingerprint:
    """
    4-feature characterisation of a log drum hit.

    If onset_sample is None, takes the loudest transient in the signal.
    """
    if onset_sample is None:
        env = np.abs(audio)
        onset_sample = int(np.argmax(env))

    hit = _isolate_hit(audio, sr, onset_sample)
    if len(hit) < 16:
        return LogDrumFingerprint(
            fundamental_hz=0.0, decay_ms=0.0, harmonic_ratio=0.0, centroid_hz=0.0
        )

    n_fft = min(1024, len(hit))
    windowed = hit[:n_fft] * np.hanning(n_fft)
    mag = np.abs(np.fft.rfft(windowed))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)

    # Fundamental: strongest peak in 40–300 Hz
    lo_mask = (freqs >= 40.0) & (freqs <= 300.0)
    lo_mag  = mag.copy()
    lo_mag[~lo_mask] = 0.0
    fund_bin = int(np.argmax(lo_mag))
    fundamental_hz = float(freqs[fund_bin]) if lo_mag[fund_bin] > 0 else 0.0

    # Harmonic ratio: energy above 2× fundamental / total
    if fundamental_hz > 0:
        harmonic_cutoff = 2.0 * fundamental_hz
        above_mask = freqs > harmonic_cutoff
        total_energy = float((mag ** 2).sum())
        harmonic_energy = float((mag[above_mask] ** 2).sum())
        harmonic_ratio = harmonic_energy / max(total_energy, 1e-12)
    else:
        harmonic_ratio = 0.0

    centroid_hz = _spectral_centroid(mag, freqs)
    decay_ms    = _decay_time_ms(hit, sr)

    return LogDrumFingerprint(
        fundamental_hz=round(fundamental_hz, 1),
        decay_ms=round(decay_ms, 1),
        harmonic_ratio=round(harmonic_ratio, 4),
        centroid_hz=round(centroid_hz, 1),
    )


# ── 5. Groove analysis ────────────────────────────────────────────────────────

def _detect_onsets(audio: np.ndarray, sr: int, hop: int = HOP_SIZE) -> np.ndarray:
    """Return onset times in seconds via spectral flux peak picking."""
    env = _onset_envelope(audio, sr, hop)
    env_smooth = _lowpass(env, 20.0, sr / hop)

    threshold = env_smooth.mean() + 0.5 * env_smooth.std()
    peaks, props = find_peaks(env_smooth, height=threshold, distance=4)
    onset_times = peaks * hop / sr
    return onset_times


def analyse_groove(audio: np.ndarray, sr: int = SR_DEFAULT,
                   bpm: Optional[float] = None) -> GrooveResult:
    """
    Groove analysis from onset times:
      - swing_ratio: ratio of long to short 8th-note IOI (1.0 = straight)
      - syncopation: fraction of onsets not on quarter-note grid ±20 ms
      - microtiming_std_ms: std dev of deviation from nearest 16th-note grid point
      - tempo_stability: sharpness of autocorrelation peak (0–1)
    """
    onsets = _detect_onsets(audio, sr)
    if len(onsets) < 4:
        return GrooveResult(
            swing_ratio=1.0, syncopation=0.0,
            microtiming_std_ms=0.0, tempo_stability=0.0
        )

    if bpm is None:
        bpm_result = estimate_bpm(audio, sr)
        bpm = bpm_result.bpm

    beat_period = 60.0 / bpm          # seconds per beat (quarter note)
    eighth_period = beat_period / 2.0  # seconds per 8th note
    sixteenth_period = beat_period / 4.0

    # ── Swing: compare even vs odd 8th-note IOI ───────────────────────────────
    iois = np.diff(onsets)
    # Classify IOIs close to an 8th note
    near_eighth = np.abs(iois - eighth_period) < eighth_period * 0.35
    near_iois = iois[near_eighth]

    if len(near_iois) >= 2:
        long_iois  = near_iois[near_iois >= eighth_period]
        short_iois = near_iois[near_iois <  eighth_period]
        if len(long_iois) > 0 and len(short_iois) > 0:
            swing_ratio = float(np.mean(long_iois) / np.mean(short_iois))
        else:
            swing_ratio = 1.0
    else:
        swing_ratio = 1.0
    swing_ratio = float(np.clip(swing_ratio, 1.0, 2.0))

    # ── Syncopation: onsets not on quarter-note grid ──────────────────────────
    quarter_tol = 0.020  # 20 ms tolerance
    def on_beat(t: float) -> bool:
        phase = (t % beat_period) / beat_period
        return phase < (quarter_tol / beat_period) or phase > (1.0 - quarter_tol / beat_period)

    syncopation = float(sum(1 for t in onsets if not on_beat(t)) / len(onsets))

    # ── Microtiming std ───────────────────────────────────────────────────────
    def nearest_grid_dev(t: float) -> float:
        phase = t % sixteenth_period
        dev = min(phase, sixteenth_period - phase)
        return dev * 1000.0  # ms

    deviations = np.array([nearest_grid_dev(t) for t in onsets])
    microtiming_std_ms = float(np.std(deviations))

    # ── Tempo stability ───────────────────────────────────────────────────────
    env = _onset_envelope(audio, sr, HOP_SIZE)
    env -= env.mean()
    n = len(env)
    ac = np.fft.irfft(np.abs(np.fft.rfft(np.pad(env, (0, n)))) ** 2)[:n]
    hop_sr = sr / HOP_SIZE
    beat_lag = int(round(hop_sr * beat_period))
    if 1 <= beat_lag < n:
        window = max(1, beat_lag // 4)
        lo = max(0, beat_lag - window)
        hi = min(n, beat_lag + window)
        peak_val = float(ac[lo:hi].max())
        mean_val = float(np.abs(ac).mean()) + 1e-9
        tempo_stability = float(np.clip(peak_val / (mean_val * 5.0), 0.0, 1.0))
    else:
        tempo_stability = 0.0

    return GrooveResult(
        swing_ratio=round(swing_ratio, 3),
        syncopation=round(syncopation, 3),
        microtiming_std_ms=round(microtiming_std_ms, 2),
        tempo_stability=round(tempo_stability, 3),
    )

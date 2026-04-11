import io
import uuid
from typing import Optional, Callable
import numpy as np

try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

from lib.supabase_client import supabase


# ─── TRANSITION FUNCTIONS ─────────────────────────────────────────────────────

def _crossfade(
    audio_a: np.ndarray,
    audio_b: np.ndarray,
    sr: int,
    fade_sec: float = 8.0,
) -> np.ndarray:
    """
    Crossfade two stereo audio arrays.
    audio_a, audio_b: shape (channels, samples).
    Returns blended array with fade overlap removed.
    """
    fade_samples = int(fade_sec * sr)
    fade_samples = min(fade_samples, audio_a.shape[1], audio_b.shape[1])

    fade_out = np.linspace(1.0, 0.0, fade_samples)
    fade_in  = np.linspace(0.0, 1.0, fade_samples)

    a_tail  = audio_a[:, -fade_samples:] * fade_out
    b_head  = audio_b[:, :fade_samples]  * fade_in
    blended = a_tail + b_head

    return np.concatenate([
        audio_a[:, :-fade_samples],
        blended,
        audio_b[:, fade_samples:],
    ], axis=1)


def _hard_cut(
    audio_a: np.ndarray,
    audio_b: np.ndarray,
) -> np.ndarray:
    """Hard cut: concatenate with no overlap."""
    return np.concatenate([audio_a, audio_b], axis=1)


# ─── AUDIO LOADER ─────────────────────────────────────────────────────────────

def _load_stem(storage_path: str, sr_target: Optional[int] = None) -> tuple:
    """Download and load audio from Supabase storage."""
    audio_bytes = supabase.storage \
        .from_("aura-x-audio") \
        .download(storage_path)

    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=sr_target, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])  # mono → stereo
    return y, sr


# ─── MAIN RENDERER ────────────────────────────────────────────────────────────

def render_set(
    set_plan: dict,
    track_id: str,
    resolve_audio_fn: Optional[Callable] = None,
) -> dict:
    """
    Render a SetPlan into a continuous mix audio file.

    set_plan: dict matching SetPlan TypeScript type
    track_id: Supabase track_id for the output DJ mix
    resolve_audio_fn: optional callable track_id → storage_path.
                      If None, queries audio_files table for master file.
    """
    if not LIBROSA_AVAILABLE:
        return {"status": "error", "error": "librosa not installed"}

    tracks     = set_plan.get("tracks", [])
    transitions = set_plan.get("transitions", [])
    title      = set_plan.get("title", "DJ Set")

    if not tracks:
        return {"status": "error", "error": "No tracks in set plan"}

    transition_map = {t["from_track_id"]: t for t in transitions}

    mix_audio = None
    sr = None

    for i, track_meta in enumerate(tracks):
        track_id_src = track_meta["track_id"]

        # ─── Resolve storage path ──────────────────────────────────────────
        if resolve_audio_fn:
            storage_path = resolve_audio_fn(track_id_src)
            track_sr = 44100
        else:
            result = supabase.table("audio_files") \
                .select("storage_path, sample_rate") \
                .eq("track_id", track_id_src) \
                .eq("file_type", "master") \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()

            if not result.data:
                print(f"[set_renderer] Warning: no master file for {track_id_src}, skipping")
                continue

            storage_path = result.data[0]["storage_path"]
            track_sr = result.data[0].get("sample_rate", 44100)

        # ─── Load audio ────────────────────────────────────────────────────
        try:
            y, loaded_sr = _load_stem(storage_path, sr_target=sr)
        except Exception as e:
            print(f"[set_renderer] Warning: could not load {storage_path}: {e}")
            continue

        if sr is None:
            sr = loaded_sr

        # ─── Apply cue_out_sec trim ────────────────────────────────────────
        transition = transition_map.get(track_id_src)
        if transition and i < len(tracks) - 1:
            cue_out_sec = transition.get("cue_out_sec")
            if cue_out_sec:
                keep_samples = y.shape[1] - int(cue_out_sec * sr)
                y = y[:, :max(keep_samples, y.shape[1] // 2)]

        # ─── Blend with running mix ────────────────────────────────────────
        if mix_audio is None:
            mix_audio = y
        else:
            t_type = (transition.get("type", "crossfade") if transition else "crossfade")

            if t_type == "cut":
                mix_audio = _hard_cut(mix_audio, y)
            else:
                # log_drum_sync gets longer fade; all others get standard fade
                fade_sec = 16.0 if t_type == "log_drum_sync" else 8.0
                mix_audio = _crossfade(mix_audio, y, sr, fade_sec=fade_sec)

    if mix_audio is None or sr is None:
        return {"status": "error", "error": "No audio could be loaded from set plan"}

    # ─── Normalize ────────────────────────────────────────────────────────────
    peak = np.max(np.abs(mix_audio))
    if peak > 0.95:
        mix_audio = mix_audio * (0.95 / peak)

    # ─── Encode to 16-bit WAV ──────────────────────────────────────────────────
    buffer = io.BytesIO()
    sf.write(buffer, mix_audio.T, sr, format="WAV", subtype="PCM_16")
    mix_bytes = buffer.getvalue()

    # ─── Upload ───────────────────────────────────────────────────────────────
    file_id = str(uuid.uuid4())
    duration_sec = mix_audio.shape[1] / sr
    storage_path_out = f"{track_id}/dj_mix/{file_id}.wav"

    supabase.storage.from_("aura-x-audio").upload(
        path=storage_path_out,
        file=mix_bytes,
        file_options={"content-type": "audio/wav"},
    )

    supabase.table("audio_files").insert({
        "id": file_id,
        "track_id": track_id,
        "file_type": "dj_mix",
        "storage_path": storage_path_out,
        "format": "wav",
        "file_size_bytes": len(mix_bytes),
        "sample_rate": sr,
        "duration_sec": round(duration_sec, 2),
        "metadata": {
            "set_title": title,
            "track_count": len(tracks),
            "transition_types": list({
                t.get("type", "crossfade") for t in transitions
            }),
        },
    }).execute()

    return {
        "status": "complete",
        "dj_mix_file_id": file_id,
        "storage_path": storage_path_out,
        "duration_sec": round(duration_sec, 2),
        "duration_min": round(duration_sec / 60, 1),
        "track_count": len(tracks),
        "set_title": title,
    }

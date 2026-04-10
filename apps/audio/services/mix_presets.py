from dataclasses import dataclass, field
from typing import Literal

StemName = Literal["drums", "bass", "vocals", "other",
                   "log_drum", "piano", "rhodes", "pads"]


@dataclass
class ChannelStrip:
    stem: str
    gain_db: float
    # EQ
    low_shelf_hz: float
    low_shelf_db: float
    high_shelf_hz: float
    high_shelf_db: float
    mid_peak_hz: float
    mid_peak_db: float
    mid_peak_q: float
    # Compression
    comp_threshold_db: float
    comp_ratio: float
    comp_attack_ms: float
    comp_release_ms: float
    # Output
    output_gain_db: float
    pan: float  # -1.0 (left) to 1.0 (right), 0 = center


@dataclass
class MixPreset:
    name: str
    subgenre: str
    strips: dict
    master_lufs_target: float = -10.0


# ─── PRODUCTION DOCTRINE ENCODED AS CHANNEL STRIPS ───────────────────────────
# "log drum front"  = high gain, tight compression, boosted low-mid
# "pad warmth bed"  = gentle low shelf boost, slow compression
# "piano sparse top" = high-mid presence, no low-end mud

def private_school_preset() -> MixPreset:
    return MixPreset(
        name="Private School Mix",
        subgenre="private_school",
        master_lufs_target=-10.0,
        strips={
            "log_drum": ChannelStrip(
                stem="log_drum",
                gain_db=2.0,
                low_shelf_hz=80.0,    low_shelf_db=2.0,
                high_shelf_hz=8000.0, high_shelf_db=-1.0,
                mid_peak_hz=180.0,    mid_peak_db=3.0,  mid_peak_q=1.2,
                comp_threshold_db=-18.0, comp_ratio=4.0,
                comp_attack_ms=1.0,   comp_release_ms=80.0,
                output_gain_db=3.0,
                pan=0.0,  # Always mono-centered
            ),
            "drums": ChannelStrip(
                stem="drums",
                gain_db=0.0,
                low_shelf_hz=100.0,   low_shelf_db=-2.0,  # Cut low-end (log drum owns it)
                high_shelf_hz=8000.0, high_shelf_db=1.0,
                mid_peak_hz=400.0,    mid_peak_db=-1.0, mid_peak_q=0.8,
                comp_threshold_db=-20.0, comp_ratio=3.0,
                comp_attack_ms=5.0,   comp_release_ms=100.0,
                output_gain_db=0.0,
                pan=0.0,
            ),
            "bass": ChannelStrip(
                stem="bass",
                gain_db=-1.0,
                low_shelf_hz=60.0,    low_shelf_db=1.0,
                high_shelf_hz=5000.0, high_shelf_db=-3.0,
                mid_peak_hz=250.0,    mid_peak_db=-2.0, mid_peak_q=1.0,
                comp_threshold_db=-16.0, comp_ratio=5.0,
                comp_attack_ms=8.0,   comp_release_ms=120.0,
                output_gain_db=-1.0,
                pan=0.0,
            ),
            "vocals": ChannelStrip(
                stem="vocals",
                gain_db=0.0,
                low_shelf_hz=150.0,   low_shelf_db=-3.0,  # Clear low-mid mud
                high_shelf_hz=8000.0, high_shelf_db=2.0,  # Air
                mid_peak_hz=3000.0,   mid_peak_db=2.0,  mid_peak_q=1.5,
                comp_threshold_db=-22.0, comp_ratio=3.0,
                comp_attack_ms=10.0,  comp_release_ms=150.0,
                output_gain_db=1.0,
                pan=0.0,
            ),
            "other": ChannelStrip(  # Pads + keys in "other" stem
                stem="other",
                gain_db=-2.0,
                low_shelf_hz=120.0,    low_shelf_db=1.5,  # Pad warmth
                high_shelf_hz=10000.0, high_shelf_db=-1.0,
                mid_peak_hz=800.0,     mid_peak_db=-1.0, mid_peak_q=0.7,
                comp_threshold_db=-24.0, comp_ratio=2.0,
                comp_attack_ms=30.0,  comp_release_ms=300.0,  # Slow — pads breathe
                output_gain_db=-1.0,
                pan=0.0,
            ),
        }
    )


def bacardi_preset() -> MixPreset:
    """
    Bacardi: heavier log drum, stripped pads,
    rawer compression, less high-end sweetening.
    """
    ps = private_school_preset()
    preset = MixPreset(
        name="Bacardi Mix",
        subgenre="bacardi",
        master_lufs_target=-9.0,  # Louder, more aggressive
        strips=dict(ps.strips),
    )
    # Override log drum: even heavier body
    preset.strips["log_drum"] = ChannelStrip(
        stem="log_drum",
        gain_db=4.0,
        low_shelf_hz=80.0,    low_shelf_db=4.0,   # More low-mid body
        high_shelf_hz=6000.0, high_shelf_db=-2.0,  # Less air (rawer)
        mid_peak_hz=160.0,    mid_peak_db=4.0,  mid_peak_q=1.5,
        comp_threshold_db=-14.0, comp_ratio=6.0,  # Harder compression
        comp_attack_ms=0.5,   comp_release_ms=60.0,
        output_gain_db=5.0,
        pan=0.0,
    )
    # Override other: less pad warmth
    preset.strips["other"] = ChannelStrip(
        stem="other",
        gain_db=-4.0,
        low_shelf_hz=120.0,    low_shelf_db=-1.0,  # Less pad warmth
        high_shelf_hz=10000.0, high_shelf_db=-2.0,
        mid_peak_hz=800.0,     mid_peak_db=-2.0, mid_peak_q=0.7,
        comp_threshold_db=-24.0, comp_ratio=2.0,
        comp_attack_ms=30.0,  comp_release_ms=300.0,
        output_gain_db=-3.0,
        pan=0.0,
    )
    return preset


MIX_PRESETS = {
    "private_school":      private_school_preset,
    "bacardi":             bacardi_preset,
    "sgija":               private_school_preset,   # Sgija uses PS base
    "stixx_sgija":         bacardi_preset,           # Stixx uses Bacardi base
    "mbiraiano":           private_school_preset,
    "three_step":          private_school_preset,
    "gqom_fusion":         bacardi_preset,
    "hybrid_rnb_amapiano": private_school_preset,
}


def get_mix_preset(subgenre: str) -> MixPreset:
    factory = MIX_PRESETS.get(subgenre, private_school_preset)
    return factory()

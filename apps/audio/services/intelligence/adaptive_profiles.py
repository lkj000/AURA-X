"""
Bayesian Adaptive Lane Profiles.

Tracks a running mean and variance for key production metrics per lane using
Welford's online algorithm. Every time the agent evaluates a generated track,
it calls record_evaluation() and the profile updates atomically.

After enough evaluations, the synthesizer reads these learned means instead of
the hardcoded priors — the system genuinely improves from its own output.

Confidence model:
    confidence(n) = n / (n + PRIOR_WEIGHT)
    At n=0: confidence=0 (use prior exclusively)
    At n=PRIOR_WEIGHT: confidence=0.5 (50/50 prior vs. observed)
    At n=100: confidence≈0.91 (corpus is dominant)

The synthesizer blends:
    effective_value = prior * (1 - confidence) + learned_mean * confidence
"""

from __future__ import annotations
import math
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

PRIOR_WEIGHT = 10  # samples needed to reach 0.5 confidence

# ── Hardcoded priors (used until corpus overrides) ────────────────────────────

PRIORS: dict[str, dict[str, float]] = {
    "private_school":       {"bpm": 112.0, "energy": 0.45, "b_eff": 0.28, "transient_density": 2.5},
    "bacardi":              {"bpm": 118.0, "energy": 0.90, "b_eff": 0.38, "transient_density": 3.0},
    "sgija":                {"bpm": 114.0, "energy": 0.80, "b_eff": 0.33, "transient_density": 3.5},
    "stixx_sgija":          {"bpm": 115.0, "energy": 0.82, "b_eff": 0.36, "transient_density": 3.8},
    "mbiraiano":            {"bpm": 110.0, "energy": 0.38, "b_eff": 0.22, "transient_density": 2.0},
    "three_step":           {"bpm": 113.0, "energy": 0.60, "b_eff": 0.32, "transient_density": 3.0},
    "gqom_fusion":          {"bpm": 120.0, "energy": 0.88, "b_eff": 0.37, "transient_density": 3.2},
    "hybrid_rnb_amapiano":  {"bpm": 112.0, "energy": 0.62, "b_eff": 0.26, "transient_density": 2.4},
}

METRICS = ["bpm", "energy", "b_eff", "transient_density", "composite_score", "pass_rate"]


@dataclass
class LaneStat:
    lane: str
    metric: str
    mean: float
    m2: float       # running sum of squared deviations (Welford)
    n: int

    @property
    def variance(self) -> float:
        return self.m2 / self.n if self.n > 1 else 0.0

    @property
    def std(self) -> float:
        return math.sqrt(self.variance)

    @property
    def confidence(self) -> float:
        return self.n / (self.n + PRIOR_WEIGHT)

    def blend(self, prior: float) -> float:
        """Return confidence-weighted blend of prior and learned mean."""
        return prior * (1 - self.confidence) + self.mean * self.confidence

    def update(self, value: float) -> LaneStat:
        """Welford single-pass mean and M2 update."""
        n = self.n + 1
        delta = value - self.mean
        mean = self.mean + delta / n
        delta2 = value - mean
        m2 = self.m2 + delta * delta2
        return LaneStat(lane=self.lane, metric=self.metric, mean=mean, m2=m2, n=n)


class AdaptiveProfileStore:
    """
    Thread-safe, SQLite-backed store for per-lane metric statistics.
    A single global instance is shared across all API requests.
    """

    def __init__(self, db_path: Optional[str] = None) -> None:
        default = Path(__file__).parent.parent.parent / "data" / "profiles.db"
        self._path = db_path or str(default)
        self._lock = threading.Lock()
        # For in-memory databases, reuse the same connection object
        if self._path == ":memory:":
            self._shared_conn: Optional[sqlite3.Connection] = sqlite3.connect(":memory:", check_same_thread=False)
            self._shared_conn.row_factory = sqlite3.Row
        else:
            self._shared_conn = None
        self._ensure_db()

    def _conn(self) -> sqlite3.Connection:
        if self._shared_conn is not None:
            return self._shared_conn
        conn = sqlite3.connect(self._path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_db(self) -> None:
        if self._path != ":memory:":
            Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.execute("""
                CREATE TABLE IF NOT EXISTS lane_stats (
                    lane    TEXT    NOT NULL,
                    metric  TEXT    NOT NULL,
                    mean    REAL    NOT NULL DEFAULT 0,
                    m2      REAL    NOT NULL DEFAULT 0,
                    n       INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (lane, metric)
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS evaluation_log (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    lane            TEXT    NOT NULL,
                    bpm             REAL,
                    composite_score REAL,
                    passed          INTEGER,
                    b_eff           REAL,
                    transient_density REAL,
                    timestamp       TEXT    DEFAULT (datetime('now'))
                )
            """)
            c.commit()

    def get(self, lane: str, metric: str) -> LaneStat:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM lane_stats WHERE lane=? AND metric=?", (lane, metric)
            ).fetchone()
        prior = PRIORS.get(lane, {}).get(metric, 0.5)
        if row:
            return LaneStat(lane=lane, metric=metric,
                            mean=row["mean"], m2=row["m2"], n=row["n"])
        return LaneStat(lane=lane, metric=metric, mean=prior, m2=0.0, n=0)

    def effective(self, lane: str, metric: str) -> float:
        """Confidence-blended value: prior → learned mean as n grows."""
        stat = self.get(lane, metric)
        prior = PRIORS.get(lane, {}).get(metric, 0.5)
        return stat.blend(prior)

    def _update(self, lane: str, metric: str, value: float) -> None:
        stat = self.get(lane, metric)
        updated = stat.update(value)
        with self._conn() as c:
            c.execute("""
                INSERT INTO lane_stats (lane, metric, mean, m2, n)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(lane, metric) DO UPDATE SET
                    mean=excluded.mean, m2=excluded.m2, n=excluded.n
            """, (lane, updated.metric, updated.mean, updated.m2, updated.n))
            c.commit()

    def record_evaluation(
        self,
        lane: str,
        bpm: float,
        composite_score: float,
        passed: bool,
        b_eff: Optional[float] = None,
        transient_density: Optional[float] = None,
        energy: Optional[float] = None,
    ) -> None:
        with self._lock:
            self._update(lane, "bpm", bpm)
            self._update(lane, "composite_score", composite_score)
            self._update(lane, "pass_rate", 1.0 if passed else 0.0)
            if b_eff is not None:
                self._update(lane, "b_eff", b_eff)
            if transient_density is not None:
                self._update(lane, "transient_density", transient_density)
            if energy is not None:
                self._update(lane, "energy", energy)
            with self._conn() as c:
                c.execute("""
                    INSERT INTO evaluation_log
                        (lane, bpm, composite_score, passed, b_eff, transient_density)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (lane, bpm, composite_score, int(passed), b_eff, transient_density))
                c.commit()

    def get_lane_profile(self, lane: str) -> dict[str, dict]:
        return {
            m: {
                "mean": round(self.get(lane, m).mean, 4),
                "std": round(self.get(lane, m).std, 4),
                "n": self.get(lane, m).n,
                "confidence": round(self.get(lane, m).confidence, 3),
                "effective": round(self.effective(lane, m), 4),
            }
            for m in METRICS
        }

    def get_pass_rate(self, lane: str) -> float:
        stat = self.get(lane, "pass_rate")
        return round(stat.mean if stat.n > 0 else 0.7, 3)

    def evaluation_count(self, lane: str) -> int:
        with self._conn() as c:
            row = c.execute(
                "SELECT COUNT(*) AS cnt FROM evaluation_log WHERE lane=?", (lane,)
            ).fetchone()
        return row["cnt"] if row else 0

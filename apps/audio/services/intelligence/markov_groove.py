"""
Markov Chain Groove Generator.

Builds per-lane bigram transition matrices from 13 canonical groove patterns.
At generation time, samples the next step token from the learned distribution
with a temperature parameter that controls novelty vs. canonical fidelity.

Temperature semantics:
  0.0 — deterministic, always the most probable transition (pure template)
  0.5 — weighted sampling, stays close to style
  1.0 — full distribution, generates genuinely novel patterns
  >1.0 — flattens distribution, maximises exploration

Hard constraints enforced after sampling:
  - Position 0: always K (downbeat anchor)
  - Position 8: always K or L (second half anchor)
  - C2: K+L count per bar <= 4 (pass 1 removes K, pass 2 downgrades L → ghost)
  - Lane vocabulary: bacardi suppresses ghost notes; gqom suppresses them too
"""

import math
import random
from dataclasses import dataclass
from typing import Optional

# ── Step token vocabulary ─────────────────────────────────────────────────────
# K = kick, L = log drum, g = ghost, x = hi-hat, C = clap, R = rimshot, - = rest

TOKENS = ["K", "L", "g", "x", "C", "R", "-"]

# ── Training corpus (13 canonical patterns from the groove library) ───────────

_CORPUS: dict[str, list[list[str]]] = {
    "private_school": [
        list("K-x-L-x-K-x-L-x-"),  # ps_groove_01 (abbreviated: - padding added)
        ["K","-","x","-","L","-","x","-","K","-","x","-","L","-","x","-"],
        ["K","-","x","-","L","-","-","g","K","-","x","-","L","-","x","g"],
    ],
    "bacardi": [
        ["K","-","x","-","L","-","x","-","K","-","x","-","L","-","-","-"],
        ["K","-","x","-","L","L","x","-","K","-","x","-","L","-","-","-"],
    ],
    "sgija": [
        ["K","-","x","g","L","g","x","-","K","-","x","g","L","x","-","g"],
        ["K","-","x","-","L","g","x","-","-","K","x","g","L","x","-","g"],
    ],
    "stixx_sgija": [
        ["K","g","x","g","L","g","x","g","K","g","x","g","L","g","x","g"],
        ["K","g","x","-","L","g","L","g","K","-","x","g","L","g","x","g"],
        ["K","-","x","-","L","g","x","-","K","g","x","-","L","g","x","g"],
    ],
    "mbiraiano": [
        ["K","-","x","-","L","-","x","g","K","-","x","-","L","g","x","-"],
    ],
    "three_step": [
        ["K","-","x","K","-","L","x","-","K","-","x","-","L","K","x","-"],
    ],
    "gqom_fusion": [
        ["K","-","x","-","K","L","x","-","K","-","x","-","L","-","x","-"],
    ],
    "hybrid_rnb_amapiano": [
        ["K","-","x","-","L","-","x","g","K","-","x","-","L","-","x","g"],
    ],
}

# Fix the private_school entry — remove the abbreviated list
_CORPUS["private_school"] = _CORPUS["private_school"][1:]

# ── Lane configuration ────────────────────────────────────────────────────────

_SWING: dict[str, tuple[float, float]] = {
    "private_school":       (0.52, 0.58),
    "bacardi":              (0.50, 0.52),
    "sgija":                (0.55, 0.62),
    "stixx_sgija":          (0.56, 0.63),
    "mbiraiano":            (0.54, 0.60),
    "three_step":           (0.50, 0.54),
    "gqom_fusion":          (0.50, 0.52),
    "hybrid_rnb_amapiano":  (0.52, 0.57),
}

_GHOST_PROB: dict[str, float] = {
    "private_school": 0.12,
    "bacardi": 0.00,
    "sgija": 0.28,
    "stixx_sgija": 0.42,
    "mbiraiano": 0.16,
    "three_step": 0.06,
    "gqom_fusion": 0.00,
    "hybrid_rnb_amapiano": 0.12,
}

_ENERGY_SCALE: dict[str, float] = {
    "bacardi": 1.08,
    "gqom_fusion": 1.10,
    "sgija": 1.02,
    "stixx_sgija": 1.04,
    "private_school": 0.96,
    "mbiraiano": 0.94,
}

C2_MAX = 4
_PRIMARY = {0, 8}


@dataclass
class GeneratedGroove:
    id: str
    label: str
    steps: list[str]
    microtiming: list[int]
    velocity: list[int]
    swing: float
    lane: str
    temperature: float
    is_novel: bool


class MarkovGrooveGenerator:
    """
    Per-lane bigram Markov chain trained on the canonical groove corpus.
    Thread-safe (matrices are read-only after __init__).
    """

    def __init__(self) -> None:
        self._matrices = self._build_all()

    def _build_all(self) -> dict[str, dict[str, dict[str, float]]]:
        result = {}
        for lane, patterns in _CORPUS.items():
            counts: dict[str, dict[str, int]] = {}
            for pattern in patterns:
                for i in range(len(pattern)):
                    cur = pattern[i]
                    nxt = pattern[(i + 1) % len(pattern)]  # wrap
                    if cur not in counts:
                        counts[cur] = {}
                    counts[cur][nxt] = counts[cur].get(nxt, 0) + 1
            result[lane] = {
                tok: {t: c / sum(nexts.values()) for t, c in nexts.items()}
                for tok, nexts in counts.items()
            }
        return result

    def _sample(
        self,
        probs: dict[str, float],
        temperature: float,
        rng: random.Random,
    ) -> str:
        if temperature == 0.0:
            return max(probs, key=lambda t: probs[t])
        tokens = list(probs)
        if temperature == 1.0:
            weights = [probs[t] for t in tokens]
        else:
            log_w = [math.log(probs[t] + 1e-12) / temperature for t in tokens]
            max_lw = max(log_w)
            exp_w = [math.exp(v - max_lw) for v in log_w]
            total = sum(exp_w)
            weights = [v / total for v in exp_w]
        return rng.choices(tokens, weights=weights, k=1)[0]

    def _velocity(self, token: str, pos: int, lane: str) -> int:
        if token == "-":
            return 0
        base = {"K": 108, "L": 90, "x": 55, "g": 32, "C": 85, "R": 70}.get(token, 50)
        if pos in _PRIMARY:
            base = min(127, base + 8)
        scale = _ENERGY_SCALE.get(lane, 1.0)
        return min(127, int(base * scale))

    def _microtiming(self, token: str, pos: int) -> int:
        if token in ("-", "K"):
            return 0
        if token == "L":
            return 2 if pos % 2 == 0 else -3
        if token == "g":
            return 8 + (pos % 3) * 2
        if token == "x":
            return -3
        return 0

    def generate(
        self,
        lane: str,
        temperature: float = 0.5,
        seed: Optional[int] = None,
    ) -> GeneratedGroove:
        rng = random.Random(seed)
        matrix = self._matrices.get(lane) or self._matrices["private_school"]
        ghost_prob = _GHOST_PROB.get(lane, 0.10)

        steps = ["K"]  # position 0 always kick
        is_novel = False

        for pos in range(1, 16):
            prev = steps[-1]
            probs = matrix.get(prev)

            if probs:
                chosen = self._sample(probs, temperature, rng)
                modal = max(probs, key=lambda t: probs[t])
                if chosen != modal:
                    is_novel = True
            else:
                chosen = rng.choice(["-", "x", "-"])
                is_novel = True

            # Second-half anchor
            if pos == 8 and chosen not in ("K", "L"):
                chosen = "K"

            # Ghost probability gate
            if chosen == "g" and rng.random() > ghost_prob:
                chosen = "-"

            steps.append(chosen)

        # Enforce C2: K+L count <= C2_MAX
        kl = [i for i, s in enumerate(steps) if s in ("K", "L")]
        while len(kl) > C2_MAX:
            removable = [p for p in reversed(kl) if p not in _PRIMARY]
            if not removable:
                break
            pos = removable[0]
            steps[pos] = "g" if steps[pos] == "L" else "-"
            kl.remove(pos)

        microtiming = [self._microtiming(s, i) for i, s in enumerate(steps)]
        velocity = [self._velocity(s, i, lane) for i, s in enumerate(steps)]
        swing_lo, swing_hi = _SWING.get(lane, (0.50, 0.60))
        swing = round(rng.uniform(swing_lo, swing_hi), 3)

        uid = seed if seed is not None else rng.randint(1000, 9999)
        kind = "novel" if is_novel else "canonical"

        return GeneratedGroove(
            id=f"{lane}_markov_{uid}",
            label=f"{lane.replace('_',' ').title()} — Markov {kind.capitalize()}",
            steps=steps,
            microtiming=microtiming,
            velocity=velocity,
            swing=swing,
            lane=lane,
            temperature=temperature,
            is_novel=is_novel,
        )

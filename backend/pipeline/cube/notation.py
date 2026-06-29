"""Move-notation helpers.

The frontend accepts only single quarter-turns: /^([UDLRFBMESxyz])('?)$/ — no
doubles like U2. `normalize` expands any doubles into two single turns so solver
output (which may use U2) is always frontend-safe.
"""

from __future__ import annotations

import re
from typing import Iterable, List

BASES = "UDLRFBMESxyz"

# Single quarter-turn the frontend accepts.
_SINGLE = re.compile(r"^([UDLRFBMESxyz])('?)$")
# Richer input we tolerate from solvers: base + optional 2 + optional prime.
_TOKEN = re.compile(r"^([UDLRFBMESxyz])(2?)('?)$")


def is_valid_move(move: str) -> bool:
    """True if `move` is a single quarter-turn the frontend will accept."""
    return bool(_SINGLE.match(move))


def normalize(moves: Iterable[str]) -> List[str]:
    """Expand a move sequence to single quarter-turns only.

    'U2' -> ['U', 'U']; 'U2'' -> ['U', 'U']; 'U' / "U'" pass through.
    Raises ValueError on tokens that aren't recognizable moves.
    """
    out: List[str] = []
    for raw in moves:
        m = _TOKEN.match(raw)
        if not m:
            raise ValueError(f"unrecognized move: {raw!r}")
        base, double, prime = m.group(1), m.group(2), m.group(3)
        if double:
            out.extend([base, base])
        else:
            out.append(base + prime)
    return out


def invert_move(move: str) -> str:
    """Inverse of a single quarter-turn: toggle the prime."""
    if not is_valid_move(move):
        raise ValueError(f"not a single quarter-turn: {move!r}")
    return move[:-1] if move.endswith("'") else move + "'"


def invert(moves: Iterable[str]) -> List[str]:
    """Inverse of a sequence of single quarter-turns (reversed + each inverted)."""
    return [invert_move(m) for m in reversed(list(moves))]


def cleanup(moves: Iterable[str]) -> List[str]:
    """Identity-preserving shortening of a single-quarter-turn sequence.

    Only safe, local simplifications: cancel adjacent inverse pairs (R R'),
    and collapse runs of the same turn modulo 4 (R R R -> R', R R R R -> nothing).
    Does not reorder across different faces, so it never changes the net result.
    """
    out: List[str] = []
    for m in moves:
        # Cancel with the immediately preceding inverse move.
        if out and out[-1] == invert_move(m):
            out.pop()
            continue
        out.append(m)
        # Collapse a run of 4 identical turns (full rotation -> nothing).
        if len(out) >= 4 and out[-1] == out[-2] == out[-3] == out[-4]:
            del out[-4:]
            continue
        # Collapse a run of 3 identical turns into one inverse turn.
        if len(out) >= 3 and out[-1] == out[-2] == out[-3]:
            base = out[-1]
            del out[-3:]
            # Re-feed the inverse so it can cancel with what came before.
            inv = invert_move(base)
            if out and out[-1] == invert_move(inv):
                out.pop()
            else:
                out.append(inv)
    return out


# Per-generator conjugation tables for whole-cube rotations, derived empirically
# against facelet.apply_move (the same "derived empirically, guarded by tests"
# approach as the solver's PG_TO_OUR). _CONJ[r][m] is the single fixed-frame
# quarter-turn equal to r · m · r⁻¹, so a face/slice turn in a rotated frame can
# be rewritten in the original frame and the rotation r itself dropped. Asserted
# correct across 300 scrambles in test_solver.
_CONJ = {
    'x': {'U': 'B', "U'": "B'", 'D': 'F', "D'": "F'", 'L': 'L', "L'": "L'", 'R': 'R', "R'": "R'", 'F': 'U', "F'": "U'", 'B': 'D', "B'": "D'", 'M': 'M', "M'": "M'", 'E': 'S', "E'": "S'", 'S': "E'", "S'": 'E'},
    "x'": {'U': 'F', "U'": "F'", 'D': 'B', "D'": "B'", 'L': 'L', "L'": "L'", 'R': 'R', "R'": "R'", 'F': 'D', "F'": "D'", 'B': 'U', "B'": "U'", 'M': 'M', "M'": "M'", 'E': "S'", "E'": 'S', 'S': 'E', "S'": "E'"},
    'y': {'U': 'U', "U'": "U'", 'D': 'D', "D'": "D'", 'L': 'B', "L'": "B'", 'R': 'F', "R'": "F'", 'F': 'L', "F'": "L'", 'B': 'R', "B'": "R'", 'M': "S'", "M'": 'S', 'E': 'E', "E'": "E'", 'S': 'M', "S'": "M'"},
    "y'": {'U': 'U', "U'": "U'", 'D': 'D', "D'": "D'", 'L': 'F', "L'": "F'", 'R': 'B', "R'": "B'", 'F': 'R', "F'": "R'", 'B': 'L', "B'": "L'", 'M': 'S', "M'": "S'", 'E': 'E', "E'": "E'", 'S': "M'", "S'": 'M'},
    'z': {'U': 'R', "U'": "R'", 'D': 'L', "D'": "L'", 'L': 'U', "L'": "U'", 'R': 'D', "R'": "D'", 'F': 'F', "F'": "F'", 'B': 'B', "B'": "B'", 'M': "E'", "M'": 'E', 'E': 'M', "E'": "M'", 'S': 'S', "S'": "S'"},
    "z'": {'U': 'L', "U'": "L'", 'D': 'R', "D'": "R'", 'L': 'D', "L'": "D'", 'R': 'U', "R'": "U'", 'F': 'F', "F'": "F'", 'B': 'B', "B'": "B'", 'M': 'E', "M'": "E'", 'E': "M'", "E'": 'M', 'S': 'S', "S'": "S'"},
}
ROTATIONS = frozenset(_CONJ)


def _to_fixed_frame(move: str, dropped: List[str]) -> str:
    """Rewrite `move` (expressed in the frame rotated by the `dropped` rotations,
    applied in order) into the original fixed frame by conjugating through each
    dropped rotation, innermost first."""
    t = move
    for r in reversed(dropped):
        t = _CONJ[r][t]
    return t


def optimize_solution(stage_moves: List[List[str]]) -> List[List[str]]:
    """Remove whole-cube rotations from a staged solution and clean it up globally.

    Takes one move list per stage (single quarter-turns, possibly containing
    rotations x/y/z) and returns one optimized move list per stage. Every rotation
    is eliminated by rewriting the moves that follow it into the fixed frame, and
    `cleanup`'s cancellations are applied across the whole sequence rather than
    per stage. Each surviving move keeps its original stage, so stage boundaries
    are preserved (a stage may end up empty if its moves fully cancel). The net
    cube effect is unchanged — a solved cube stays solved — so the solver replay
    test still guards correctness.
    """
    # 1. Eliminate rotations, tagging each surviving move with its stage index.
    dropped: List[str] = []
    flat: List[tuple[str, int]] = []
    for index, moves in enumerate(stage_moves):
        for m in moves:
            if m in ROTATIONS:
                dropped.append(m)
                continue
            flat.append((_to_fixed_frame(m, dropped), index))

    # 2. Global cleanup, carrying the stage tag (mirrors cleanup()).
    out: List[tuple[str, int]] = []
    for m, index in flat:
        if out and out[-1][0] == invert_move(m):
            out.pop()
            continue
        out.append((m, index))
        if len(out) >= 4 and out[-1][0] == out[-2][0] == out[-3][0] == out[-4][0]:
            del out[-4:]
            continue
        if len(out) >= 3 and out[-1][0] == out[-2][0] == out[-3][0]:
            base, tag = out[-1]
            del out[-3:]
            inv = invert_move(base)
            if out and out[-1][0] == invert_move(inv):
                out.pop()
            else:
                out.append((inv, tag))

    # 3. Re-split into per-stage lists.
    result: List[List[str]] = [[] for _ in stage_moves]
    for token, index in out:
        result[index].append(token)
    return result

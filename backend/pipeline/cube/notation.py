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

"""Solver interface: turn a cube State into ordered, teachable LBL stages.

`solve(state)` returns a list of SolveStage, one per beginner layer-by-layer
phase, each carrying the moves (frontend single-quarter-turn notation) that
complete that phase. See lbl.py for the implementation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class SolveStage:
    name: str  # machine id, e.g. "cross"
    label: str  # human label, e.g. "First-layer cross"
    moves: List[str]  # our notation, normalized single quarter-turns
    highlight: str  # cubelet type to spotlight: "edge" | "corner"
    goal: str  # deterministic description of what the stage achieves
    focus: str = field(default="")  # short machine hint for the narrator


from pipeline.solver.lbl import solve  # noqa: E402  (re-export)

__all__ = ["SolveStage", "solve"]

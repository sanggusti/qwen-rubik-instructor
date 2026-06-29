"""Layer-by-layer solver built on the `rubik_cube` library (pglass), which solves
with a beginner method and exposes one method per stage. We call those stages
individually so each phase's moves can be narrated separately.

The library's cube and move conventions differ from ours; both mappings were
derived empirically (see tests) and are pinned here:
  - SIGMA: facelet -> library 54-char string is the natural row-major unfold.
  - The library's turn directions are the inverse of ours, so every emitted
    token has its direction toggled when translated back (PG_TO_OUR).
Correctness does not rely on these being "obviously right": every solution is
replayed on our own engine and asserted solved (test_solver.py).
"""

from __future__ import annotations

from typing import List

from rubik.cube import Cube
from rubik.solve import Solver

from pipeline.cube.facelet import State
from pipeline.cube.notation import cleanup, normalize, optimize_solution
from pipeline.solver import SolveStage

# Library token -> our notation (direction inverted; derived empirically).
PG_TO_OUR = {
    "U": "U'", "Ui": "U", "D": "D'", "Di": "D", "L": "L'", "Li": "L",
    "R": "R'", "Ri": "R", "F": "F'", "Fi": "F", "B": "B'", "Bi": "B",
    "M": "M'", "Mi": "M", "E": "E'", "Ei": "E", "S": "S'", "Si": "S",
    "X": "x'", "Xi": "x", "Y": "y'", "Yi": "y", "Z": "z'", "Zi": "z",
}

# Ordered (library method, machine name, label, highlight, goal).
STAGES = [
    ("cross", "cross", "First-layer cross", "edge",
     "Build the first-layer cross by placing its four edges around one center."),
    ("cross_corners", "first-layer-corners", "First-layer corners", "corner",
     "Insert the four first-layer corners to complete the first layer."),
    ("second_layer", "middle-layer", "Middle layer", "edge",
     "Place the four middle-layer edges between the side centers."),
    ("back_face_edges", "last-layer-cross", "Last-layer cross", "edge",
     "Orient the last-layer edges so the top forms a cross."),
    ("last_layer_corners_position", "ll-corner-position", "Position last-layer corners", "corner",
     "Move the last-layer corners into their correct locations."),
    ("last_layer_corners_orientation", "ll-corner-orientation", "Orient last-layer corners", "corner",
     "Twist the last-layer corners so the top face is one solid color."),
    ("last_layer_edges", "last-layer-edges", "Position last-layer edges", "edge",
     "Cycle the last-layer edges into place to finish the cube."),
]


def facelet_to_library_str(state: State) -> str:
    """Serialize our State to the library's 54-char cube string (natural unfold)."""
    s = state
    rows = []
    rows.extend(s["U"])  # 0..8
    for r in (0, 3, 6):  # three middle bands: L F R B, left-to-right
        rows.extend(s["L"][r:r + 3] + s["F"][r:r + 3] + s["R"][r:r + 3] + s["B"][r:r + 3])
    rows.extend(s["D"])  # 45..53
    return "".join(rows)


def _translate(tokens: List[str]) -> List[str]:
    return cleanup(normalize(PG_TO_OUR[t] for t in tokens))


def solve(state: State) -> List[SolveStage]:
    """Solve `state` layer by layer; return one SolveStage per phase (moves in
    our notation, normalized to single quarter-turns)."""
    cube = Cube(facelet_to_library_str(state))
    solver = Solver(cube)
    stages: List[SolveStage] = []
    last = 0
    for method, name, label, highlight, goal in STAGES:
        getattr(solver, method)()
        raw = solver.moves[last:]
        last = len(solver.moves)
        stages.append(
            SolveStage(
                name=name,
                label=label,
                moves=_translate(raw),
                highlight=highlight,
                goal=goal,
                focus=f"{highlight} pieces",
            )
        )
    # Globally optimize across stages: the library leans on whole-cube rotations
    # and slices that no learner would make. Eliminating them (and cleaning up
    # across stage boundaries) keeps the solve correct but human-followable.
    for stage, moves in zip(stages, optimize_solution([s.moves for s in stages])):
        stage.moves = moves
    return stages

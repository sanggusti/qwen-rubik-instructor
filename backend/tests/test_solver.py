"""Phase 2: the LBL solver returns frontend-valid moves that actually solve the
cube. Correctness is empirical — every solution is replayed on our own engine."""

import random

import pytest

from pipeline.cube.facelet import apply_move, apply_moves, clone_state, is_solved, solved_state
from pipeline.cube.notation import ROTATIONS, is_valid_move, optimize_solution
from pipeline.solver import solve

FACE_MOVES = ["U", "U'", "D", "D'", "L", "L'", "R", "R'", "F", "F'", "B", "B'"]


def scramble(seed: int, length: int = 25):
    rng = random.Random(seed)
    state = solved_state()
    moves = [rng.choice(FACE_MOVES) for _ in range(length)]
    apply_moves(state, moves)
    return state, moves


@pytest.mark.parametrize("seed", range(300))
def test_solver_solves_random_scrambles(seed):
    state, _ = scramble(seed)
    stages = solve(clone_state(state))
    solution = [m for stage in stages for m in stage.moves]
    work = clone_state(state)
    apply_moves(work, solution)
    assert is_solved(work), f"seed {seed} not solved"
    # The optimizer eliminates every whole-cube rotation so a learner never has
    # to reorient the cube mid-solve.
    assert not any(m in ROTATIONS for m in solution), f"seed {seed} kept a rotation"


def test_solver_emits_only_valid_single_turns():
    state, _ = scramble(42)
    for stage in solve(state):
        for m in stage.moves:
            assert is_valid_move(m), f"invalid move {m!r} in stage {stage.name}"


def test_solver_returns_all_stages_in_order():
    state, _ = scramble(1)
    stages = solve(state)
    assert [s.name for s in stages] == [
        "cross", "first-layer-corners", "middle-layer", "last-layer-cross",
        "ll-corner-position", "ll-corner-orientation", "last-layer-edges",
    ]
    assert all(s.highlight in ("edge", "corner") for s in stages)


def test_already_solved_cube():
    stages = solve(solved_state())
    solution = [m for stage in stages for m in stage.moves]
    work = solved_state()
    apply_moves(work, solution)
    assert is_solved(work)


def test_optimize_solution_drops_rotations_preserving_effect():
    # A staged sequence that includes whole-cube rotations and a redundant pair.
    stages = [["x", "R", "R'", "U"], ["z", "F", "F", "F"]]
    flat_before = [m for s in stages for m in s]
    optimized = optimize_solution(stages)
    flat_after = [m for s in optimized for m in s]

    # No rotations survive, and the cleanup shrank it (R R' cancels, F F F -> F').
    assert not any(m in ROTATIONS for m in flat_after)
    assert len(flat_after) < len(flat_before)

    # Net cube effect is unchanged up to final orientation: the optimizer pushes
    # the dropped rotations to the end, so the rotation-free version followed by
    # those rotations (in order) reproduces the original exactly.
    original = solved_state()
    apply_moves(original, flat_before)
    rewritten = solved_state()
    apply_moves(rewritten, flat_after + ["x", "z"])
    assert original == rewritten

"""Phase 1: the Python cube engine must match the frontend bit-for-bit.

Fixtures in tests/fixtures/cube_fixtures.json are produced by the REAL frontend
engine (frontend/src/core/state.ts) over 300 random sequences. Regenerate with
vite-node if state.ts ever changes.
"""

import json
from pathlib import Path

import pytest

from pipeline.cube.facelet import (
    apply_moves,
    clone_state,
    is_solved,
    solved_state,
)
from pipeline.cube.notation import cleanup, invert, is_valid_move, normalize

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "cube_fixtures.json").read_text())


def test_fixtures_loaded():
    assert len(FIXTURES) == 300


@pytest.mark.parametrize("idx", range(len(FIXTURES)))
def test_matches_frontend(idx):
    fx = FIXTURES[idx]
    state = solved_state()
    apply_moves(state, fx["moves"])
    assert state == fx["state"], f"diverged on sequence: {' '.join(fx['moves'])}"


def test_solved_state_is_solved():
    assert is_solved(solved_state())


def test_inverse_returns_to_solved():
    seq = normalize(["R", "U", "R'", "U'", "F2", "B", "L'"])
    state = solved_state()
    apply_moves(state, seq)
    assert not is_solved(state)
    apply_moves(state, invert(seq))
    assert is_solved(state)


def test_clone_is_independent():
    a = solved_state()
    b = clone_state(a)
    apply_moves(b, ["R"])
    assert a == solved_state()
    assert b != a


def test_normalize_expands_doubles():
    assert normalize(["U2"]) == ["U", "U"]
    assert normalize(["U2'"]) == ["U", "U"]
    assert normalize(["R", "U'"]) == ["R", "U'"]


def test_normalize_rejects_garbage():
    with pytest.raises(ValueError):
        normalize(["Q"])


def test_all_normalized_moves_are_frontend_valid():
    seq = normalize(["U2", "R", "D2'", "F'", "M", "x2"])
    assert all(is_valid_move(m) for m in seq)


def test_cleanup_cancels_inverse_pairs():
    assert cleanup(["R", "R'"]) == []
    assert cleanup(["R", "U", "U'", "R'"]) == []


def test_cleanup_collapses_runs():
    assert cleanup(["R", "R", "R"]) == ["R'"]
    assert cleanup(["R", "R", "R", "R"]) == []
    assert cleanup(["U", "U"]) == ["U", "U"]  # 180° stays as two single turns


@pytest.mark.parametrize("seed", range(40))
def test_cleanup_preserves_result(seed):
    import random
    rng = random.Random(seed)
    seq = [rng.choice(["U", "U'", "R", "R'", "F", "F'", "D", "D'"]) for _ in range(30)]
    a = solved_state(); apply_moves(a, seq)
    b = solved_state(); apply_moves(b, cleanup(seq))
    assert a == b

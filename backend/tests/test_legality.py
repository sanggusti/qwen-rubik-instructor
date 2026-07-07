"""Legality validator: shared-fixture cross-validation with the TS engine.

legality_fixtures.json is generated FROM the frontend implementation
(frontend/scripts/gen-legality-fixtures.ts) and frozen; the Python port must
agree on every case — the same convention as cube_fixtures.json for the move
engine.
"""

import json
import random
from pathlib import Path

import pytest

from pipeline.cube.facelet import apply_move, apply_moves, clone_state, solved_state
from pipeline.cube.legality import canonicalize_centers, check_legality

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "legality_fixtures.json"
FIXTURES = json.loads(FIXTURE_PATH.read_text())

FACE_MOVES = ["U", "U'", "D", "D'", "L", "L'", "R", "R'", "F", "F'", "B", "B'"]


def _scrambled(seed: int):
    rng = random.Random(seed)
    s = solved_state()
    for _ in range(25):
        apply_move(s, rng.choice(FACE_MOVES))
    return s


def test_fixture_count():
    assert len(FIXTURES) >= 50


@pytest.mark.parametrize("idx", range(len(FIXTURES)), ids=[f["name"] for f in FIXTURES])
def test_matches_frontend(idx):
    case = FIXTURES[idx]
    ok, code, _suspects = check_legality(case["state"])
    assert ok == case["legal"], case["name"]
    if not ok:
        assert code == case["code"], case["name"]


def test_random_scrambles_are_legal():
    for seed in range(100):
        ok, code, _ = check_legality(_scrambled(seed))
        assert ok, f"seed {seed}: {code}"


def test_slices_and_rotations_stay_legal():
    s = solved_state()
    apply_moves(s, "R U M E' S x y' F z' B".split())
    ok, code, _ = check_legality(s)
    assert ok, code


def test_single_corner_twist_rejected():
    s = _scrambled(3)
    # URF corner: U8 -> R0 -> F2 -> U8 (cyclic twist in place).
    tmp = s["U"][8]
    s["U"][8] = s["F"][2]
    s["F"][2] = s["R"][0]
    s["R"][0] = tmp
    ok, code, _ = check_legality(s)
    assert not ok and code == "twist"


def test_single_edge_flip_rejected():
    s = _scrambled(4)
    s["U"][7], s["F"][1] = s["F"][1], s["U"][7]
    ok, code, _ = check_legality(s)
    assert not ok and code == "flip"


def test_impossible_cubie_names_suspects():
    s = solved_state()
    s["F"][1] = "D"  # a U/D edge cannot exist
    ok, code, suspects = check_legality(s)
    assert not ok and code == "structure"
    assert {"face": "U", "index": 7} in suspects
    assert {"face": "F", "index": 1} in suspects


def test_canonicalize_restores_displaced_centers():
    s = _scrambled(5)
    rotated = clone_state(s)
    apply_move(rotated, "M")
    canon = canonicalize_centers(rotated)
    assert canon is not None
    assert all(canon[f][4] == f for f in "UDLRFB")
    ok, _, _ = check_legality(canon)
    assert ok


def test_canonicalize_rejects_impossible_centers():
    s = solved_state()
    s["U"][4] = "D"
    assert canonicalize_centers(s) is None

"""Phase 3: plans are in-contract and deterministically correct."""

import pytest

from narrative.planner import (
    build_solve_lesson,
    build_solve_walkthrough,
    build_topic_lesson,
    build_topic_walkthrough,
    plan,
    topic_ids,
)
from narrative.schema import VisualPlan
from pipeline.cube.facelet import apply_moves, clone_state, is_solved, solved_state
from pipeline.cube.notation import is_valid_move

VALID_HIGHLIGHTS = {None, "core", "center", "edge", "corner"}


def _scrambled():
    s = solved_state()
    apply_moves(s, "R U R' U' F2 B L D' R B'".split())
    return s


def _assert_in_contract(p: VisualPlan):
    assert p.kind in ("walkthrough", "lesson")
    assert p.frames, "plan has no frames"
    for fr in p.frames:
        assert fr.highlight in VALID_HIGHLIGHTS
        for m in fr.moves:
            assert is_valid_move(m), f"bad move {m!r}"
        for m in fr.setup_moves:
            assert is_valid_move(m), f"bad setup move {m!r}"
        assert fr.focus and fr.expected


def test_solve_walkthrough_in_contract_and_solves():
    # Self-contained from solved: intro re-creates the scramble, the rest solves.
    p = build_solve_walkthrough(_scrambled())
    _assert_in_contract(p)
    assert p.frames[0].stage == "intro"
    assert p.frames[0].moves, "intro should re-create the scramble"
    all_moves = [m for fr in p.frames for m in fr.moves]
    work = solved_state()
    apply_moves(work, all_moves)
    assert is_solved(work)


def test_solve_lesson_in_contract():
    p = build_solve_lesson(_scrambled())
    _assert_in_contract(p)
    assert p.kind == "lesson"
    assert p.track == "beginner"


@pytest.mark.parametrize("topic", topic_ids())
def test_topic_walkthroughs_in_contract(topic):
    _assert_in_contract(build_topic_walkthrough(topic))


@pytest.mark.parametrize("topic", ["sexy-move", "sune", "t-perm"])
def test_topic_lesson_setup_then_moves_solves(topic):
    p = build_topic_lesson(topic)
    _assert_in_contract(p)
    fr = p.frames[0]
    work = solved_state()
    apply_moves(work, fr.setup_moves)
    assert not is_solved(work)
    apply_moves(work, fr.moves)
    assert is_solved(work), f"{topic}: setup+alg should return to solved"


def test_anatomy_has_no_moves_but_uses_highlights():
    p = build_topic_walkthrough("anatomy")
    assert all(not fr.moves for fr in p.frames)
    assert {fr.highlight for fr in p.frames} >= {"center", "edge", "corner", "core"}


def test_cfop_framing_relabels_and_still_solves():
    state = _scrambled()
    lbl = build_solve_walkthrough(clone_state(state), "lbl")
    cfop = build_solve_walkthrough(clone_state(state), "cfop")
    _assert_in_contract(cfop)
    stages = [fr.stage for fr in cfop.frames]
    assert "cross" in stages and "f2l" in stages  # CFOP vocabulary present
    assert "f2l" not in [fr.stage for fr in lbl.frames]  # lbl keeps separate stages
    # Framing must not change the solution: same moves, still solves from solved.
    lbl_moves = [m for fr in lbl.frames for m in fr.moves]
    cfop_moves = [m for fr in cfop.frames for m in fr.moves]
    assert lbl_moves == cfop_moves
    work = solved_state()
    apply_moves(work, cfop_moves)
    assert is_solved(work)


def test_dispatcher_passes_method():
    p = plan("walkthrough", state=_scrambled(), method="cfop")
    assert any(fr.stage == "f2l" for fr in p.frames)


def test_dispatcher_and_errors():
    assert plan("walkthrough", topic="sune").kind == "walkthrough"
    assert plan("lesson", state=_scrambled()).kind == "lesson"
    with pytest.raises(ValueError):
        plan("walkthrough")
    with pytest.raises(ValueError):
        build_topic_walkthrough("nope")
    with pytest.raises(ValueError):
        build_topic_lesson("anatomy")

"""Phase 4: validator guards, narrator re-prompt/fallback, and merge logic.

Offline tests monkeypatch the LLM call. The `live` test hits real DashScope and
is skipped unless run with: pytest -m live
"""

import json

import pytest

from config import settings
from narrative import llm_narrator
from narrative.merge import beat_from, step_from
from narrative.planner import build_solve_walkthrough, build_topic_lesson
from narrative.schema import FrameNarration, VisualFrame
from narrative.validator import claimed_moves, validate_narration
from pipeline.cube.facelet import apply_moves, solved_state


def _frame(moves=None, highlight="edge"):
    return VisualFrame(
        id="f1", stage="demo", moves=moves or [], highlight=highlight,
        focus="the right-hand trigger", expected="Do the trigger.",
    )


# --- validator ---

def test_valid_narration_passes():
    fr = _frame(["R", "U", "R'", "U'"])
    ok, reason, narr = validate_narration(fr, json.dumps({"text": "Turn R then U."}))
    assert ok and narr.text == "Turn R then U."


def test_empty_text_rejected():
    ok, reason, _ = validate_narration(_frame(["R"]), json.dumps({"text": "   "}))
    assert not ok and "empty" in reason


def test_invented_move_rejected():
    fr = _frame(["R", "U"])
    ok, reason, _ = validate_narration(fr, json.dumps({"text": "Now do L and B."}))
    assert not ok and "not in the frame" in reason


def test_move_in_frame_allowed():
    fr = _frame(["R", "U", "R'", "U'"])
    ok, _, _ = validate_narration(fr, json.dumps({"text": "Do R, then U, then R'."}))
    assert ok


def test_no_move_frame_rejects_move_mention():
    ok, reason, _ = validate_narration(_frame([], "center"), json.dumps({"text": "Turn R."}))
    assert not ok


def test_unparseable_rejected():
    ok, reason, _ = validate_narration(_frame(["R"]), "not json")
    assert not ok and "unparseable" in reason


def test_claimed_moves_normalizes_doubles():
    assert claimed_moves("do R2 then U") == ["R", "R", "U"]


# --- narrator re-prompt / fallback ---

class _Stub:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def __call__(self, client, model, messages):
        self.calls += 1
        return self.responses.pop(0)


def _run(monkeypatch, responses):
    stub = _Stub(responses)
    monkeypatch.setattr(llm_narrator, "_complete", stub)
    plan = build_topic_lesson("sune")
    frame = plan.frames[0]
    narration, used_fallback = llm_narrator.narrate_frame(
        plan, frame, client=None, model="x", tone="calm"
    )
    return narration, used_fallback, stub


def test_first_response_valid(monkeypatch):
    plan = build_topic_lesson("sune")
    good = json.dumps({"text": "Perform the algorithm to solve.", "title": "Sune", "hints": ["go slow"]})
    narration, used_fallback, stub = _run(monkeypatch, [good])
    assert not used_fallback and stub.calls == 1


def test_reprompt_then_valid(monkeypatch):
    bad = "not json"
    good = json.dumps({"text": "Perform it slowly."})
    narration, used_fallback, stub = _run(monkeypatch, [bad, good])
    assert not used_fallback and stub.calls == 2


def test_falls_back_after_two_failures(monkeypatch):
    narration, used_fallback, stub = _run(monkeypatch, ["bad", "still bad"])
    assert used_fallback and narration.text


def test_falls_back_on_exception(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network")

    monkeypatch.setattr(llm_narrator, "_complete", boom)
    plan = build_topic_lesson("sexy-move")
    narration, used_fallback = llm_narrator.narrate_frame(
        plan, plan.frames[0], client=None, model="x", tone="calm"
    )
    assert used_fallback and narration.text


# --- merge ---

def test_beat_from_keeps_skeleton_moves():
    fr = _frame(["R", "U"])
    beat = beat_from(fr, FrameNarration(text="hi"))
    assert beat.moves == ["R", "U"] and beat.highlight == "edge" and beat.text == "hi"


def test_step_from_setup_frame_uses_move_sequence_validator():
    plan = build_topic_lesson("sexy-move")
    fr = plan.frames[0]
    step = step_from(fr, FrameNarration(text="do it", title="Sexy", hints=["go"]))
    assert step.validator.type == "moveSequence"
    assert step.expected_moves == fr.moves
    assert step.setup_moves == fr.setup_moves


def test_step_from_solve_stage_is_manual():
    s = solved_state()
    apply_moves(s, "R U F D L B".split())
    plan = build_solve_walkthrough(s)  # reuse solve frames
    stage_frame = next(fr for fr in plan.frames if fr.moves)
    step = step_from(stage_frame, FrameNarration(text="follow along"))
    assert step.validator.type == "manual"
    assert step.expected_moves == stage_frame.moves


# --- live smoke (skipped by default) ---

@pytest.mark.live
def test_live_dashscope_returns_valid_json():
    assert settings.dashscope_api_key, "DASHSCOPE_API_KEY missing"
    plan = build_topic_lesson("sune")
    frame = plan.frames[0]
    narration, used_fallback = llm_narrator.narrate_frame(
        plan, frame, client=llm_narrator.get_client(), model=settings.qwen_model, tone="warm"
    )
    assert not used_fallback, "live call fell back — model/key/contract issue"
    assert narration.text.strip()

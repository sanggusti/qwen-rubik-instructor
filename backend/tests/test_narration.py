"""Phase 4: validator guards, narrator re-prompt/fallback, and merge logic.

Offline tests monkeypatch the LLM call. The `live` test hits real DashScope and
is skipped unless run with: pytest -m live
"""

import json

import pytest

from config import settings
from narrative import llm_narrator
from narrative.merge import beat_from, step_from
from narrative.planner import build_solve_lesson, build_solve_walkthrough, build_topic_lesson
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


def test_invalid_response_falls_back_single_attempt(monkeypatch):
    # Narration is a single attempt (no re-prompt): an invalid response falls
    # straight back to deterministic text rather than holding up the stream.
    narration, used_fallback, stub = _run(monkeypatch, ["not json"])
    assert used_fallback and narration.text and stub.calls == 1


def test_falls_back_on_exception(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network")

    monkeypatch.setattr(llm_narrator, "_complete", boom)
    plan = build_topic_lesson("sexy-move")
    narration, used_fallback = llm_narrator.narrate_frame(
        plan, plan.frames[0], client=None, model="x", tone="calm"
    )
    assert used_fallback and narration.text


def test_get_client_with_empty_key_does_not_raise(monkeypatch):
    # An empty DASHSCOPE_API_KEY used to crash OpenAI client construction —
    # outside the callers' fallback guards, so /ask and the narrate workers
    # returned 500 instead of falling back. Construction must succeed and defer
    # the failure to the request, which the fallback paths already handle.
    monkeypatch.setattr(settings, "dashscope_api_key", "")
    assert llm_narrator.get_client() is not None


# --- memory digest reaches the prompt ---

class _Capture:
    """Stub _complete that records the user message of each call."""

    def __init__(self):
        self.user_messages = []

    def __call__(self, client, model, messages):
        self.user_messages.append(messages[-1]["content"])
        return json.dumps({"text": "Keep going, you've got this."})


def test_memory_digest_personalises_first_frame(monkeypatch):
    cap = _Capture()
    monkeypatch.setattr(llm_narrator, "_complete", cap)
    monkeypatch.setattr(settings, "narration_workers", 1)  # deterministic capture order
    plan = build_topic_lesson("sune")
    memory = {
        "sessions": 3,
        "struggles": [{"stage": "middle-layer", "label": "Middle layer", "mistakes": 6}],
        "mastered": ["Cross"],
    }
    list(llm_narrator.narrate_plan(plan, client=None, model="x", memory=memory))
    first = cap.user_messages[0]
    assert "3 recent session" in first
    assert "Middle layer" in first  # welcome-back names the struggle
    assert "Cross" in first  # ...and what they've mastered


def test_stage_struggle_note_targets_matching_stage(monkeypatch):
    cap = _Capture()
    monkeypatch.setattr(llm_narrator, "_complete", cap)
    monkeypatch.setattr(settings, "narration_workers", 1)  # deterministic capture order
    s = solved_state()
    apply_moves(s, "R U F D L B".split())
    plan = build_solve_walkthrough(s)
    stages = [fr.stage for fr in plan.frames]
    target = next(st for st in stages if st != "intro")
    memory = {"sessions": 1, "struggles": [{"stage": target, "label": target, "mistakes": 4}]}
    msgs = list(llm_narrator.narrate_plan(plan, client=None, model="x", memory=memory))
    idx = stages.index(target)
    assert "struggled with this stage" in cap.user_messages[idx]


def test_no_memory_means_no_continuity(monkeypatch):
    cap = _Capture()
    monkeypatch.setattr(llm_narrator, "_complete", cap)
    plan = build_topic_lesson("sune")
    list(llm_narrator.narrate_plan(plan, client=None, model="x", memory=None))
    assert all("recent session" not in m for m in cap.user_messages)


class _StageEcho:
    """Stub _complete that echoes each frame's stage, so order can be checked."""

    def __call__(self, client, model, messages):
        stage = ""
        for line in messages[-1]["content"].splitlines():
            if line.startswith("Frame stage: "):
                stage = line[len("Frame stage: "):].strip()
        return json.dumps({"text": f"narrate {stage}"})


def test_narrate_plan_preserves_frame_order(monkeypatch):
    # Frames narrate concurrently, but results must stay aligned to their frames
    # and in the original order (so the SSE stream is unchanged).
    monkeypatch.setattr(llm_narrator, "_complete", _StageEcho())
    s = solved_state()
    apply_moves(s, "R U F D L B".split())
    plan = build_solve_walkthrough(s)
    out = list(llm_narrator.narrate_plan(plan, client=None, model="x", memory=None))
    assert [fr.id for fr, _, _ in out] == [fr.id for fr in plan.frames]
    for fr, narr, _ in out:
        assert narr.text == f"narrate {fr.stage}"


# --- mid-lesson Q&A grounding ---

def test_build_ask_message_grounds_in_state():
    s = solved_state()
    msg = llm_narrator.build_ask_message(
        "why?", stage="cross", moves=["R"], level="newbie", memory=None, state=s)
    assert "currently solved" in msg
    apply_moves(s, ["R"])
    msg2 = llm_narrator.build_ask_message(
        "why?", stage="cross", moves=["R"], level="newbie", memory=None, state=s)
    assert "not solved" in msg2


def test_answer_question_allows_out_of_list_moves(monkeypatch):
    # Unlike frame narration, a Q&A answer isn't restricted to the move list, so
    # a genuinely helpful answer is returned instead of the grounded fallback.
    monkeypatch.setattr(
        llm_narrator, "_complete",
        lambda c, m, msgs: json.dumps({"text": "Try L then B to fix it."}))
    text, used_fallback = llm_narrator.answer_question("help", moves=["R", "U"])
    assert not used_fallback and text == "Try L then B to fix it."


def test_answer_question_falls_back_on_empty(monkeypatch):
    monkeypatch.setattr(
        llm_narrator, "_complete", lambda c, m, msgs: json.dumps({"text": "   "}))
    _text, used_fallback = llm_narrator.answer_question("help", moves=["R"])
    assert used_fallback


# --- memory budgeting & forgetting ---

def test_within_budget_truncates_on_word_boundary():
    text = "word " * 100  # ~500 chars, well over the budget
    out = llm_narrator._within_budget(text, budget=40)
    assert len(out) <= 41  # budget + the ellipsis
    assert out.endswith("…")
    assert "wor…" not in out  # never cuts mid-word


def test_within_budget_passes_short_text_through():
    assert llm_narrator._within_budget("short note") == "short note"


def test_welcome_line_surfaces_due_for_review():
    memory = {"sessions": 2, "dueForReview": ["Yellow cross", "Sune"]}
    line = llm_narrator.welcome_line(memory)
    assert "while since they practised" in line
    assert "Yellow cross" in line


def test_welcome_line_is_budget_capped():
    # A long mastered list must not blow the memory budget.
    memory = {"sessions": 9, "mastered": [f"Skill number {i}" for i in range(50)]}
    line = llm_narrator.welcome_line(memory)
    assert len(line) <= llm_narrator.MEMORY_CHAR_BUDGET + 1


def test_stage_note_prioritised_over_welcome(monkeypatch):
    cap = _Capture()
    monkeypatch.setattr(llm_narrator, "_complete", cap)
    monkeypatch.setattr(settings, "narration_workers", 1)  # deterministic capture order
    plan = build_topic_lesson("sune")
    target = plan.frames[0].stage
    memory = {
        "sessions": 4,
        "struggles": [{"stage": target, "label": target, "mistakes": 5}],
    }
    list(llm_narrator.narrate_plan(plan, client=None, model="x", memory=memory))
    first = cap.user_messages[0]
    # Frame 0 carries both; the stage-specific note comes before the welcome nod.
    assert first.index("struggled with this stage") < first.index("recent session")


# --- merge ---

def test_beat_from_keeps_skeleton_moves():
    fr = _frame(["R", "U"])
    beat = beat_from(fr, FrameNarration(text="hi"))
    assert beat.moves == ["R", "U"] and beat.highlight == "edge" and beat.text == "hi"


def test_beat_from_carries_stage_id():
    beat = beat_from(_frame(["R"]), FrameNarration(text="hi"))
    assert beat.stage == "demo"
    # Serialized camelCase payload exposes it for the review canvas.
    assert beat.model_dump(by_alias=True, exclude_none=True)["stage"] == "demo"


def test_beat_from_carries_expected_state_on_solve_beats():
    s = solved_state()
    apply_moves(s, "R U F D L B".split())
    plan = build_solve_walkthrough(s)
    stage_frame = next(fr for fr in plan.frames if fr.expected_state is not None)
    beat = beat_from(stage_frame, FrameNarration(text="turn"))
    assert beat.expected_state == stage_frame.expected_state
    # Serialized camelCase payload exposes it for physical-mode checkpoints;
    # catalog beats (expected_state=None) keep it out via exclude_none.
    assert beat.model_dump(by_alias=True, exclude_none=True)["expectedState"] == stage_frame.expected_state
    intro = beat_from(plan.frames[0], FrameNarration(text="intro"))
    assert "expectedState" not in intro.model_dump(by_alias=True, exclude_none=True)


def test_step_from_setup_frame_uses_move_sequence_validator():
    plan = build_topic_lesson("sexy-move")
    fr = plan.frames[0]
    step = step_from(fr, FrameNarration(text="do it", title="Sexy", hints=["go"]))
    assert step.validator.type == "moveSequence"
    assert step.expected_moves == fr.moves
    assert step.setup_moves == fr.setup_moves
    assert step.highlight == fr.highlight == "corner"  # highlight carries to the step


def test_step_from_solve_stage_uses_cube_state_validator():
    s = solved_state()
    apply_moves(s, "R U F D L B".split())
    plan = build_solve_lesson(s)
    stage_frame = next(fr for fr in plan.frames if fr.moves)  # first real stage
    step = step_from(stage_frame, FrameNarration(text="follow along"))
    assert step.validator.type == "cubeState"
    assert step.expected_moves == stage_frame.moves
    # The grade target is the exact state after performing the stage's moves.
    assert step.validator.expected == stage_frame.expected_state


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

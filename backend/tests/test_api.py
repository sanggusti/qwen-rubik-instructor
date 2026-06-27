"""Phase 5: SSE endpoints stream a valid, correct session (LLM mocked)."""

import json

import pytest
from fastapi.testclient import TestClient

from narrative import llm_narrator
from narrative.schema import Beat, LessonStep
from pipeline.cube.facelet import apply_moves, is_solved, solved_state

import main


@pytest.fixture(autouse=True)
def mock_llm(monkeypatch):
    monkeypatch.setattr(
        llm_narrator, "_complete",
        lambda client, model, messages: json.dumps({"text": "Follow along carefully."}),
    )


@pytest.fixture
def client():
    return TestClient(main.app)


def parse_sse(text):
    events = []
    for chunk in text.strip().split("\n\n"):
        line = chunk.strip()
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


def test_topics_endpoint(client):
    data = client.get("/topics").json()
    assert "sune" in data["walkthrough"]
    assert "anatomy" not in data["lesson"]


def test_walkthrough_topic_stream(client):
    res = client.post("/narrate/walkthrough", json={"topic": "sune"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(res.text)
    assert events[0]["type"] == "meta" and events[0]["kind"] == "walkthrough"
    assert events[-1]["type"] == "done"
    beats = [e for e in events if e["type"] == "beat"]
    assert beats and events[0]["frameCount"] == len(beats)
    for e in beats:
        Beat.model_validate(e["beat"])  # in-contract


def test_lesson_topic_stream_has_move_sequence_validator(client):
    res = client.post("/narrate/lesson", json={"topic": "sexy-move"})
    events = parse_sse(res.text)
    steps = [e for e in events if e["type"] == "step"]
    assert steps
    step = LessonStep.model_validate(steps[0]["step"])
    assert step.validator.type == "moveSequence"


def test_solve_walkthrough_stream_actually_solves(client):
    # The streamed walkthrough is self-contained: from solved, intro re-creates
    # the scramble and the remaining beats solve it.
    state = solved_state()
    apply_moves(state, "R U R' U' F2 B L D' R B'".split())
    res = client.post("/narrate/walkthrough", json={"state": state})
    events = parse_sse(res.text)
    beats = [e["beat"] for e in events if e["type"] == "beat"]
    all_moves = [m for b in beats for m in b.get("moves", [])]
    work = solved_state()
    apply_moves(work, all_moves)
    assert is_solved(work)


def test_bad_requests(client):
    assert client.post("/narrate/walkthrough", json={}).status_code == 400
    assert client.post("/narrate/walkthrough", json={"topic": "nope"}).status_code == 400
    bad_state = {"U": ["U"] * 9}  # missing faces
    assert client.post("/narrate/walkthrough", json={"state": bad_state}).status_code == 400

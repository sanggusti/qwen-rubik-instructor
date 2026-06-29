"""Phase 0: schema round-trips and camelCase serialization match the frontend."""

from fastapi.testclient import TestClient

from main import app
from narrative.schema import (
    Beat,
    Lesson,
    LessonStep,
    MoveSequenceValidator,
    Walkthrough,
)


def test_health():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_beat_serializes_camelcase():
    beat = Beat(text="Turn the right face", moves=["R", "U", "R'"], highlight="corner", dwell_ms=900)
    data = beat.model_dump(by_alias=True, exclude_none=True)
    assert data == {
        "text": "Turn the right face",
        "moves": ["R", "U", "R'"],
        "highlight": "corner",
        "dwellMs": 900,
    }


def test_walkthrough_round_trip():
    wt = Walkthrough(
        id="gen-1",
        title="Solve it",
        description="demo",
        beats=[Beat(text="start"), Beat(text="turn", moves=["R"], highlight="edge")],
    )
    dumped = wt.model_dump(by_alias=True, exclude_none=True)
    assert Walkthrough.model_validate(dumped) == wt
    assert dumped["beats"][0] == {"text": "start", "moves": []}


def test_lesson_step_validator_discriminated():
    step = LessonStep(
        id="s1",
        title="Trigger",
        body="Do R U R' U'",
        setup_moves=["F"],
        expected_moves=["R", "U", "R'", "U'"],
        hints=["right hand"],
        validator=MoveSequenceValidator(moves=["R", "U", "R'", "U'"]),
    )
    data = step.model_dump(by_alias=True, exclude_none=True)
    assert data["setupMoves"] == ["F"]
    assert data["expectedMoves"] == ["R", "U", "R'", "U'"]
    assert data["validator"] == {"type": "moveSequence", "moves": ["R", "U", "R'", "U'"]}


def test_lesson_round_trip():
    lesson = Lesson(
        id="gen-lesson",
        track="beginner",
        title="First lesson",
        audience="new solvers",
        description="learn the trigger",
        steps=[
            LessonStep(
                id="s1", title="t", body="b", validator=MoveSequenceValidator(moves=["R"])
            )
        ],
    )
    dumped = lesson.model_dump(by_alias=True, exclude_none=True)
    assert Lesson.model_validate(dumped) == lesson

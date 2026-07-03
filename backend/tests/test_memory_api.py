"""Persistence endpoints + narration precedence (client digest wins; persisted
memory is the fallback when only a userId is sent)."""

import json

import pytest
from fastapi.testclient import TestClient

from narrative import llm_narrator

import main


@pytest.fixture
def captured_prompts(monkeypatch):
    captured = []

    def fake_complete(client, model, messages):
        captured.append(messages)
        return json.dumps({"text": "Follow along carefully."})

    monkeypatch.setattr(llm_narrator, "_complete", fake_complete)
    return captured


@pytest.fixture
def client(captured_prompts):
    return TestClient(main.app)


PROFILE = {
    "userId": "user-123",
    "handle": "alice",
    "level": "intermediate",
    "method": "cfop",
    "history": [
        {"kind": "lesson", "method": "cfop", "stages": 5, "at": "2026-06-01T00:00:00Z"},
        {"kind": "walkthrough", "method": "cfop", "stages": 4, "at": "2026-06-02T00:00:00Z"},
    ],
    "performance": {
        "middle": {"stage": "middle", "label": "Persisted middle layer", "attempts": 3,
                   "mistakes": 7, "lastAt": "2026-06-02T00:00:00Z", "mastered": False},
        "cross": {"stage": "cross", "label": "Persisted cross", "attempts": 2,
                  "mistakes": 0, "lastAt": "2026-06-02T00:00:00Z", "mastered": True},
    },
}


def all_prompt_text(captured):
    return " ".join(
        m["content"] for messages in captured for m in messages
    )


# --- sync + get round trip ------------------------------------------------------

def test_sync_then_get_memory(client, temp_db):
    res = client.post("/memory/sync", json=PROFILE)
    assert res.status_code == 200
    assert res.json() == {"ok": True, "persisted": True}

    memory = client.get("/memory/user-123").json()
    assert memory["userId"] == "user-123"
    assert memory["handle"] == "alice"
    digest = memory["digest"]
    assert digest["level"] == "intermediate"
    assert digest["sessions"] == 2
    assert digest["lastKind"] == "walkthrough"
    assert [s["label"] for s in digest["struggles"]] == ["Persisted middle layer"]
    assert digest["mastered"] == ["Persisted cross"]


def test_get_memory_unknown_user_404(client, temp_db):
    assert client.get("/memory/nobody").status_code == 404


def test_sync_when_db_off_returns_ok_not_persisted(client):
    res = client.post("/memory/sync", json=PROFILE)
    assert res.status_code == 200
    assert res.json() == {"ok": True, "persisted": False}


def test_get_memory_when_db_off_404(client):
    assert client.get("/memory/user-123").status_code == 404


# --- attempts + leaderboard -------------------------------------------------------

def test_attempt_then_leaderboard(client, temp_db):
    res = client.post("/attempts", json={
        "userId": "user-123", "drillId": "sexy-move", "durationMs": 8200, "handle": "alice"})
    assert res.status_code == 200
    assert res.json() == {"ok": True, "persisted": True, "bestMs": 8200}

    client.post("/attempts", json={
        "userId": "user-456", "drillId": "sexy-move", "durationMs": 5400})

    board = client.get("/leaderboard", params={"drillId": "sexy-move"}).json()
    assert board["drillId"] == "sexy-move"
    assert board["persisted"] is True
    assert [(e["handle"], e["bestMs"]) for e in board["entries"]] == [
        ("anonymous", 5400), ("alice", 8200)]


def test_attempt_rejects_nonpositive_duration(client, temp_db):
    res = client.post("/attempts", json={
        "userId": "u", "drillId": "d", "durationMs": 0})
    assert res.status_code == 400


def test_attempt_and_leaderboard_when_db_off(client):
    res = client.post("/attempts", json={
        "userId": "u", "drillId": "d", "durationMs": 1000})
    assert res.status_code == 200
    assert res.json() == {"ok": True, "persisted": False, "bestMs": None}

    board = client.get("/leaderboard", params={"drillId": "d"}).json()
    assert board == {"drillId": "d", "persisted": False, "entries": []}


# --- narration precedence ---------------------------------------------------------

def test_narration_uses_persisted_memory_when_only_user_id(client, temp_db, captured_prompts):
    client.post("/memory/sync", json=PROFILE)
    res = client.post("/narrate/walkthrough", json={"topic": "sune", "userId": "user-123"})
    assert res.status_code == 200
    text = all_prompt_text(captured_prompts)
    assert "returning learner has done 2 recent session(s)" in text
    assert "Persisted middle layer" in text


def test_client_digest_wins_over_persisted(client, temp_db, captured_prompts):
    client.post("/memory/sync", json=PROFILE)
    res = client.post("/narrate/walkthrough", json={
        "topic": "sune",
        "userId": "user-123",
        "memory": {"sessions": 9, "struggles": [
            {"stage": "oll", "label": "Client-sent OLL", "mistakes": 3}]},
    })
    assert res.status_code == 200
    text = all_prompt_text(captured_prompts)
    assert "Client-sent OLL" in text
    assert "Persisted middle layer" not in text


def test_narration_without_user_id_or_memory_unchanged(client, temp_db, captured_prompts):
    res = client.post("/narrate/walkthrough", json={"topic": "sune"})
    assert res.status_code == 200
    assert "returning learner" not in all_prompt_text(captured_prompts)


def test_ask_uses_persisted_memory(client, temp_db, captured_prompts):
    client.post("/memory/sync", json=PROFILE)

    def fake_complete(client_, model, messages):
        captured_prompts.append(messages)
        return "Short answer."

    # /ask returns plain text (not JSON), so re-patch with a plain-text reply.
    llm_narrator._complete = fake_complete
    res = client.post("/ask", json={"question": "What is a sune?", "userId": "user-123"})
    assert res.status_code == 200
    assert "returning learner has done 2 recent session(s)" in all_prompt_text(captured_prompts)

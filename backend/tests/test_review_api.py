"""Review-session mirror endpoints: client-authoritative snapshot of the
latest captured solve walkthrough (scramble + narrated stage beats) so the
/review canvas can follow a learner across devices."""

import pytest
from fastapi.testclient import TestClient

from db import service

import main


@pytest.fixture
def client():
    return TestClient(main.app)


SESSION = {
    "version": 1,
    "startedAt": "2026-07-06T00:00:00Z",
    "scrambleCount": 2,
    "solve": {
        "capturedAt": "2026-07-06T00:05:00Z",
        "title": "Solve my cube",
        "description": "Layer by layer",
        "level": "newbie",
        "method": "lbl",
        "beats": [
            {"text": "Scramble first.", "moves": ["R", "U", "F"], "pace": "fast"},
            {"text": "Now the cross.", "moves": ["F'", "U'", "R'"],
             "stage": "cross", "highlight": "edge"},
        ],
    },
}


# --- sync + get round trip ------------------------------------------------------

def test_review_sync_then_get(client, temp_db):
    res = client.post("/review/sync", json={"userId": "user-123", "session": SESSION})
    assert res.status_code == 200
    assert res.json() == {"ok": True, "persisted": True}

    review = client.get("/review/user-123").json()
    assert review["userId"] == "user-123"
    assert review["session"] == SESSION
    assert review["updatedAt"]


def test_review_sync_replaces_wholesale(client, temp_db):
    client.post("/review/sync", json={"userId": "user-123", "session": SESSION})
    replacement = {"version": 1, "startedAt": "2026-07-07T00:00:00Z", "scrambleCount": 0}
    client.post("/review/sync", json={"userId": "user-123", "session": replacement})
    assert client.get("/review/user-123").json()["session"] == replacement


def test_review_get_unknown_user_404(client, temp_db):
    assert client.get("/review/nobody").status_code == 404


# --- disabled mode ------------------------------------------------------------

def test_review_sync_when_db_off_returns_ok_not_persisted(client):
    res = client.post("/review/sync", json={"userId": "user-123", "session": SESSION})
    assert res.status_code == 200
    assert res.json() == {"ok": True, "persisted": False}


def test_review_get_when_db_off_404(client):
    assert client.get("/review/user-123").status_code == 404


def test_service_noops_when_disabled():
    assert service.save_review_session("u", SESSION) is False
    assert service.load_review_session("u") is None


# --- guards ---------------------------------------------------------------------

def test_review_sync_oversized_payload_413(client, temp_db):
    huge = {"version": 1, "blob": "x" * (service.REVIEW_PAYLOAD_MAX_BYTES + 1)}
    res = client.post("/review/sync", json={"userId": "user-123", "session": huge})
    assert res.status_code == 413

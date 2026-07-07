"""/scan/assist: fakeable vision seam, size guard, rate limit, degradation."""

import base64
import json

import pytest
from fastapi.testclient import TestClient

import main
from config import settings
from scan import routes as scan_routes


@pytest.fixture()
def client():
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def _fresh_buckets():
    scan_routes._BUCKETS.clear()
    yield
    scan_routes._BUCKETS.clear()


def _tiny_image_b64() -> str:
    return base64.b64encode(b"\xff\xd8\xff fake jpeg bytes").decode("ascii")


def _request_body(face="F", image=None, cells=None):
    return {
        "faces": [
            {
                "face": face,
                "imageBase64": image or _tiny_image_b64(),
                "lowConfidenceCells": cells or [0, 2],
            }
        ]
    }


def test_returns_sanitized_faces(client, monkeypatch):
    def fake_vision(client_, model, messages):
        assert model == settings.qwen_vl_model
        # The user content must carry an image part.
        parts = messages[1]["content"]
        assert any(p.get("type") == "image_url" for p in parts)
        return json.dumps(
            {
                "faces": [
                    {"face": "F", "cells": ["U", "D", "L", "R", "F", "B", "U", "D", "F"]},
                    {"face": "B", "cells": ["U"] * 9},  # not requested -> dropped
                    {"face": "F", "cells": ["U", "X"]},  # malformed -> dropped
                ]
            }
        )

    monkeypatch.setattr(scan_routes, "_complete_vision", fake_vision)
    res = client.post("/scan/assist", json=_request_body())
    assert res.status_code == 200
    body = res.json()
    assert body["degraded"] is False
    assert body["faces"] == [
        {"face": "F", "cells": ["U", "D", "L", "R", "F", "B", "U", "D", "F"]}
    ]


def test_accepts_data_url_prefix(client, monkeypatch):
    monkeypatch.setattr(
        scan_routes, "_complete_vision", lambda c, m, msgs: json.dumps({"faces": []})
    )
    image = "data:image/png;base64," + _tiny_image_b64()
    res = client.post("/scan/assist", json=_request_body(image=image))
    assert res.status_code == 200


def test_oversized_image_413(client, monkeypatch):
    monkeypatch.setattr(settings, "scan_max_image_bytes", 16)
    res = client.post("/scan/assist", json=_request_body())
    assert res.status_code == 413


def test_invalid_base64_400(client):
    res = client.post("/scan/assist", json=_request_body(image="not base64 at all!!!"))
    assert res.status_code == 400


def test_unknown_face_400(client):
    res = client.post("/scan/assist", json=_request_body(face="Q"))
    assert res.status_code == 400


def test_no_faces_400(client):
    res = client.post("/scan/assist", json={"faces": []})
    assert res.status_code == 400


def test_rate_limited_429(client, monkeypatch):
    monkeypatch.setattr(settings, "scan_rate_per_min", 2)
    monkeypatch.setattr(
        scan_routes, "_complete_vision", lambda c, m, msgs: json.dumps({"faces": []})
    )
    assert client.post("/scan/assist", json=_request_body()).status_code == 200
    assert client.post("/scan/assist", json=_request_body()).status_code == 200
    assert client.post("/scan/assist", json=_request_body()).status_code == 429


def test_vision_failure_degrades_gracefully(client, monkeypatch):
    def boom(c, m, msgs):
        raise RuntimeError("network down")

    monkeypatch.setattr(scan_routes, "_complete_vision", boom)
    res = client.post("/scan/assist", json=_request_body())
    assert res.status_code == 200
    assert res.json() == {"faces": [], "degraded": True}

"""POST /scan/assist — Qwen-VL fallback for ambiguous sticker reads.

The client's classical CV pipeline is primary (free, instant); this endpoint
is called only for low-confidence cells (red/orange in dim light, etc.) or a
legality failure the rotation auto-fix couldn't resolve. It is the ONLY
Qwen-VL touchpoint: the DashScope key stays server-side. Responses degrade
gracefully (empty faces + degraded flag) exactly like narration fallbacks —
the adjust grid always lets the user decide by hand.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from config import settings
from narrative.llm_narrator import get_client

log = logging.getLogger("scan")

router = APIRouter()

VALID_FACES = ("U", "D", "L", "R", "F", "B")

SYSTEM_PROMPT = (
    "You read Rubik's cube faces from photos. Colors map to letters by the face "
    "they belong on: U=white, D=yellow, L=orange, R=red, F=green, B=blue. "
    "For each provided image, report the 9 sticker letters in reading order "
    "(top-left to bottom-right, from the viewer's perspective). "
    'Answer ONLY with JSON: {"faces": [{"face": "<letter>", "cells": ["U", ...9 letters]}]}'
)


class ScanFace(BaseModel):
    # Face identity established by the client's center anchor.
    face: str
    # Base64 image payload (JPEG/PNG), with or without a data: URL prefix.
    imageBase64: str
    # Cell indices the client's classifier was unsure about (informational).
    lowConfidenceCells: Optional[List[int]] = None


class ScanAssistRequest(BaseModel):
    faces: List[ScanFace]


# In-memory per-client token bucket (no external deps; resets on restart —
# this is abuse protection for a fallback endpoint, not billing enforcement).
_BUCKETS: Dict[str, tuple[float, float]] = {}


def _rate_ok(client_id: str) -> bool:
    capacity = float(settings.scan_rate_per_min)
    refill_per_s = capacity / 60.0
    now = time.monotonic()
    tokens, last = _BUCKETS.get(client_id, (capacity, now))
    tokens = min(capacity, tokens + (now - last) * refill_per_s)
    if tokens < 1.0:
        _BUCKETS[client_id] = (tokens, now)
        return False
    _BUCKETS[client_id] = (tokens - 1.0, now)
    return True


def _decoded_image(raw: str) -> tuple[str, bytes]:
    """Return (mime, bytes); raises ValueError on garbage or oversized data."""
    mime = "image/jpeg"
    payload = raw
    if raw.startswith("data:"):
        head, _, payload = raw.partition(",")
        if ";base64" not in head:
            raise ValueError("expected base64 image data")
        mime = head[5:].split(";", 1)[0] or mime
    try:
        blob = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("invalid base64 image data")
    if len(blob) > settings.scan_max_image_bytes:
        raise ValueError("scan image too large")
    return mime, blob


def _complete_vision(client, model: str, messages: list) -> str:
    """Single monkeypatchable seam for the vision call (mirrors _complete)."""
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    return resp.choices[0].message.content or ""


def _sanitize(raw: str, requested: List[str]) -> List[dict]:
    """Keep only well-formed faces the client actually asked about."""
    parsed = json.loads(raw)
    out: List[dict] = []
    for item in parsed.get("faces", []):
        face = item.get("face")
        cells = item.get("cells")
        if face not in requested:
            continue
        if not isinstance(cells, list) or len(cells) != 9:
            continue
        if not all(c in VALID_FACES for c in cells):
            continue
        out.append({"face": face, "cells": cells})
    return out


@router.post("/scan/assist")
def scan_assist(req: ScanAssistRequest, request: Request) -> dict:
    if not req.faces or len(req.faces) > 6:
        raise HTTPException(status_code=400, detail="provide 1-6 faces")
    for f in req.faces:
        if f.face not in VALID_FACES:
            raise HTTPException(status_code=400, detail=f"unknown face '{f.face}'")

    client_id = request.client.host if request.client else "unknown"
    if not _rate_ok(client_id):
        raise HTTPException(status_code=429, detail="too many scan assists — try again in a minute")

    content: list = [{"type": "text", "text": "Read these cube faces:"}]
    for f in req.faces:
        try:
            mime, blob = _decoded_image(f.imageBase64)
        except ValueError as exc:
            if "too large" in str(exc):
                raise HTTPException(status_code=413, detail="scan image too large")
            raise HTTPException(status_code=400, detail=str(exc))
        b64 = base64.b64encode(blob).decode("ascii")
        hint = (
            f" (unsure about cells {f.lowConfidenceCells})" if f.lowConfidenceCells else ""
        )
        content.append({"type": "text", "text": f"Face '{f.face}'{hint}:"})
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]

    try:
        raw = _complete_vision(get_client(), settings.qwen_vl_model, messages)
        faces = _sanitize(raw, [f.face for f in req.faces])
        return {"faces": faces, "degraded": False}
    except Exception:
        # Same spirit as narration fallbacks: the client's adjust grid still
        # lets the user fix stickers by hand.
        log.warning("scan assist degraded", exc_info=True)
        return {"faces": [], "degraded": True}

"""Validate LLM narration against the schema and the deterministic skeleton.

The model writes wording only. It must not invent moves: any move notation it
mentions has to be a move that actually appears on the frame. This is the guard
that keeps "generative narration" from drifting away from "deterministic
structure".
"""

from __future__ import annotations

import json
import re
from typing import Optional, Tuple

from pydantic import ValidationError

from narrative.schema import FrameNarration, VisualFrame
from pipeline.cube.notation import normalize

# Uppercase face/slice notation tokens optionally followed by ' or 2.
_MOVE_IN_TEXT = re.compile(r"\b([UDLRFBMES])(['2]?)\b")
# Narration must be short — roughly one sentence. Anything longer is re-prompted.
MAX_TEXT_LEN = 220


def claimed_moves(text: str) -> list[str]:
    """Move tokens mentioned in prose, expanded to single quarter-turns."""
    raw = ["".join(m) for m in _MOVE_IN_TEXT.findall(text)]
    try:
        return normalize(raw)
    except ValueError:
        return raw


def parse_narration(payload: str | dict) -> FrameNarration:
    """Parse a JSON string or dict into a FrameNarration (raises on bad shape)."""
    data = json.loads(payload) if isinstance(payload, str) else payload
    return FrameNarration.model_validate(data)


def validate_narration(
    frame: VisualFrame, payload: str | dict
) -> Tuple[bool, Optional[str], Optional[FrameNarration]]:
    """Returns (ok, reason_if_bad, parsed_narration_if_ok)."""
    try:
        narration = parse_narration(payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        return False, f"unparseable narration: {exc}", None

    if not narration.text.strip():
        return False, "empty narration text", None
    if len(narration.text) > MAX_TEXT_LEN:
        return False, "narration text too long", None

    allowed = set(frame.moves)
    invented = [m for m in claimed_moves(narration.text) if m not in allowed]
    if invented:
        return False, f"narration mentions moves not in the frame: {sorted(set(invented))}", None

    return True, None, narration

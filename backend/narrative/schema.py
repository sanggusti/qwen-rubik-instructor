"""Pydantic models mirroring the frontend content contracts plus the internal
deterministic skeleton (VisualPlan/Frame) and the LLM narration shape.

Frontend sources of truth:
  - frontend/src/education/walkthrough.ts   -> Beat, Walkthrough
  - frontend/src/education/lesson_types.ts  -> StepValidator, LessonStep, Lesson
  - frontend/src/scene/cube/cubelets.ts     -> CubeletType (highlight enum)

Output models serialize with camelCase aliases (dwellMs, setupMoves, ...) so the
JSON matches the TypeScript interfaces exactly.
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# Cubelet classes the frontend can spotlight; null restores full opacity.
HighlightType = Optional[Literal["core", "center", "edge", "corner"]]
LessonTrack = Literal["beginner", "time-improvement"]


class CamelModel(BaseModel):
    """Base model: snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --- Walkthrough contract -------------------------------------------------

class Beat(CamelModel):
    text: str
    moves: list[str] = Field(default_factory=list)
    highlight: HighlightType = None
    dwell_ms: Optional[int] = None
    # 'step' paces moves one-by-one (followable); 'fast' applies them at once (setup).
    pace: Optional[Literal["step", "fast"]] = None


class Walkthrough(CamelModel):
    id: str
    title: str
    description: str
    beats: list[Beat]


# --- Lesson contract ------------------------------------------------------

class ManualValidator(CamelModel):
    type: Literal["manual"] = "manual"


class MoveSequenceValidator(CamelModel):
    type: Literal["moveSequence"] = "moveSequence"
    moves: list[str]


class CubeSolvedValidator(CamelModel):
    type: Literal["cubeSolved"] = "cubeSolved"


class CubeStateValidator(CamelModel):
    # Completes when the learner's cube reaches `expected` — the exact state after
    # this solve stage's moves. Lets a solve-stage lesson auto-grade (and detect
    # mistakes) instead of trusting a manual "Mark complete".
    type: Literal["cubeState"] = "cubeState"
    expected: dict[str, list[str]]


StepValidator = Union[
    ManualValidator, MoveSequenceValidator, CubeSolvedValidator, CubeStateValidator
]


class LessonStep(CamelModel):
    id: str
    title: str
    body: str
    setup_moves: Optional[list[str]] = None
    expected_moves: Optional[list[str]] = None
    hints: Optional[list[str]] = None
    validator: StepValidator


class Lesson(CamelModel):
    id: str
    track: LessonTrack
    title: str
    audience: str
    description: str
    steps: list[LessonStep]


# --- Internal deterministic skeleton (not sent verbatim to the frontend) --

class VisualFrame(CamelModel):
    """One deterministic unit of a plan. Becomes a Beat (walkthrough) or a
    LessonStep (lesson) once narration is merged in. Moves are pre-normalized to
    single quarter-turns; the LLM never alters them."""

    id: str
    stage: str  # e.g. "intro", "cross", "first-layer-corners"
    moves: list[str] = Field(default_factory=list)
    setup_moves: list[str] = Field(default_factory=list)
    highlight: HighlightType = None
    focus: str  # short machine hint of what to talk about
    expected: str  # deterministic description of the result
    # The cube state after this frame's moves (solve stages only), so a solve
    # lesson can grade against the cube instead of a manual "Mark complete".
    expected_state: Optional[dict[str, list[str]]] = None
    dwell_ms: Optional[int] = None
    pace: Optional[Literal["step", "fast"]] = None


class VisualPlan(CamelModel):
    kind: Literal["walkthrough", "lesson"]
    id: str
    title: str
    description: str
    track: Optional[LessonTrack] = None
    audience: Optional[str] = None
    frames: list[VisualFrame]


# --- LLM narration (the ONLY thing the model produces) --------------------

class FrameNarration(CamelModel):
    """What the LLM returns for a single frame: wording only."""

    text: str
    title: Optional[str] = None  # used for lesson steps
    hints: list[str] = Field(default_factory=list)

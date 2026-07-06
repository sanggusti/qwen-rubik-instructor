"""Merge a skeleton frame + its narration into the final frontend object.

Moves, highlights, validators, and setup come entirely from the deterministic
frame; only text/title/hints come from the narration.
"""

from __future__ import annotations

from narrative.schema import (
    Beat,
    CubeStateValidator,
    FrameNarration,
    LessonStep,
    ManualValidator,
    MoveSequenceValidator,
    VisualFrame,
    VisualPlan,
)


def beat_from(frame: VisualFrame, narration: FrameNarration) -> Beat:
    return Beat(
        text=narration.text,
        moves=frame.moves,
        highlight=frame.highlight,
        dwell_ms=frame.dwell_ms,
        pace=frame.pace,
        stage=frame.stage or None,
    )


def step_from(frame: VisualFrame, narration: FrameNarration) -> LessonStep:
    # A set-up practice frame expects the exact moves; a solve stage grades
    # against the cube state it should reach; everything else is followed manually.
    if frame.setup_moves:
        validator = MoveSequenceValidator(moves=frame.moves)
    elif frame.expected_state is not None:
        validator = CubeStateValidator(expected=frame.expected_state)
    else:
        validator = ManualValidator()
    return LessonStep(
        id=frame.id,
        title=narration.title or frame.stage.replace("-", " ").title(),
        body=narration.text,
        setup_moves=frame.setup_moves or None,
        expected_moves=frame.moves or None,
        hints=narration.hints or None,
        validator=validator,
        highlight=frame.highlight,
    )

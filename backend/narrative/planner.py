"""Build the deterministic VisualPlan (the skeleton the LLM narrates).

Two sources:
  - a cube State -> a full LBL solve plan (walkthrough or lesson)
  - a topic id  -> a hand-curated plan for state-free demos/drills

Every move on every frame is normalized to single quarter-turns, so the plan is
always frontend-safe before the LLM ever sees it.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from narrative.schema import VisualFrame, VisualPlan
from pipeline.cube.facelet import State
from pipeline.cube.notation import invert, normalize
from pipeline.solver import solve

INTRO_DWELL_MS = 1600
STAGE_DWELL_MS = 1200


def _short_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# --- Topic catalog --------------------------------------------------------

# Algorithm topics: a named sequence the learner watches or performs. The lesson
# form sets up with the inverse so performing the algorithm returns to solved.
ALG_TOPICS = {
    "sexy-move": {
        "title": "The sexy move",
        "description": "The R U R' U' trigger — the most-used pattern in solving.",
        "moves": normalize("R U R' U'".split()),
        "highlight": "corner",
        "focus": "the right-hand R U R' U' trigger",
    },
    "sune": {
        "title": "Sune",
        "description": "A last-layer algorithm that orients corners.",
        "moves": normalize("R U R' U R U2 R'".split()),
        "highlight": "corner",
        "focus": "orienting the last-layer corners",
    },
    "t-perm": {
        "title": "T-perm",
        "description": "A last-layer permutation that swaps two corners and two edges.",
        "moves": normalize("R U R' U' R' F R2 U' R' U' R U R' F'".split()),
        "highlight": "edge",
        "focus": "swapping last-layer corners and edges",
    },
}


def topic_ids() -> List[str]:
    return ["anatomy", *ALG_TOPICS.keys()]


# --- Solve-derived plans --------------------------------------------------

def _solve_frames(state: State) -> List[VisualFrame]:
    frames = [
        VisualFrame(
            id="intro",
            stage="intro",
            moves=[],
            highlight=None,
            focus="the whole cube before we start",
            expected="Introduce the solve: we'll fix it one layer at a time.",
            dwell_ms=INTRO_DWELL_MS,
        )
    ]
    for stage in solve(state):
        if not stage.moves:
            continue  # this phase is already done for this scramble
        frames.append(
            VisualFrame(
                id=stage.name,
                stage=stage.name,
                moves=stage.moves,
                highlight=stage.highlight,
                focus=stage.focus or f"{stage.highlight} pieces",
                expected=stage.goal,
                dwell_ms=STAGE_DWELL_MS,
            )
        )
    return frames


def build_solve_walkthrough(state: State) -> VisualPlan:
    # The walkthrough player resets to solved before playing, so the intro frame
    # first re-creates the user's scramble (inverse of the whole solution); the
    # later frames then solve it. This keeps the walkthrough self-contained.
    frames = _solve_frames(state)
    solution = [m for fr in frames for m in fr.moves]
    frames[0] = frames[0].model_copy(
        update={
            "moves": invert(solution),
            "expected": "Start from your scramble; we'll solve it one layer at a time.",
        }
    )
    return VisualPlan(
        kind="walkthrough",
        id=_short_id("wt-solve"),
        title="Watch the full solve",
        description="A layer-by-layer walkthrough that solves your scrambled cube.",
        frames=frames,
    )


def build_solve_lesson(state: State) -> VisualPlan:
    # Lesson steps reuse the solve stages; the learner follows each phase and
    # marks it complete (manual), with the stage moves available as the answer.
    return VisualPlan(
        kind="lesson",
        id=_short_id("lesson-solve"),
        title="Solve your cube, step by step",
        description="Follow the layer-by-layer method to solve your current cube.",
        track="beginner",
        audience="learners with a scrambled cube",
        frames=_solve_frames(state),
    )


# --- Topic plans ----------------------------------------------------------

_ANATOMY_FRAMES = [
    ("intro", None, "the whole cube", "Meet the cube: 26 little cubies moving around a fixed frame."),
    ("centers", "center", "the six center pieces", "Centers never move relative to each other; they fix each face's color."),
    ("edges", "edge", "the twelve edge pieces", "Edges have two stickers and sit between two centers."),
    ("corners", "corner", "the eight corner pieces", "Corners have three stickers and sit at the cube's vertices."),
    ("core", "core", "the hidden core", "A core holds it together and lets every layer turn."),
]


def _anatomy_walkthrough() -> VisualPlan:
    frames = [
        VisualFrame(
            id=fid, stage=fid, moves=[], highlight=hl, focus=focus, expected=expected,
            dwell_ms=INTRO_DWELL_MS if fid == "intro" else STAGE_DWELL_MS,
        )
        for fid, hl, focus, expected in _ANATOMY_FRAMES
    ]
    return VisualPlan(
        kind="walkthrough",
        id=_short_id("wt-anatomy"),
        title="Anatomy of the cube",
        description="A tour of the pieces that make up a Rubik's cube.",
        frames=frames,
    )


def build_topic_walkthrough(topic: str) -> VisualPlan:
    if topic == "anatomy":
        return _anatomy_walkthrough()
    if topic not in ALG_TOPICS:
        raise ValueError(f"unknown topic: {topic!r}")
    t = ALG_TOPICS[topic]
    frames = [
        VisualFrame(
            id="intro", stage="intro", moves=[], highlight=t["highlight"],
            focus=t["focus"], expected=f"Introduce {t['title']}.", dwell_ms=INTRO_DWELL_MS,
        ),
        VisualFrame(
            id="demo", stage="demo", moves=t["moves"], highlight=t["highlight"],
            focus=t["focus"], expected=f"Perform {t['title']}: {' '.join(t['moves'])}.",
            dwell_ms=STAGE_DWELL_MS,
        ),
    ]
    return VisualPlan(
        kind="walkthrough", id=_short_id(f"wt-{topic}"),
        title=t["title"], description=t["description"], frames=frames,
    )


def build_topic_lesson(topic: str) -> VisualPlan:
    if topic not in ALG_TOPICS:
        raise ValueError(f"topic {topic!r} is not available as a lesson")
    t = ALG_TOPICS[topic]
    frames = [
        VisualFrame(
            id="practice", stage="practice",
            moves=t["moves"],
            setup_moves=invert(t["moves"]),  # so performing the algorithm solves it
            highlight=t["highlight"],
            focus=t["focus"],
            expected=f"Perform {t['title']} ({' '.join(t['moves'])}) to return the cube to solved.",
        )
    ]
    return VisualPlan(
        kind="lesson", id=_short_id(f"lesson-{topic}"),
        title=f"Practice: {t['title']}", description=t["description"],
        track="beginner", audience="learners drilling an algorithm", frames=frames,
    )


# --- Dispatcher -----------------------------------------------------------

def plan(kind: str, state: Optional[State] = None, topic: Optional[str] = None) -> VisualPlan:
    """Build a plan. `kind` is 'walkthrough' or 'lesson'. Provide `topic` for a
    catalog plan, or `state` for a solve-derived plan."""
    if kind not in ("walkthrough", "lesson"):
        raise ValueError(f"unknown kind: {kind!r}")
    if topic:
        return build_topic_walkthrough(topic) if kind == "walkthrough" else build_topic_lesson(topic)
    if state is not None:
        return build_solve_walkthrough(state) if kind == "walkthrough" else build_solve_lesson(state)
    raise ValueError("plan requires either a topic or a cube state")

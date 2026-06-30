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
from pipeline.cube.facelet import State, apply_moves, clone_state
from pipeline.cube.notation import invert, normalize
from pipeline.solver import SolveStage, solve

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

# CFOP relabelling of the beginner LBL stages. This is a *framing*, not a real
# CFOP solver: F2L here is still beginner insertions, and the last layer keeps the
# beginner sub-steps (which don't split cleanly into OLL-then-PLL). Move ORDER is
# preserved exactly, so the solution stays correct.
_CFOP_LABELS = {
    "cross": ("Cross", "Build the cross — CFOP's first step."),
    "last-layer-cross": ("Last layer · orient edges",
                         "Orient the last-layer edges into a cross (start of OLL)."),
    "ll-corner-orientation": ("Last layer · orient corners",
                              "Orient the last-layer corners (finishing OLL)."),
    "ll-corner-position": ("Last layer · position corners",
                           "Permute the last-layer corners (start of PLL)."),
    "last-layer-edges": ("Last layer · position edges",
                         "Permute the last-layer edges (finishing PLL)."),
}


def _reframe_cfop(stages: List[SolveStage]) -> List[SolveStage]:
    """Relabel LBL stages with CFOP vocabulary, merging the two first-layer/middle
    stages into a single F2L stage. Preserves move order (and thus correctness)."""
    out: List[SolveStage] = []
    f2l_moves: List[str] = []
    f2l_stage: Optional[SolveStage] = None
    for s in stages:
        if s.name in ("first-layer-corners", "middle-layer"):
            f2l_moves.extend(s.moves)
            if f2l_stage is None:
                f2l_stage = SolveStage(
                    name="f2l", label="F2L (first two layers)", moves=[],
                    highlight="corner", goal="Pair and insert the first two layers (F2L).",
                    focus="the first two layers",
                )
                out.append(f2l_stage)
            continue
        if s.name in _CFOP_LABELS:
            label, goal = _CFOP_LABELS[s.name]
            out.append(SolveStage(name=s.name, label=label, moves=s.moves,
                                  highlight=s.highlight, goal=goal, focus=s.focus))
        else:
            out.append(s)
    if f2l_stage is not None:
        f2l_stage.moves = f2l_moves
    return out


def _solve_frames(state: State, method: str = "lbl") -> List[VisualFrame]:
    stages = solve(state)
    if method == "cfop":
        stages = _reframe_cfop(stages)
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
    # Track the cube state as each stage's moves are performed, so a solve lesson
    # can grade each stage against the exact state the learner should reach.
    cursor = clone_state(state)
    for stage in stages:
        if not stage.moves:
            continue  # this phase is already done for this scramble
        apply_moves(cursor, stage.moves)
        frames.append(
            VisualFrame(
                id=stage.name,
                stage=stage.name,
                moves=stage.moves,
                highlight=stage.highlight,
                focus=stage.focus or f"{stage.highlight} pieces",
                expected=stage.goal,
                expected_state=clone_state(cursor),
                dwell_ms=STAGE_DWELL_MS,
                pace="step",  # solving moves play one-by-one so a human can follow
            )
        )
    return frames


def build_solve_walkthrough(state: State, method: str = "lbl") -> VisualPlan:
    # The walkthrough player resets to solved before playing, so the intro frame
    # first re-creates the user's scramble (inverse of the whole solution); the
    # later frames then solve it. This keeps the walkthrough self-contained.
    frames = _solve_frames(state, method)
    solution = [m for fr in frames for m in fr.moves]
    frames[0] = frames[0].model_copy(
        update={
            "moves": invert(solution),
            "expected": "Start from your scramble; we'll solve it one layer at a time.",
            "pace": "fast",  # the scramble preview shouldn't be studied move-by-move
        }
    )
    title = "Watch the full CFOP-style solve" if method == "cfop" else "Watch the full solve"
    return VisualPlan(
        kind="walkthrough",
        id=_short_id("wt-solve"),
        title=title,
        description="A staged walkthrough that solves your scrambled cube.",
        frames=frames,
    )


def build_solve_lesson(state: State, method: str = "lbl") -> VisualPlan:
    # Lesson steps reuse the solve stages; the learner follows each phase and
    # marks it complete (manual), with the stage moves available as the answer.
    title = (
        "Solve your cube the CFOP way" if method == "cfop"
        else "Solve your cube, step by step"
    )
    return VisualPlan(
        kind="lesson",
        id=_short_id("lesson-solve"),
        title=title,
        description="Follow the staged method to solve your current cube.",
        track="beginner",
        audience="learners with a scrambled cube",
        frames=_solve_frames(state, method),
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
            dwell_ms=STAGE_DWELL_MS, pace="step",
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

def plan(
    kind: str,
    state: Optional[State] = None,
    topic: Optional[str] = None,
    method: str = "lbl",
) -> VisualPlan:
    """Build a plan. `kind` is 'walkthrough' or 'lesson'. Provide `topic` for a
    catalog plan, or `state` for a solve-derived plan. `method` ('lbl'|'cfop')
    frames a solve-derived plan in beginner or CFOP vocabulary."""
    if kind not in ("walkthrough", "lesson"):
        raise ValueError(f"unknown kind: {kind!r}")
    if topic:
        return build_topic_walkthrough(topic) if kind == "walkthrough" else build_topic_lesson(topic)
    if state is not None:
        return (
            build_solve_walkthrough(state, method)
            if kind == "walkthrough"
            else build_solve_lesson(state, method)
        )
    raise ValueError("plan requires either a topic or a cube state")

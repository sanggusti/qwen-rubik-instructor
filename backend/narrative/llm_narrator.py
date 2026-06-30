"""Generate per-frame narration with Qwen (DashScope, OpenAI-compatible).

The model only writes wording. Each frame's narration is validated against the
skeleton (narrative.validator); on failure we re-prompt once, then fall back to
a deterministic template so a frame never blocks the stream.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Iterator, Optional, Tuple

from openai import OpenAI

from config import settings
from narrative.schema import FrameNarration, VisualFrame, VisualPlan
from narrative.validator import parse_narration, validate_narration
from pipeline.cube.facelet import is_solved

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "output_contracts.txt"

# Latency/token telemetry for the Qwen calls. Configured to actually print by
# main.py's logging.basicConfig; see config.qwen_model for the model in use.
log = logging.getLogger("narration")

TONES = ["warm and encouraging", "calm and precise", "playful and energetic"]

# Per-learner-level narration style + length budget. Keeps text short and tuned.
LEVEL_STYLE = {
    "newbie": {"style": "warm and plain, no jargon", "budget": "at most 16 words"},
    "intermediate": {"style": "concise; cube notation and terms are fine", "budget": "at most 14 words"},
    "advanced": {"style": "terse, just the cue", "budget": "at most 10 words"},
}

_JSON_INSTRUCTION = (
    "Return a single JSON object with keys: "
    '"text" (string, ONE short sentence of narration), '
    'optional "title" (string, a short frame title), '
    'optional "hints" (array of 1-2 short strings). '
    "Do not include any move notation that is not in the frame's move list. "
    "Return JSON only, no markdown."
)


def load_system_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8").strip() + "\n\n" + _JSON_INSTRUCTION


def pick_tone(plan_id: str) -> str:
    return TONES[sum(ord(c) for c in plan_id) % len(TONES)]


def build_user_message(
    plan: VisualPlan, frame: VisualFrame, tone: str, level: str, continuity: str = ""
) -> str:
    moves = " ".join(frame.moves) if frame.moves else "(no moves this frame)"
    style = LEVEL_STYLE.get(level, LEVEL_STYLE["newbie"])
    lines = [
        f"Session: {plan.title} — {plan.description}",
        f"This is a {plan.kind} for a {level} solver. Tone: {tone}, {style['style']}.",
        f"Frame stage: {frame.stage}",
        f"Visual focus: {frame.focus}",
        f"Highlighted piece type: {frame.highlight or 'none'}",
        f"Moves animating this frame: {moves}",
        f"Deterministic goal of this frame: {frame.expected}",
        f"Write ONE short sentence ({style['budget']}) matching this focus and these moves.",
    ]
    if continuity:
        lines.append(continuity)
    if plan.kind == "lesson":
        lines.append("Also add a short 'title' and 1-2 brief 'hints'.")
    return "\n".join(lines)


def fallback_narration(plan: VisualPlan, frame: VisualFrame) -> FrameNarration:
    """Deterministic, always-valid narration if the model output can't be used.
    Short, and never dumps the move list into the text (the player shows moves)."""
    text = frame.expected  # already a single concise sentence
    title = frame.stage.replace("-", " ").replace("_", " ").title()
    hints = ["Take it one move at a time."] if plan.kind == "lesson" else []
    return FrameNarration(text=text, title=title, hints=hints)


def get_client() -> OpenAI:
    return OpenAI(
        api_key=settings.dashscope_api_key,
        base_url=settings.dashscope_base_url,
        timeout=settings.qwen_timeout_s,
    )


def _complete(client: OpenAI, model: str, messages: list[dict]) -> str:
    t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.7,
    )
    latency = time.perf_counter() - t0
    # DashScope's OpenAI-compatible endpoint returns usage; guard in case it's absent.
    usage = getattr(resp, "usage", None)
    log.info(
        "qwen_call model=%s latency=%.2fs prompt_tokens=%s completion_tokens=%s total_tokens=%s",
        model,
        latency,
        getattr(usage, "prompt_tokens", None),
        getattr(usage, "completion_tokens", None),
        getattr(usage, "total_tokens", None),
    )
    return resp.choices[0].message.content or ""


def narrate_frame(
    plan: VisualPlan,
    frame: VisualFrame,
    *,
    client: OpenAI,
    model: str,
    tone: str,
    level: str = "newbie",
    continuity: str = "",
) -> Tuple[FrameNarration, bool]:
    """Narrate one frame. Returns (narration, used_fallback)."""
    messages = [
        {"role": "system", "content": load_system_prompt()},
        {"role": "user", "content": build_user_message(plan, frame, tone, level, continuity)},
    ]
    # One attempt only: a re-prompt doubles the per-frame latency, and frames are
    # narrated concurrently, so a bad frame falls back to its deterministic text
    # rather than holding up the whole lesson.
    try:
        content = _complete(client, model, messages)
        ok, _reason, narration = validate_narration(frame, content)
        if ok and narration is not None:
            return narration, False
    except Exception:
        pass
    return fallback_narration(plan, frame), True


# The memory we inject into a prompt competes with the actual frame for the
# context window, so it's hard-capped. Stage-specific notes are placed before the
# general welcome so they survive the truncation.
MEMORY_CHAR_BUDGET = 240


def _within_budget(text: str, budget: int = MEMORY_CHAR_BUDGET) -> str:
    """Truncate a memory block to the budget on a word boundary, never mid-word."""
    text = text.strip()
    if len(text) <= budget:
        return text
    cut = text[:budget].rsplit(" ", 1)[0]
    return (cut or text[:budget]).rstrip() + "…"


def welcome_line(memory: Optional[dict]) -> str:
    """A first-frame welcome-back nod grounded in the learner's memory digest."""
    if not memory:
        return ""
    sessions = memory.get("sessions") or 0
    if not sessions:
        return ""
    parts = [f"This returning learner has done {sessions} recent session(s)."]
    struggles = memory.get("struggles") or []
    if struggles:
        labels = ", ".join((s.get("label") or s.get("stage")) for s in struggles[:2])
        parts.append(f"They've struggled most with: {labels}.")
    mastered = memory.get("mastered") or []
    if mastered:
        parts.append(f"They've already got: {', '.join(mastered[:3])}.")
    due = memory.get("dueForReview") or []
    if due:
        parts.append(f"It's been a while since they practised: {', '.join(due[:2])}.")
    parts.append("A brief, specific welcome-back nod is welcome on this first frame only.")
    return _within_budget(" ".join(parts))


def stage_struggle_note(memory: Optional[dict], stage: str) -> str:
    """If the learner has struggled with this exact stage, nudge a gentler tone."""
    for s in (memory or {}).get("struggles") or []:
        if s.get("stage") == stage:
            return (
                f"The learner has struggled with this stage before "
                f"({s.get('mistakes')} past mistakes); be especially clear and reassuring."
            )
    return ""


# Q&A is grounded by the live cube state and the moves in play, but (unlike
# frame narration) the answer isn't restricted to the frame's move list — a real
# question often needs context the strict allow-list would reject. Keep it short
# and honest; don't invent a cube state beyond what's provided.
_ASK_SYSTEM = (
    "You are a patient Rubik's cube tutor answering a learner's question while they "
    "work on a live cube. Answer their actual question directly in ONE or TWO short, "
    "plain sentences, grounded in the cube state and moves provided. Don't claim a "
    "cube state you weren't told. " + _JSON_INSTRUCTION
)


def _state_line(state: Optional[dict]) -> Optional[str]:
    if not state:
        return None
    try:
        solved = is_solved(state)
    except Exception:
        return None
    return "The cube is currently solved." if solved else "The cube is not solved yet."


def build_ask_message(
    question: str,
    *,
    stage: str,
    moves: list[str],
    level: str,
    memory: Optional[dict],
    state: Optional[dict] = None,
) -> str:
    move_str = " ".join(moves) if moves else "(no specific moves in play)"
    lines = [
        f"The learner is a {level} solver working on stage: {stage or 'a solve'}.",
        f"Moves in play right now: {move_str}.",
    ]
    state_line = _state_line(state)
    if state_line:
        lines.append(state_line)
    welcome = welcome_line(memory)
    if welcome:
        lines.append(welcome)
    lines.append(f"Their question: {question}")
    lines.append("Answer their question helpfully and briefly.")
    return "\n".join(lines)


def answer_question(
    question: str,
    *,
    stage: str = "",
    moves: Optional[list[str]] = None,
    level: str = "newbie",
    memory: Optional[dict] = None,
    state: Optional[dict] = None,
    client: Optional[OpenAI] = None,
    model: Optional[str] = None,
) -> Tuple[str, bool]:
    """Answer a free-form learner question, grounded in the live cube state and
    the moves in play. Returns (text, used_fallback).

    A single LLM call (no re-prompt) for low latency. The answer is parsed for
    shape only — unlike frame narration it is NOT restricted to a move allow-list,
    since a genuine question often needs to reference context outside it.
    """
    client = client or get_client()
    model = model or settings.qwen_model
    moves = moves or []
    messages = [
        {"role": "system", "content": _ASK_SYSTEM},
        {"role": "user", "content": build_ask_message(
            question, stage=stage, moves=moves, level=level, memory=memory, state=state)},
    ]
    t0 = time.perf_counter()
    try:
        content = _complete(client, model, messages)
        text = parse_narration(content).text.strip()
        if text:
            log.info("ask model=%s wall=%.2fs fallback=False", model, time.perf_counter() - t0)
            return text, False
    except Exception:
        pass
    log.info("ask model=%s wall=%.2fs fallback=True", model, time.perf_counter() - t0)
    return ("Take it one move at a time, and use Show next move if you get stuck.", True)


def narrate_plan(
    plan: VisualPlan,
    *,
    client: Optional[OpenAI] = None,
    model: Optional[str] = None,
    level: str = "newbie",
    memory: Optional[dict] = None,
) -> Iterator[Tuple[VisualFrame, FrameNarration, bool]]:
    """Yield (frame, narration, used_fallback) for each frame, in order.

    Frames are independent LLM calls, so they're narrated concurrently across a
    small thread pool (the OpenAI client is thread-safe); results are yielded in
    the original frame order so the SSE stream and progress UI stay unchanged.
    """
    client = client or get_client()
    model = model or settings.qwen_model
    tone = pick_tone(plan.id)
    welcome = welcome_line(memory)

    def continuity_for(i: int, frame: VisualFrame) -> str:
        # Stage-specific note first: it's the most relevant memory for this frame,
        # so it survives the budget if the general welcome has to be trimmed.
        extra = []
        note = stage_struggle_note(memory, frame.stage)
        if note:
            extra.append(note)
        if i == 0 and welcome:
            extra.append(welcome)
        return _within_budget(" ".join(extra))

    latencies: list[Tuple[float, bool]] = []  # (per-frame seconds, used_fallback)

    def run(i: int, frame: VisualFrame) -> Tuple[FrameNarration, bool]:
        t0 = time.perf_counter()
        result = narrate_frame(
            plan, frame, client=client, model=model, tone=tone, level=level,
            continuity=continuity_for(i, frame),
        )
        latencies.append((time.perf_counter() - t0, result[1]))
        return result

    workers = max(1, min(settings.narration_workers, len(plan.frames)))
    plan_t0 = time.perf_counter()
    # Submit every frame up front, then yield in frame order as each future
    # resolves. Frames still narrate concurrently, but the first beat/step now
    # streams out as soon as it's ready instead of waiting for the whole plan.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run, i, frame) for i, frame in enumerate(plan.frames)]
        for frame, future in zip(plan.frames, futures):
            narration, used_fallback = future.result()
            yield frame, narration, used_fallback
    if latencies:
        frame_seconds = [d for d, _ in latencies]
        fallbacks = sum(1 for _, f in latencies if f)
        log.info(
            "narrate_plan model=%s kind=%s frames=%d wall=%.2fs slowest_frame=%.2fs fallbacks=%d/%d",
            model, plan.kind, len(plan.frames), time.perf_counter() - plan_t0,
            max(frame_seconds), fallbacks, len(plan.frames),
        )

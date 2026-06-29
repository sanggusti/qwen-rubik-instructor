"""Generate per-frame narration with Qwen (DashScope, OpenAI-compatible).

The model only writes wording. Each frame's narration is validated against the
skeleton (narrative.validator); on failure we re-prompt once, then fall back to
a deterministic template so a frame never blocks the stream.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterator, Optional, Tuple

from openai import OpenAI

from config import settings
from narrative.schema import FrameNarration, VisualFrame, VisualPlan
from narrative.validator import validate_narration

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "output_contracts.txt"

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
    return OpenAI(api_key=settings.dashscope_api_key, base_url=settings.dashscope_base_url)


def _complete(client: OpenAI, model: str, messages: list[dict]) -> str:
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.7,
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
    for attempt in range(2):
        try:
            content = _complete(client, model, messages)
        except Exception:
            break
        ok, reason, narration = validate_narration(frame, content)
        if ok and narration is not None:
            return narration, False
        # Re-prompt once with the specific problem.
        messages.append({"role": "assistant", "content": content})
        messages.append(
            {"role": "user", "content": f"That was invalid ({reason}). Fix it and {_JSON_INSTRUCTION}"}
        )
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


_ASK_SYSTEM = (
    "You are a patient Rubik's cube tutor answering a learner's question while they "
    "work on a live cube. Answer in ONE or TWO short, plain sentences. Only mention "
    "cube moves that appear in the provided move list; never invent moves or claim a "
    "state you weren't told. " + _JSON_INSTRUCTION
)


def build_ask_message(question: str, *, stage: str, moves: list[str], level: str, memory: Optional[dict]) -> str:
    move_str = " ".join(moves) if moves else "(no specific moves in play)"
    lines = [
        f"The learner is a {level} solver working on stage: {stage or 'a solve'}.",
        f"Moves in play right now: {move_str}.",
    ]
    welcome = welcome_line(memory)
    if welcome:
        lines.append(welcome)
    lines.append(f"Their question: {question}")
    lines.append("Answer briefly, only referencing the moves listed above.")
    return "\n".join(lines)


def answer_question(
    question: str,
    *,
    stage: str = "",
    moves: Optional[list[str]] = None,
    level: str = "newbie",
    memory: Optional[dict] = None,
    client: Optional[OpenAI] = None,
    model: Optional[str] = None,
) -> Tuple[str, bool]:
    """Answer a free-form learner question, grounded in the moves in play.

    Returns (text, used_fallback). Reuses validate_narration so the answer can't
    mention moves outside the provided list; re-prompts once, then falls back.
    """
    client = client or get_client()
    model = model or settings.qwen_model
    moves = moves or []
    # Synthetic frame: validation only needs `moves` (the allow-list) and `stage`.
    frame = VisualFrame(id="ask", stage=stage or "ask", moves=moves, focus="", expected="")
    messages = [
        {"role": "system", "content": _ASK_SYSTEM},
        {"role": "user", "content": build_ask_message(
            question, stage=stage, moves=moves, level=level, memory=memory)},
    ]
    for _ in range(2):
        try:
            content = _complete(client, model, messages)
        except Exception:
            break
        ok, reason, narration = validate_narration(frame, content)
        if ok and narration is not None:
            return narration.text, False
        messages.append({"role": "assistant", "content": content})
        messages.append(
            {"role": "user", "content": f"That was invalid ({reason}). Fix it and {_JSON_INSTRUCTION}"}
        )
    return ("Take it one move at a time, and use Show next move if you get stuck.", True)


def narrate_plan(
    plan: VisualPlan,
    *,
    client: Optional[OpenAI] = None,
    model: Optional[str] = None,
    level: str = "newbie",
    memory: Optional[dict] = None,
) -> Iterator[Tuple[VisualFrame, FrameNarration, bool]]:
    """Yield (frame, narration, used_fallback) for each frame, in order."""
    client = client or get_client()
    model = model or settings.qwen_model
    tone = pick_tone(plan.id)
    welcome = welcome_line(memory)
    for i, frame in enumerate(plan.frames):
        # Stage-specific note first: it's the most relevant memory for this frame,
        # so it survives the budget if the general welcome has to be trimmed.
        extra = []
        note = stage_struggle_note(memory, frame.stage)
        if note:
            extra.append(note)
        if i == 0 and welcome:
            extra.append(welcome)
        narration, used_fallback = narrate_frame(
            plan, frame, client=client, model=model, tone=tone, level=level,
            continuity=_within_budget(" ".join(extra)),
        )
        yield frame, narration, used_fallback

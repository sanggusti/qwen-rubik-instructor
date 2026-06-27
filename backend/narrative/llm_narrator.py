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


def narrate_plan(
    plan: VisualPlan,
    *,
    client: Optional[OpenAI] = None,
    model: Optional[str] = None,
    level: str = "newbie",
    history_count: int = 0,
) -> Iterator[Tuple[VisualFrame, FrameNarration, bool]]:
    """Yield (frame, narration, used_fallback) for each frame, in order."""
    client = client or get_client()
    model = model or settings.qwen_model
    tone = pick_tone(plan.id)
    continuity = (
        f"This returning learner has done {history_count} recent session(s); a brief "
        "welcome-back nod is welcome on this first frame only."
        if history_count > 0
        else ""
    )
    for i, frame in enumerate(plan.frames):
        narration, used_fallback = narrate_frame(
            plan, frame, client=client, model=model, tone=tone, level=level,
            continuity=continuity if i == 0 else "",
        )
        yield frame, narration, used_fallback

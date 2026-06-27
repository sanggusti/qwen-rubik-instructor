"""FastAPI app for the Qwen Rubik showrunner backend.

Pipeline per request: validate input -> deterministic plan (solver/planner) ->
per-frame LLM narration -> validate & merge -> stream each beat/step to the
frontend over Server-Sent Events.
"""

from __future__ import annotations

import json
from typing import Dict, Iterator, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import settings
from narrative import planner
from narrative.llm_narrator import narrate_plan
from narrative.merge import beat_from, step_from
from narrative.schema import VisualPlan
from pipeline.cube.facelet import State, is_well_formed

app = FastAPI(title="Qwen Rubik Instructor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NarrateRequest(BaseModel):
    # Provide a topic for a catalog plan, or a cube state for a full-solve plan.
    topic: Optional[str] = None
    state: Optional[Dict[str, List[str]]] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/topics")
def topics() -> dict:
    lesson_topics = [t for t in planner.topic_ids() if t != "anatomy"]
    return {"walkthrough": planner.topic_ids(), "lesson": lesson_topics}


def _build_plan(kind: str, req: NarrateRequest) -> VisualPlan:
    if req.topic:
        try:
            return planner.plan(kind, topic=req.topic)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if req.state is not None:
        if not is_well_formed(req.state):
            raise HTTPException(status_code=400, detail="malformed cube state")
        try:
            return planner.plan(kind, state=req.state)
        except Exception as exc:  # solver rejects an unsolvable state
            raise HTTPException(status_code=422, detail=f"could not plan a solve: {exc}")
    raise HTTPException(status_code=400, detail="provide either 'topic' or 'state'")


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _stream(plan: VisualPlan) -> Iterator[str]:
    yield _sse({
        "type": "meta",
        "kind": plan.kind,
        "id": plan.id,
        "title": plan.title,
        "description": plan.description,
        "track": plan.track,
        "audience": plan.audience,
        "frameCount": len(plan.frames),
    })
    for index, (frame, narration, used_fallback) in enumerate(narrate_plan(plan)):
        if plan.kind == "walkthrough":
            item = beat_from(frame, narration)
            payload = {"type": "beat", "index": index, "fallback": used_fallback,
                       "beat": item.model_dump(by_alias=True, exclude_none=True)}
        else:
            item = step_from(frame, narration)
            payload = {"type": "step", "index": index, "fallback": used_fallback,
                       "step": item.model_dump(by_alias=True, exclude_none=True)}
        yield _sse(payload)
    yield _sse({"type": "done"})


def _stream_response(plan: VisualPlan) -> StreamingResponse:
    return StreamingResponse(
        _stream(plan),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/narrate/walkthrough")
def narrate_walkthrough(req: NarrateRequest) -> StreamingResponse:
    return _stream_response(_build_plan("walkthrough", req))


@app.post("/narrate/lesson")
def narrate_lesson(req: NarrateRequest) -> StreamingResponse:
    return _stream_response(_build_plan("lesson", req))

"""FastAPI app for the Qwen Rubik showrunner backend.

Pipeline per request: validate input -> deterministic plan (solver/planner) ->
per-frame LLM narration -> validate & merge -> stream each beat/step to the
frontend over Server-Sent Events.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Dict, Iterator, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import routes as auth_routes
from challenge import routes as challenge_routes
from scan import routes as scan_routes
from config import settings
from db import database, routes as db_routes, service
from narrative import planner
from narrative.llm_narrator import answer_question, narrate_plan
from narrative.merge import beat_from, step_from
from narrative.schema import VisualPlan
from pipeline.cube.facelet import State, is_well_formed
from pipeline.cube.legality import LEGALITY_DETAILS, check_legality
from pipeline.solver import solve

# Surface the "narration" telemetry logger (per-call latency/tokens, per-plan
# aggregate) on stdout; uvicorn leaves the root logger unconfigured at INFO.
logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not database.init():
        raise RuntimeError("database init failed; check TURSO_DATABASE_URL and logs")
    yield


app = FastAPI(title="Qwen Rubik Instructor", lifespan=lifespan)
app.include_router(db_routes.router)
app.include_router(auth_routes.router)
app.include_router(challenge_routes.router)
app.include_router(scan_routes.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StruggleStage(BaseModel):
    stage: str
    label: Optional[str] = None
    mistakes: int = 0


class MemoryDigest(BaseModel):
    # A compact, client-built summary of how the learner is doing, so Qwen can
    # remember and adapt (see narrative.llm_narrator). Built by the frontend's
    # profile.buildMemoryDigest.
    level: Optional[str] = None
    method: Optional[str] = None
    sessions: int = 0
    lastKind: Optional[str] = None
    struggles: List[StruggleStage] = []
    mastered: List[str] = []
    # Mastered skills gone stale (the forgetting curve), surfaced for review.
    dueForReview: List[str] = []


class NarrateRequest(BaseModel):
    # Provide a topic for a catalog plan, or a cube state for a full-solve plan.
    topic: Optional[str] = None
    state: Optional[Dict[str, List[str]]] = None
    # Learner persona + session memory (client-side, sent each request).
    level: Optional[Literal["newbie", "intermediate", "advanced"]] = None
    method: Optional[Literal["lbl", "cfop"]] = None
    memory: Optional[MemoryDigest] = None
    # Anonymous learner id (the client profile's sessionId); lets the backend
    # fall back to persisted memory when no client digest is sent.
    userId: Optional[str] = None


def _resolve_method(req: "NarrateRequest") -> str:
    if req.method:
        return req.method
    # Newbies learn layer-by-layer; intermediate/advanced get CFOP framing.
    return "lbl" if req.level in (None, "newbie") else "cfop"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/topics")
def topics() -> dict:
    lesson_topics = [t for t in planner.topic_ids() if t != "anatomy"]
    return {"walkthrough": planner.topic_ids(), "lesson": lesson_topics}


def _require_legal_state(state: State) -> None:
    """400 with a face-specific reason instead of an opaque solver 422."""
    if not is_well_formed(state):
        raise HTTPException(status_code=400, detail="malformed cube state")
    ok, code, suspects = check_legality(state)
    if not ok:
        faces = sorted({s["face"] for s in suspects})
        where = f" (check the {', '.join(faces)} side{'s' if len(faces) > 1 else ''})" if faces else ""
        raise HTTPException(
            status_code=400,
            detail=f"impossible cube state: {LEGALITY_DETAILS[code]}{where}",
        )


def _build_plan(kind: str, req: NarrateRequest) -> VisualPlan:
    method = _resolve_method(req)
    if req.topic:
        try:
            return planner.plan(kind, topic=req.topic, method=method)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if req.state is not None:
        _require_legal_state(req.state)
        try:
            return planner.plan(kind, state=req.state, method=method)
        except Exception as exc:  # solver rejects an unsolvable state
            raise HTTPException(status_code=422, detail=f"could not plan a solve: {exc}")
    raise HTTPException(status_code=400, detail="provide either 'topic' or 'state'")


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _stream(plan: VisualPlan, level: str, memory: Optional[dict]) -> Iterator[str]:
    yield _sse({
        "type": "meta",
        "kind": plan.kind,
        "id": plan.id,
        "title": plan.title,
        "description": plan.description,
        "track": plan.track,
        "audience": plan.audience,
        "frameCount": len(plan.frames),
        "startFromCurrent": plan.start_from_current,
    })
    for index, (frame, narration, used_fallback) in enumerate(
        narrate_plan(plan, level=level, memory=memory)
    ):
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


def _memory_dict(req) -> Optional[dict]:
    # Precedence: a client-sent digest always wins (the client is authoritative
    # and freshest); persisted memory is the fallback when only a userId comes.
    if req.memory is not None:
        return req.memory.model_dump()
    return service.load_digest(req.userId) if req.userId else None


def _stream_response(plan: VisualPlan, req: NarrateRequest) -> StreamingResponse:
    level = req.level or "newbie"
    memory = _memory_dict(req)
    return StreamingResponse(
        _stream(plan, level, memory),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/narrate/walkthrough")
def narrate_walkthrough(req: NarrateRequest) -> StreamingResponse:
    return _stream_response(_build_plan("walkthrough", req), req)


@app.post("/narrate/lesson")
def narrate_lesson(req: NarrateRequest) -> StreamingResponse:
    return _stream_response(_build_plan("lesson", req), req)


class AskRequest(BaseModel):
    # A free-form question the learner asks mid-lesson. `moves` are the moves in
    # play on the current step and `state` is the live cube, both used to ground
    # the answer in what the learner is actually looking at.
    question: str
    stage: Optional[str] = None
    moves: Optional[List[str]] = None
    state: Optional[Dict[str, List[str]]] = None
    level: Optional[Literal["newbie", "intermediate", "advanced"]] = None
    memory: Optional[MemoryDigest] = None
    userId: Optional[str] = None


class SolveRequest(BaseModel):
    # The live cube to solve. Used by the lesson "Get unstuck" rescue, which
    # animates the path back to a solved cube from wherever the learner is.
    state: Dict[str, List[str]]


@app.post("/solve")
def solve_cube(req: SolveRequest) -> dict:
    _require_legal_state(req.state)
    try:
        stages = solve(req.state)
    except Exception as exc:  # solver rejects an unsolvable state
        raise HTTPException(status_code=422, detail=f"could not solve: {exc}")
    return {"moves": [m for stage in stages for m in stage.moves]}


@app.post("/ask")
def ask(req: AskRequest) -> dict:
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    text, used_fallback = answer_question(
        question,
        stage=req.stage or "",
        moves=req.moves or [],
        level=req.level or "newbie",
        memory=_memory_dict(req),
        state=req.state,
    )
    return {"text": text, "fallback": used_fallback}

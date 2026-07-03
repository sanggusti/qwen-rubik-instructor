"""Additive persistence endpoints. Wire shape follows the raw-camelCase style
of MemoryDigest in main.py. Sync/attempt writes report persisted=false with a
200 when the DB is off, so fire-and-forget clients never see an error on the
offline path."""

from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import database, service

router = APIRouter()


class HistoryEntry(BaseModel):
    kind: str
    method: str
    stages: int = 0
    at: str = ""


class StageStat(BaseModel):
    stage: str
    label: Optional[str] = None
    attempts: int = 0
    mistakes: int = 0
    bestMs: Optional[int] = None
    lastAt: str = ""
    mastered: bool = False


class SyncRequest(BaseModel):
    userId: str
    handle: Optional[str] = None
    level: Optional[str] = None
    method: Optional[str] = None
    history: List[HistoryEntry] = []
    performance: Dict[str, StageStat] = {}


class AttemptRequest(BaseModel):
    userId: str
    drillId: str
    durationMs: int
    mistakes: int = 0
    handle: Optional[str] = None


@router.post("/memory/sync")
def memory_sync(req: SyncRequest) -> dict:
    persisted = service.sync_profile(
        req.userId,
        level=req.level,
        method=req.method,
        handle=req.handle,
        history=[h.model_dump() for h in req.history],
        performance={k: v.model_dump() for k, v in req.performance.items()},
    )
    return {"ok": True, "persisted": persisted}


@router.get("/memory/{user_id}")
def memory_get(user_id: str) -> dict:
    memory = service.get_memory(user_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="unknown user or persistence disabled")
    return memory


@router.post("/attempts")
def attempts(req: AttemptRequest) -> dict:
    if req.durationMs <= 0:
        raise HTTPException(status_code=400, detail="durationMs must be positive")
    best = service.record_attempt(
        req.userId, req.drillId, req.durationMs, mistakes=req.mistakes, handle=req.handle
    )
    return {"ok": True, "persisted": database.enabled(), "bestMs": best}


@router.get("/leaderboard")
def leaderboard(drillId: str, limit: int = 10) -> dict:
    return {
        "drillId": drillId,
        "persisted": database.enabled(),
        "entries": service.leaderboard(drillId, limit=min(max(limit, 1), 50)),
    }

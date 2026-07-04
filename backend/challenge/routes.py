"""Challenge-mode endpoints: server-timed session start, authenticated score
submission, public leaderboard.

Anti-cheat flow:
  POST /challenge/start  — authenticated; records started_at server-side;
                           returns an opaque session key.
  POST /challenge/score  — authenticated; redeems the key; backend computes
                           solve_time_ms = now - started_at.
The client never sends a solve time it could forge.

Statuses:
  'solved'  — cube solved; full celebration + leaderboard.
  'give_up' — player quit early; time at give-up recorded; appears in
              leaderboard when leaderboard_show_give_up is enabled (default: on).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from auth import session
from challenge import service
from config import settings
from db import database

router = APIRouter(prefix="/challenge")


class StartRequest(BaseModel):
    scrambleLength: int = 20


@router.post("/start")
def challenge_start(
    req: StartRequest = StartRequest(),
    member: dict = Depends(session.require_member),
) -> dict:
    """Issue a server-timed session key. Call this when the timer starts."""
    if not member["username"]:
        raise HTTPException(status_code=400, detail="set a username first")
    try:
        result = service.create_session(member["id"], req.scrambleLength)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {**result, "username": member["username"]}


class ScoreRequest(BaseModel):
    key: str
    status: Literal["solved", "give_up"] = "solved"

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("solved", "give_up"):
            raise ValueError("status must be 'solved' or 'give_up'")
        return v


@router.post("/score")
def challenge_score(
    req: ScoreRequest, member: dict = Depends(session.require_member)
) -> dict:
    """Redeem the session key and record the result. Returns bestMs + solveTimeMs."""
    if not member["username"]:
        raise HTTPException(status_code=400, detail="set a username first")
    try:
        solve_time_ms, scramble_length = service.complete_session(req.key, member["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    best = service.record_score(
        member["id"], member["username"], solve_time_ms, scramble_length, req.status
    )
    return {"ok": True, "bestMs": best, "solveTimeMs": solve_time_ms, "status": req.status}


@router.get("/leaderboard")
def challenge_leaderboard(
    limit: int = 10,
    include_give_up: bool = Query(default=None, description="Override server default for showing give-up entries"),
) -> dict:
    if not database.enabled():
        raise HTTPException(status_code=503, detail="persistence disabled")
    # Caller can override; fall back to server config default.
    show_give_up = settings.leaderboard_show_give_up if include_give_up is None else include_give_up
    return {"entries": service.leaderboard(limit=min(max(limit, 1), 50), include_give_up=show_give_up)}

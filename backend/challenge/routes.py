"""Challenge-mode endpoints: authenticated score submission, public leaderboard.
Wire shape follows the raw-camelCase style of db/routes.py."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import session
from challenge import service
from db import database

router = APIRouter(prefix="/challenge")


class ScoreRequest(BaseModel):
    solveTimeMs: int
    scrambleLength: int = 20


@router.post("/score")
def challenge_score(
    req: ScoreRequest, member: dict = Depends(session.require_member)
) -> dict:
    if req.solveTimeMs <= 0:
        raise HTTPException(status_code=400, detail="solveTimeMs must be positive")
    if not member["username"]:
        raise HTTPException(status_code=400, detail="set a username first")
    best = service.record_score(
        member["id"], member["username"], req.solveTimeMs, req.scrambleLength
    )
    return {"ok": True, "bestMs": best}


@router.get("/leaderboard")
def challenge_leaderboard(limit: int = 10) -> dict:
    if not database.enabled():
        raise HTTPException(status_code=503, detail="persistence disabled")
    return {"entries": service.leaderboard(limit=min(max(limit, 1), 50))}

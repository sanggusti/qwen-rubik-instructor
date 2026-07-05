"""Google OAuth routes for challenge-mode members.

Flow: GET /auth/google redirects to Google's consent screen; Google calls back
GET /auth/callback, which upserts the member (keyed on the `sub` claim) and
redirects to the frontend with a fresh bearer token in the query string. The
frontend stores it and talks Bearer from then on.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from auth import google, session
from config import settings
from db import database

logger = logging.getLogger("auth")

router = APIRouter(prefix="/auth")

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{2,24}$")


def _require_configured() -> None:
    if not database.enabled():
        raise HTTPException(status_code=503, detail="persistence disabled")
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="google oauth not configured")


@router.get("/google")
def auth_google() -> RedirectResponse:
    _require_configured()
    return RedirectResponse(google.build_auth_url())


@router.get("/callback")
def auth_callback(code: Optional[str] = None, error: Optional[str] = None) -> RedirectResponse:
    _require_configured()
    play_url = f"{settings.frontend_url}/play"
    if error or not code:
        # User denied consent (or Google errored): land back on /play unauthenticated.
        return RedirectResponse(f"{play_url}?authError=1")
    try:
        access_token = google.exchange_code(code)
        info = google.get_userinfo(access_token)
    except Exception:
        logger.exception("google oauth exchange failed")
        return RedirectResponse(f"{play_url}?authError=1")
    member_id, email = info["sub"], info.get("email", "")
    database.execute(
        """
        INSERT INTO members (id, email) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        """,
        (member_id, email),
    )
    token = session.create_token(member_id)
    return RedirectResponse(f"{play_url}?token={token}")


@router.get("/me")
def auth_me(member: dict = Depends(session.require_member)) -> dict:
    return {
        "id": member["id"],
        "email": member["email"],
        "username": member["username"],
        "hasUsername": bool(member["username"]),
    }


class UsernameRequest(BaseModel):
    username: str


@router.post("/username")
def auth_username(
    req: UsernameRequest, member: dict = Depends(session.require_member)
) -> dict:
    username = req.username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(
            status_code=400, detail="username must be 2-24 chars: letters, digits, _"
        )
    taken = database.query(
        "SELECT 1 FROM members WHERE username = ? COLLATE NOCASE AND id != ?",
        (username, member["id"]),
    )
    if taken:
        raise HTTPException(status_code=409, detail="username already taken")
    database.execute(
        "UPDATE members SET username = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        (username, member["id"]),
    )
    return {"ok": True, "username": username}


@router.post("/logout")
def auth_logout(authorization: Optional[str] = Header(None)) -> dict:
    # Best-effort: deleting an unknown/expired token is still a successful logout.
    if authorization and authorization.startswith("Bearer "):
        session.delete_token(authorization[len("Bearer "):].strip())
    return {"ok": True}

"""Bearer-token sessions for Google-authenticated members.

Tokens are opaque UUIDs stored in auth_tokens with a 30-day expiry; expiry is
compared in SQL so the format always matches the strftime defaults used by the
migrations.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Header, HTTPException

from db import database

TOKEN_TTL_DAYS = 30


def create_token(member_id: str) -> str:
    token = str(uuid.uuid4())
    expires = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    database.execute(
        "INSERT INTO auth_tokens (token, member_id, expires_at) VALUES (?, ?, ?)",
        (token, member_id, expires.strftime("%Y-%m-%dT%H:%M:%S.") + f"{expires.microsecond // 1000:03d}Z"),
    )
    return token


def delete_token(token: str) -> None:
    if not database.enabled():
        return
    database.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))


def _bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    return authorization[len("Bearer "):].strip()


def require_member(authorization: Optional[str] = Header(None)) -> dict:
    """FastAPI dependency: resolve the Authorization header to a member row."""
    if not database.enabled():
        raise HTTPException(status_code=503, detail="persistence disabled")
    token = _bearer(authorization)
    rows = database.query(
        """
        SELECT m.id, m.email, m.username
        FROM auth_tokens t JOIN members m ON m.id = t.member_id
        WHERE t.token = ? AND t.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
        """,
        (token,),
    )
    if not rows:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    return {"id": rows[0][0], "email": rows[0][1], "username": rows[0][2], "token": token}

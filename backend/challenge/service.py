"""Challenge-mode scores: full-cube timed solves by authenticated members.

Separate from the per-drill solve_attempts leaderboard in db/service.py —
different identity (members vs anonymous users) and different game mode.

Anti-cheat: solve time is computed server-side via challenge_sessions.
The client cannot submit an arbitrary solveTimeMs — it redeems an opaque key
that the server issued when the timer started.

Statuses
--------
'solved'  — player solved the cube
'give_up' — player clicked Give Up before solving; elapsed time recorded anyway
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from db import database

SESSION_TTL_HOURS = 1
ScoreStatus = Literal["solved", "give_up"]


def _fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def create_session(member_id: str, scramble_length: int = 20) -> dict:
    """Issue a challenge session key at timer-start; returns { key, startedAt }."""
    if not database.enabled():
        raise RuntimeError("persistence disabled")
    key = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=SESSION_TTL_HOURS)
    database.execute(
        "INSERT INTO challenge_sessions (key, member_id, started_at, scramble_length, expires_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (key, member_id, _fmt(now), int(scramble_length), _fmt(expires)),
    )
    return {"key": key, "startedAt": _fmt(now)}


def complete_session(key: str, member_id: str) -> tuple[int, int]:
    """Redeem a challenge session key. Returns (solve_time_ms, scramble_length).

    Uses UPDATE … RETURNING so the claim is atomic: only the first call for a
    given key can succeed; the second finds is_used = 1 and gets no rows back.
    Raises ValueError with a user-safe message on any validation failure.
    """
    if not database.enabled():
        raise RuntimeError("persistence disabled")
    now = datetime.now(timezone.utc)
    rows = database.query_write(
        """
        UPDATE challenge_sessions
        SET is_used = 1
        WHERE key = ? AND member_id = ? AND is_used = 0 AND expires_at > ?
        RETURNING started_at, scramble_length
        """,
        (key, member_id, _fmt(now)),
    )
    if not rows:
        check = database.query(
            "SELECT member_id, is_used FROM challenge_sessions WHERE key = ?",
            (key,),
        )
        if not check:
            raise ValueError("invalid session key")
        if check[0][0] != member_id:
            raise ValueError("invalid session key")
        if check[0][1]:
            raise ValueError("session key already used")
        raise ValueError("session key expired")

    started_at, scramble_length = rows[0]
    started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    solve_time_ms = max(1, int((now - started).total_seconds() * 1000))
    return solve_time_ms, int(scramble_length)


def record_score(
    member_id: str,
    username: str,
    solve_time_ms: int,
    scramble_length: int = 20,
    status: ScoreStatus = "solved",
) -> Optional[int]:
    """Log one challenge result; returns the member's best solved time (or None)."""
    if not database.enabled():
        return None
    if solve_time_ms <= 0:
        raise ValueError("solveTimeMs must be positive")
    database.execute(
        "INSERT INTO challenge_scores (member_id, username, solve_time_ms, scramble_length, status) "
        "VALUES (?, ?, ?, ?, ?)",
        (member_id, username, int(solve_time_ms), int(scramble_length), status),
    )
    rows = database.query(
        "SELECT MIN(solve_time_ms) FROM challenge_scores WHERE member_id = ? AND status = 'solved'",
        (member_id,),
    )
    return rows[0][0]


def leaderboard(limit: int = 10, include_give_up: bool = True) -> list[dict]:
    """Up to `limit` entries: solved members fill first (sorted by best solve
    time), then give_up-only members pad remaining slots if include_give_up is
    True.  Members who have both a solve and a give_up appear only once — as
    'solved' with their best solve time.
    """
    if not database.enabled():
        return []

    # Primary: solved members, one row each, fastest time first
    solved = database.query(
        """
        SELECT username, MIN(solve_time_ms), MAX(created_at)
        FROM challenge_scores
        WHERE status = 'solved'
        GROUP BY member_id
        ORDER BY MIN(solve_time_ms) ASC
        LIMIT ?
        """,
        (int(limit),),
    )
    entries = [
        {"rank": i + 1, "username": row[0], "bestMs": row[1], "at": row[2], "status": "solved"}
        for i, row in enumerate(solved)
    ]

    # Fill remaining slots with give_up-only members (no solved entry at all)
    remaining = limit - len(entries)
    if include_give_up and remaining > 0:
        give_up = database.query(
            """
            SELECT username, MIN(solve_time_ms), MAX(created_at)
            FROM challenge_scores
            WHERE status = 'give_up'
              AND member_id NOT IN (
                  SELECT DISTINCT member_id FROM challenge_scores WHERE status = 'solved'
              )
            GROUP BY member_id
            ORDER BY MIN(solve_time_ms) ASC
            LIMIT ?
            """,
            (int(remaining),),
        )
        for i, row in enumerate(give_up):
            entries.append({
                "rank": len(solved) + i + 1,
                "username": row[0],
                "bestMs": row[1],
                "at": row[2],
                "status": "give_up",
            })

    return entries

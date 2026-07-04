"""Challenge-mode scores: full-cube timed solves by authenticated members.

Separate from the per-drill solve_attempts leaderboard in db/service.py —
different identity (members vs anonymous users) and different game mode.
"""

from __future__ import annotations

from typing import Optional

from db import database


def record_score(
    member_id: str, username: str, solve_time_ms: int, scramble_length: int = 20
) -> Optional[int]:
    """Log one challenge solve; returns the member's best time."""
    if not database.enabled():
        return None
    if solve_time_ms <= 0:
        raise ValueError("solveTimeMs must be positive")
    database.execute(
        "INSERT INTO challenge_scores (member_id, username, solve_time_ms, scramble_length) "
        "VALUES (?, ?, ?, ?)",
        (member_id, username, int(solve_time_ms), int(scramble_length)),
    )
    rows = database.query(
        "SELECT MIN(solve_time_ms) FROM challenge_scores WHERE member_id = ?",
        (member_id,),
    )
    return rows[0][0]


def leaderboard(limit: int = 10) -> list[dict]:
    """Best time per member, fastest first — one row per player."""
    if not database.enabled():
        return []
    rows = database.query(
        """
        SELECT username, MIN(solve_time_ms), MAX(created_at)
        FROM challenge_scores
        GROUP BY member_id ORDER BY MIN(solve_time_ms) ASC LIMIT ?
        """,
        (int(limit),),
    )
    return [
        {"rank": i + 1, "username": row[0], "bestMs": row[1], "at": row[2]}
        for i, row in enumerate(rows)
    ]

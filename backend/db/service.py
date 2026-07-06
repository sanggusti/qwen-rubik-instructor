"""Domain functions over the persistence layer.

Every function no-ops (None/[]/False) when persistence is disabled, so callers
never need to check. load_digest is a deliberate port of the frontend's
buildMemoryDigest (frontend/src/lib/education/profile.ts) — same constants,
same retrieval/forgetting rules; change both together.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any, Optional

from db import database

DAY_MS = 24 * 60 * 60 * 1000
MISTAKE_HALF_LIFE_MS = 14 * DAY_MS
REVIEW_INTERVAL_MS = 21 * DAY_MS
FORGET_THRESHOLD = 0.5
MAX_MASTERED = 6
MAX_STRUGGLES = 3
MAX_REVIEW = 3

HANDLE_MAX_LEN = 24


def _clean_handle(handle: Optional[str]) -> Optional[str]:
    if handle is None:
        return None
    return handle.strip()[:HANDLE_MAX_LEN]


def upsert_user(
    user_id: str,
    *,
    level: Optional[str] = None,
    method: Optional[str] = None,
    handle: Optional[str] = None,
) -> bool:
    if not database.enabled():
        return False
    cleaned = _clean_handle(handle)
    # excluded.* would hold the already-defaulted insert values, so the UPDATE
    # coalesces against the raw params to leave unspecified fields untouched.
    database.execute(
        """
        INSERT INTO users (id, level, method, handle)
        VALUES (?, COALESCE(?, 'newbie'), COALESCE(?, 'lbl'), ?)
        ON CONFLICT(id) DO UPDATE SET
          level = COALESCE(?, level),
          method = COALESCE(?, method),
          handle = COALESCE(?, handle),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        """,
        (user_id, level, method, cleaned, level, method, cleaned),
    )
    return True


def sync_profile(
    user_id: str,
    *,
    level: Optional[str] = None,
    method: Optional[str] = None,
    handle: Optional[str] = None,
    history: Optional[list[dict]] = None,
    performance: Optional[dict[str, dict]] = None,
) -> bool:
    """Client-authoritative snapshot sync: upsert the user, then replace their
    history and stage stats wholesale (idempotent, last write wins)."""
    if not database.enabled():
        return False
    upsert_user(user_id, level=level, method=method, handle=handle)
    statements: list[tuple[str, tuple]] = [
        ("DELETE FROM sessions WHERE user_id = ?", (user_id,)),
        ("DELETE FROM stage_stats WHERE user_id = ?", (user_id,)),
    ]
    for entry in history or []:
        statements.append((
            "INSERT INTO sessions (user_id, kind, method, stages, at) VALUES (?, ?, ?, ?, ?)",
            (
                user_id,
                str(entry.get("kind") or ""),
                str(entry.get("method") or ""),
                int(entry.get("stages") or 0),
                str(entry.get("at") or ""),
            ),
        ))
    for stage, stat in (performance or {}).items():
        statements.append((
            "INSERT INTO stage_stats (user_id, stage, label, attempts, mistakes, best_ms, last_at, mastered) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                user_id,
                stage,
                stat.get("label"),
                int(stat.get("attempts") or 0),
                int(stat.get("mistakes") or 0),
                stat.get("bestMs"),
                str(stat.get("lastAt") or ""),
                1 if stat.get("mastered") else 0,
            ),
        ))
    database.execute_batch(statements)
    return True


def record_attempt(
    user_id: str,
    drill_id: str,
    duration_ms: int,
    mistakes: int = 0,
    handle: Optional[str] = None,
) -> Optional[int]:
    """Log one timed solve; returns the user's best time for the drill."""
    if not database.enabled():
        return None
    if duration_ms <= 0:
        raise ValueError("durationMs must be positive")
    upsert_user(user_id, handle=handle)
    database.execute(
        "INSERT INTO solve_attempts (user_id, drill_id, duration_ms, mistakes) VALUES (?, ?, ?, ?)",
        (user_id, drill_id, int(duration_ms), int(mistakes)),
    )
    rows = database.query(
        "SELECT MIN(duration_ms) FROM solve_attempts WHERE user_id = ? AND drill_id = ?",
        (user_id, drill_id),
    )
    return rows[0][0]


def leaderboard(drill_id: str, limit: int = 10) -> list[dict]:
    """Best clean time per user for a drill, fastest first."""
    if not database.enabled():
        return []
    rows = database.query(
        """
        SELECT u.id, COALESCE(NULLIF(u.handle, ''), 'anonymous'), MIN(a.duration_ms), MAX(a.at)
        FROM solve_attempts a JOIN users u ON u.id = a.user_id
        WHERE a.drill_id = ?
        GROUP BY u.id ORDER BY MIN(a.duration_ms) ASC LIMIT ?
        """,
        (drill_id, int(limit)),
    )
    return [
        {"userId": row[0][:8], "handle": row[1], "bestMs": row[2], "at": row[3]}
        for row in rows
    ]


# --- Review-session mirror ---------------------------------------------------

# One captured walkthrough is a few KB of narration + moves; anything near this
# cap is malformed or abusive, not a real session.
REVIEW_PAYLOAD_MAX_BYTES = 64 * 1024


def save_review_session(user_id: str, payload: dict) -> bool:
    """Client-authoritative snapshot: replace the user's mirrored review
    session wholesale (last write wins)."""
    if not database.enabled():
        return False
    raw = json.dumps(payload, separators=(",", ":"))
    if len(raw.encode("utf-8")) > REVIEW_PAYLOAD_MAX_BYTES:
        raise ValueError("review session payload too large")
    upsert_user(user_id)
    database.execute(
        """
        INSERT INTO review_sessions (user_id, payload)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        """,
        (user_id, raw),
    )
    return True


def load_review_session(user_id: str) -> Optional[dict]:
    """The mirrored session plus its sync time, or None if unknown/off."""
    if not database.enabled():
        return None
    rows = database.query(
        "SELECT payload, updated_at FROM review_sessions WHERE user_id = ?",
        (user_id,),
    )
    if not rows:
        return None
    try:
        session = json.loads(rows[0][0])
    except ValueError:
        return None
    return {"userId": user_id, "session": session, "updatedAt": rows[0][1]}


# --- Memory digest (port of frontend buildMemoryDigest) ----------------------

def _age_ms(last_at: str, now_ms: int) -> int:
    # Unparseable/missing timestamps are treated as "just now" so we never
    # forget data we can't date (mirrors profile.ts ageMs).
    try:
        parsed = datetime.fromisoformat(last_at.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return max(0, now_ms - int(parsed.timestamp() * 1000))
    except (ValueError, AttributeError):
        return 0


def _decayed_weight(mistakes: int, age_ms: int) -> float:
    if age_ms <= 0:
        return float(mistakes)
    return mistakes * (0.5 ** (age_ms / MISTAKE_HALF_LIFE_MS))


def load_digest(user_id: str, now: Optional[int] = None) -> Optional[dict]:
    """Build a MemoryDigest-shaped dict from persisted state, or None if the
    user is unknown / persistence is off. `now` is epoch millis (testable)."""
    if not database.enabled():
        return None
    users = database.query("SELECT level, method FROM users WHERE id = ?", (user_id,))
    if not users:
        return None
    now_ms = int(time.time() * 1000) if now is None else now

    stats = [
        {
            "stage": row[0],
            "label": row[1],
            "mistakes": row[2],
            "mastered": bool(row[3]),
            "age": _age_ms(row[4], now_ms),
        }
        for row in database.query(
            "SELECT stage, label, mistakes, mastered, last_at FROM stage_stats WHERE user_id = ?",
            (user_id,),
        )
    ]

    struggles = sorted(
        (s for s in stats
         if not s["mastered"] and _decayed_weight(s["mistakes"], s["age"]) > FORGET_THRESHOLD),
        key=lambda s: -_decayed_weight(s["mistakes"], s["age"]),
    )[:MAX_STRUGGLES]

    mastered = sorted(
        (s for s in stats if s["mastered"]), key=lambda s: s["age"]
    )[:MAX_MASTERED]

    due_for_review = sorted(
        (s for s in stats if s["mastered"] and s["age"] >= REVIEW_INTERVAL_MS),
        key=lambda s: -s["age"],
    )[:MAX_REVIEW]

    session_rows = database.query(
        "SELECT COUNT(*), (SELECT kind FROM sessions WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT 1) "
        "FROM sessions WHERE user_id = ?",
        (user_id, user_id),
    )
    session_count, last_kind = session_rows[0]

    return {
        "level": users[0][0],
        "method": users[0][1],
        "sessions": session_count,
        "lastKind": last_kind,
        "struggles": [
            {"stage": s["stage"], "label": s["label"], "mistakes": s["mistakes"]}
            for s in struggles
        ],
        "mastered": [s["label"] or s["stage"] for s in mastered],
        "dueForReview": [s["label"] or s["stage"] for s in due_for_review],
    }


def get_memory(user_id: str) -> Optional[dict]:
    if not database.enabled():
        return None
    rows = database.query(
        "SELECT handle, updated_at FROM users WHERE id = ?", (user_id,)
    )
    if not rows:
        return None
    return {
        "userId": user_id,
        "handle": rows[0][0],
        "digest": load_digest(user_id),
        "updatedAt": rows[0][1],
    }

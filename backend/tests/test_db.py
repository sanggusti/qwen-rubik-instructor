"""Persistence layer: migrations, profile sync, attempts/leaderboard, and the
memory digest port. The decay/forget/due-for-review cases mirror
frontend/src/lib/education/profile.test.ts so the two buildMemoryDigest ports
stay pinned to the same behavior."""

from datetime import datetime, timezone

import pytest

from db import database, service

NOW = 1_700_000_000_000
DAY_MS = 24 * 60 * 60 * 1000


def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def days_ago(n: float) -> str:
    return iso(NOW - int(n * DAY_MS))


def stat(stage: str, **over) -> dict:
    base = {"stage": stage, "label": stage, "attempts": 1, "mistakes": 0,
            "lastAt": iso(NOW), "mastered": False}
    base.update(over)
    return base


# --- migrations ---------------------------------------------------------------

def test_migrations_create_tables_and_are_idempotent(tmp_path):
    path = str(tmp_path / "m.db")
    assert database.init(path)
    assert database.init(path)  # re-init applies nothing new
    tables = {r[0] for r in database.query(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"users", "sessions", "stage_stats", "solve_attempts", "schema_migrations",
            "members", "auth_tokens", "challenge_scores", "review_sessions"} <= tables
    versions = database.query("SELECT version FROM schema_migrations")
    assert versions == [(1,), (2,), (3,), (4,), (5,)]


def test_init_empty_url_disables(temp_db):
    assert database.init("") is False
    assert not database.enabled()


# --- disabled mode ------------------------------------------------------------

def test_service_noops_when_disabled():
    assert service.upsert_user("u") is False
    assert service.sync_profile("u") is False
    assert service.record_attempt("u", "d", 1000) is None
    assert service.leaderboard("d") == []
    assert service.load_digest("u") is None
    assert service.get_memory("u") is None


# --- profile sync ---------------------------------------------------------------

def profile_payload():
    return {
        "level": "intermediate",
        "method": "cfop",
        "history": [
            {"kind": "walkthrough", "method": "lbl", "stages": 4, "at": days_ago(2)},
            {"kind": "lesson", "method": "cfop", "stages": 5, "at": days_ago(1)},
        ],
        "performance": {
            "cross": stat("cross", label="Cross", mistakes=0, mastered=True),
            "middle": stat("middle", label="Middle layer", mistakes=6),
        },
    }


def test_sync_profile_round_trip(temp_db):
    p = profile_payload()
    assert service.sync_profile("u1", **p)
    assert database.query("SELECT level, method FROM users WHERE id='u1'") == [
        ("intermediate", "cfop")]
    assert database.query("SELECT COUNT(*) FROM sessions WHERE user_id='u1'") == [(2,)]
    rows = database.query(
        "SELECT stage, label, mistakes, mastered FROM stage_stats WHERE user_id='u1' ORDER BY stage")
    assert rows == [("cross", "Cross", 0, 1), ("middle", "Middle layer", 6, 0)]


def test_sync_profile_replaces_previous_snapshot(temp_db):
    service.sync_profile("u1", **profile_payload())
    service.sync_profile("u1", level="newbie", method="lbl",
                         history=[{"kind": "lesson", "method": "lbl", "stages": 1, "at": days_ago(0)}],
                         performance={"cross": stat("cross", label="Cross", mistakes=1)})
    assert database.query("SELECT COUNT(*) FROM sessions WHERE user_id='u1'") == [(1,)]
    assert database.query(
        "SELECT stage, mistakes, mastered FROM stage_stats WHERE user_id='u1'") == [("cross", 1, 0)]
    assert database.query("SELECT level FROM users WHERE id='u1'") == [("newbie",)]


def test_sync_is_idempotent(temp_db):
    p = profile_payload()
    service.sync_profile("u1", **p)
    service.sync_profile("u1", **p)
    assert database.query("SELECT COUNT(*) FROM sessions WHERE user_id='u1'") == [(2,)]
    assert database.query("SELECT COUNT(*) FROM stage_stats WHERE user_id='u1'") == [(2,)]


def test_upsert_user_keeps_fields_not_provided(temp_db):
    service.upsert_user("u1", level="advanced", handle="speedy")
    service.upsert_user("u1", method="cfop")
    assert database.query("SELECT level, method, handle FROM users WHERE id='u1'") == [
        ("advanced", "cfop", "speedy")]


# --- attempts + leaderboard -----------------------------------------------------

def test_record_attempt_and_leaderboard_order(temp_db):
    service.record_attempt("u1", "drill", 9000, handle="alice")
    service.record_attempt("u1", "drill", 7000)
    service.record_attempt("u2", "drill", 8000)
    service.record_attempt("u3", "other-drill", 1000)

    board = service.leaderboard("drill")
    assert [(e["handle"], e["bestMs"]) for e in board] == [("alice", 7000), ("anonymous", 8000)]
    assert board[0]["userId"] == "u1"  # short ids stay as-is; long ones truncate


def test_record_attempt_returns_best(temp_db):
    assert service.record_attempt("u1", "d", 9000) == 9000
    assert service.record_attempt("u1", "d", 7000) == 7000
    assert service.record_attempt("u1", "d", 8000) == 7000


def test_record_attempt_rejects_nonpositive_duration(temp_db):
    with pytest.raises(ValueError):
        service.record_attempt("u1", "d", 0)


def test_leaderboard_truncates_user_id_and_limits(temp_db):
    long_id = "0123456789abcdef"
    service.record_attempt(long_id, "d", 5000)
    for i in range(12):
        service.record_attempt(f"u{i}", "d", 6000 + i)
    board = service.leaderboard("d", limit=10)
    assert len(board) == 10
    assert board[0]["userId"] == "01234567"


def test_handle_is_sanitized(temp_db):
    service.record_attempt("u1", "d", 1000, handle="  " + "x" * 40)
    assert service.leaderboard("d")[0]["handle"] == "x" * 24


# --- memory digest (mirrors profile.test.ts decay & forgetting) -----------------

def sync_stats(stats: list[dict], sessions: int = 0):
    history = [{"kind": "lesson", "method": "lbl", "stages": 1, "at": days_ago(0)}
               for _ in range(sessions)]
    service.sync_profile("u1", level="newbie", method="lbl", history=history,
                         performance={s["stage"]: s for s in stats})


def test_digest_unknown_user_is_none(temp_db):
    assert service.load_digest("nope") is None


def test_digest_fades_and_forgets_struggles(temp_db):
    # Mirrors: "forgets a struggle whose faded weight drops below the threshold"
    sync_stats([
        stat("recent", label="Recent", mistakes=4, lastAt=days_ago(0)),
        stat("ancient", label="Ancient", mistakes=2, lastAt=days_ago(60)),
    ])
    digest = service.load_digest("u1", now=NOW)
    stages = [s["stage"] for s in digest["struggles"]]
    assert "recent" in stages
    assert "ancient" not in stages  # decayed below FORGET_THRESHOLD


def test_digest_ranks_struggles_by_decayed_weight(temp_db):
    sync_stats([
        stat("middle", label="Middle layer", mistakes=6, lastAt=days_ago(0)),
        stat("ll-cross", label="Yellow cross", mistakes=2, lastAt=days_ago(0)),
        stat("cross", label="Cross", mistakes=0, mastered=True, lastAt=days_ago(0)),
    ], sessions=1)
    digest = service.load_digest("u1", now=NOW)
    # Struggles sorted by mistakes desc, mastered stages excluded.
    assert [s["label"] for s in digest["struggles"]] == ["Middle layer", "Yellow cross"]
    assert digest["mastered"] == ["Cross"]
    assert digest["sessions"] == 1
    assert digest["lastKind"] == "lesson"
    assert digest["level"] == "newbie"
    assert digest["method"] == "lbl"


def test_digest_surfaces_stale_mastered_as_due_for_review(temp_db):
    sync_stats([
        stat("fresh", label="Fresh", mastered=True, lastAt=days_ago(1)),
        stat("stale", label="Stale", mastered=True, lastAt=days_ago(30)),
    ])
    digest = service.load_digest("u1", now=NOW)
    assert "Stale" in digest["dueForReview"]
    assert "Fresh" not in digest["dueForReview"]


def test_digest_bounds_lists(temp_db):
    sync_stats([
        stat(f"m{i}", label=f"M{i}", mastered=True, lastAt=days_ago(i))
        for i in range(9)
    ] + [
        stat(f"s{i}", label=f"S{i}", mistakes=5 + i, lastAt=days_ago(0))
        for i in range(5)
    ])
    digest = service.load_digest("u1", now=NOW)
    assert len(digest["mastered"]) == 6  # MAX_MASTERED
    assert len(digest["struggles"]) == 3  # MAX_STRUGGLES
    # Most-recently-practiced mastered first.
    assert digest["mastered"][0] == "M0"
    # Heaviest struggle first.
    assert digest["struggles"][0]["label"] == "S4"


def test_get_memory_returns_digest_and_handle(temp_db):
    service.sync_profile("u1", level="newbie", handle="alice",
                         performance={"cross": stat("cross", label="Cross", mastered=True)})
    memory = service.get_memory("u1")
    assert memory["userId"] == "u1"
    assert memory["handle"] == "alice"
    assert memory["digest"]["mastered"] == ["Cross"]
    assert memory["updatedAt"]
    assert service.get_memory("unknown") is None

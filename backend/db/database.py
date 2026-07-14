"""Turso/libSQL connection + migrations.

Persistence is optional: an empty TURSO_DATABASE_URL (or a missing libsql
wheel) means init() leaves the module disabled and every caller no-ops, the
same emergent-fallback shape as the empty DASHSCOPE_API_KEY. init() never
raises. All access goes through execute()/query(), a single lock-guarded seam
that tests monkeypatch or point at a temp file.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any, Optional

from config import settings

logger = logging.getLogger("db")

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"

_conn: Optional[Any] = None
_url: Optional[str] = None
_lock = threading.Lock()


def enabled() -> bool:
    return _conn is not None


def _connect(url: str) -> Any:
    import libsql

    if url.startswith(("libsql://", "https://", "wss://")):
        return libsql.connect(url, auth_token=settings.turso_auth_token)
    Path(url).parent.mkdir(parents=True, exist_ok=True)
    return libsql.connect(url)


def init(url: Optional[str] = None) -> bool:
    """Connect and migrate. Empty/None url (after settings fallback) disables
    persistence. Returns True when the DB is ready; never raises."""
    global _conn, _url
    resolved = settings.turso_database_url if url is None else url
    with _lock:
        _conn = None
        _url = None
        if not resolved:
            return False
        try:
            import libsql  # noqa: F401
        except Exception:  # missing wheel on this platform -> run stateless
            logger.warning("libsql unavailable; persistence disabled")
            return False
        try:
            conn = _connect(resolved)
            _migrate(conn)
        except Exception:
            logger.exception("database init failed; persistence disabled")
            return False
        _conn = conn
        _url = resolved
        logger.info("persistence enabled (%s)", resolved)
        return True


def _migrate(conn: Any) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "version INTEGER PRIMARY KEY, "
        "applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"
    )
    conn.commit()
    applied = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0] or 0
    for path in sorted(MIGRATIONS_DIR.glob("[0-9]*.sql")):
        version = int(path.name.split("_", 1)[0])
        if version <= applied:
            continue
        conn.executescript(path.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
        conn.commit()


def _is_stale(exc: Exception) -> bool:
    # libsql wraps Hrana protocol errors ("stream not found" after Turso
    # expires an idle stream) in ValueError with a "Hrana:" prefix.
    return isinstance(exc, ValueError) and "hrana" in str(exc).lower()


def _run(fn: Any) -> Any:
    """Run fn(conn), reconnecting once if the remote stream went stale.

    Caller must hold _lock. Safe for writes: a dead stream never committed, so
    replaying the statement(s) on a fresh connection cannot double-apply.
    """
    global _conn
    assert _conn is not None
    try:
        return fn(_conn)
    except Exception as exc:
        if not _is_stale(exc):
            raise
        assert _url is not None
        logger.warning("stale libsql connection; reconnecting: %s", exc)
        _conn = _connect(_url)
        return fn(_conn)


def execute(sql: str, params: tuple = ()) -> None:
    """Run a write statement and commit."""

    def op(conn: Any) -> None:
        conn.execute(sql, params)
        conn.commit()

    with _lock:
        _run(op)


def execute_batch(statements: list[tuple[str, tuple]]) -> None:
    """Run several write statements atomically (one commit, rollback on error)."""

    def op(conn: Any) -> None:
        try:
            for sql, params in statements:
                conn.execute(sql, params)
            conn.commit()
        except Exception:
            # rollback itself fails on a dead stream; the original error must
            # survive so _run can classify it.
            try:
                conn.rollback()
            except Exception:
                pass
            raise

    with _lock:
        _run(op)


def query(sql: str, params: tuple = ()) -> list[tuple]:
    with _lock:
        return _run(lambda conn: conn.execute(sql, params).fetchall())


def query_write(sql: str, params: tuple = ()) -> list[tuple]:
    """Run a DML statement that returns rows (e.g. UPDATE … RETURNING) and commit."""

    def op(conn: Any) -> list[tuple]:
        result = conn.execute(sql, params).fetchall()
        conn.commit()
        return result

    with _lock:
        return _run(op)

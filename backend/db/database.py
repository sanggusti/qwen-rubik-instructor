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
_lock = threading.Lock()


def enabled() -> bool:
    return _conn is not None


def init(url: Optional[str] = None) -> bool:
    """Connect and migrate. Empty/None url (after settings fallback) disables
    persistence. Returns True when the DB is ready; never raises."""
    global _conn
    resolved = settings.turso_database_url if url is None else url
    with _lock:
        _conn = None
        if not resolved:
            return False
        try:
            import libsql
        except Exception:  # missing wheel on this platform -> run stateless
            logger.warning("libsql unavailable; persistence disabled")
            return False
        try:
            if resolved.startswith(("libsql://", "https://", "wss://")):
                conn = libsql.connect(resolved, auth_token=settings.turso_auth_token)
            else:
                Path(resolved).parent.mkdir(parents=True, exist_ok=True)
                conn = libsql.connect(resolved)
            _migrate(conn)
        except Exception:
            logger.exception("database init failed; persistence disabled")
            return False
        _conn = conn
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


def execute(sql: str, params: tuple = ()) -> None:
    """Run a write statement and commit."""
    with _lock:
        assert _conn is not None
        _conn.execute(sql, params)
        _conn.commit()


def execute_batch(statements: list[tuple[str, tuple]]) -> None:
    """Run several write statements atomically (one commit, rollback on error)."""
    with _lock:
        assert _conn is not None
        try:
            for sql, params in statements:
                _conn.execute(sql, params)
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise


def query(sql: str, params: tuple = ()) -> list[tuple]:
    with _lock:
        assert _conn is not None
        return _conn.execute(sql, params).fetchall()

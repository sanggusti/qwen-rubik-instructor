-- Learner memory persistence (Turso/libSQL). The client stays authoritative:
-- these tables mirror the browser's rubik-profile so Qwen can recall a learner
-- across devices/sessions, plus an event log of timed solves for the leaderboard.

-- Anonymous identities + context/preferences (client profile.sessionId -> id).
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  handle     TEXT,
  level      TEXT NOT NULL DEFAULT 'newbie',
  method     TEXT NOT NULL DEFAULT 'lbl',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Learning history events: one row per completed walkthrough/lesson (mirrors
-- the client HistoryEntry list; replaced wholesale on each profile sync).
CREATE TABLE IF NOT EXISTS sessions (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind    TEXT NOT NULL,
  method  TEXT NOT NULL,
  stages  INTEGER NOT NULL DEFAULT 0,
  at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_at ON sessions(user_id, at);

-- Progress / skill mastery, one row per (user, stage); mirrors client StageStat.
-- Due-for-review is DERIVED from mastered + last_at (forgetting curve), never stored.
CREATE TABLE IF NOT EXISTS stage_stats (
  user_id  TEXT NOT NULL REFERENCES users(id),
  stage    TEXT NOT NULL,
  label    TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  mistakes INTEGER NOT NULL DEFAULT 0,
  best_ms  INTEGER,
  last_at  TEXT NOT NULL,
  mastered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, stage)
);

-- Every timed drill completion (event log; leaderboard reads MIN per user).
CREATE TABLE IF NOT EXISTS solve_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  drill_id    TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  mistakes    INTEGER NOT NULL DEFAULT 0,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_board ON solve_attempts(drill_id, duration_ms);
CREATE INDEX IF NOT EXISTS idx_attempts_user  ON solve_attempts(user_id, at);

-- Google-authenticated members (parallel to anonymous `users`; not merged)
CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,   -- Google `sub` claim
  email       TEXT NOT NULL,
  username    TEXT UNIQUE,        -- NULL until user sets it on first login
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Bearer tokens for authenticated sessions
CREATE TABLE IF NOT EXISTS auth_tokens (
  token       TEXT PRIMARY KEY,   -- random UUID
  member_id   TEXT NOT NULL REFERENCES members(id),
  expires_at  TEXT NOT NULL,      -- ISO8601 UTC; 30-day expiry
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_member ON auth_tokens(member_id);

-- Full-cube timed challenge results
CREATE TABLE IF NOT EXISTS challenge_scores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       TEXT NOT NULL REFERENCES members(id),
  username        TEXT NOT NULL,       -- denormalised for fast leaderboard reads
  solve_time_ms   INTEGER NOT NULL,    -- milliseconds; lower = better
  scramble_length INTEGER NOT NULL DEFAULT 20,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_challenge_board  ON challenge_scores(solve_time_ms);
CREATE INDEX IF NOT EXISTS idx_challenge_member ON challenge_scores(member_id, solve_time_ms);

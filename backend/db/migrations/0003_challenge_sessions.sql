-- Challenge session keys: server-side timing anti-cheat.
-- Frontend calls POST /challenge/start to get a single-use key when the timer
-- starts; POST /challenge/score redeems it and the backend computes elapsed
-- time — the client never sends a solve time it could fake.
CREATE TABLE IF NOT EXISTS challenge_sessions (
  key             TEXT    PRIMARY KEY,                   -- UUID given to frontend
  member_id       TEXT    NOT NULL REFERENCES members(id),
  started_at      TEXT    NOT NULL,                      -- ISO8601 UTC, server time
  scramble_length INTEGER NOT NULL DEFAULT 20,
  is_used         INTEGER NOT NULL DEFAULT 0,            -- 1 once /score redeems it
  expires_at      TEXT    NOT NULL                       -- started_at + 1 hour
);
CREATE INDEX IF NOT EXISTS idx_challenge_sessions_member ON challenge_sessions(member_id);

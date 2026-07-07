-- Review-session mirror. The client stays authoritative: the browser captures
-- the latest Qwen solve walkthrough (scramble + per-stage beats + narration)
-- in localStorage and best-effort mirrors it here so the /review canvas can
-- follow a learner across devices. One row per user, payload = the client's
-- ReviewSession JSON verbatim (replaced wholesale on each sync).
CREATE TABLE IF NOT EXISTS review_sessions (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

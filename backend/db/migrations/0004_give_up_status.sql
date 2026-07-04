-- Track whether a challenge score was a genuine solve or the user gave up.
-- DEFAULT 'solved' back-fills all existing rows so the leaderboard is unchanged.
ALTER TABLE challenge_scores ADD COLUMN status TEXT NOT NULL DEFAULT 'solved';

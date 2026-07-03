# Challenge Me + Leaderboard Plan

**Date:** 2026-07-04  
**Branch:** feature/challenge-leaderboard (from `feature/revamp-guide-play`)

---

## Decisions (locked 2026-07-04)

| # | Decision |
|---|---|
| 1 | Google Cloud Console OAuth client exists; redirect URI `http://localhost:8000/auth/callback` (dev) + production URL whitelisted |
| 2 | Token expiry: **30 days** (no refresh token needed) |
| 3 | Leaderboard shows **best time per member** — one row per player |
| 4 | Timer starts after scramble animation finishes (`cubeStore.isBusy` → false) |
| 5 | `httpx==0.28.1` already in `backend/requirements.txt` — no change needed |

---

## What Already Exists (don't duplicate)

`backend/db/migrations/0001_init.sql` already defines:

| Table | Purpose |
|---|---|
| `users` | Anonymous learner identities (client-generated `sessionId`) |
| `sessions` | Learning history events per user |
| `stage_stats` | Skill mastery rows per (user, stage) |
| `solve_attempts` | Timed drill completions — per-drill leaderboard |

`GET /leaderboard?drillId=…` and `POST /attempts` already handle drill-level scoring.  
The new challenge mode is a **full-cube timed solve** — separate tables, separate endpoints.

**Reuse:**
- `backend/db/database.py` `execute()` / `query()` / `execute_batch()` — all DB writes go through these
- `backend/db/service.py` `_clean_handle()` pattern — mirror for username sanitisation
- `frontend/src/lib/stores/cube.svelte.ts` `cubeStore.isSolved`, `cubeStore.isBusy`, `cubeStore.scramble()` — challenge store depends on these
- `.dock-action` CSS class in `HudBar.svelte` — base styles for ChallengeButton desktop variant

---

## Architecture Overview

```
Google OAuth
  └─ FastAPI /auth/* routes
       └─ members + auth_tokens tables in TursoDB
            └─ Bearer token stored in frontend localStorage

Challenge flow
  └─ FastAPI /challenge/* routes
       └─ challenge_scores table in TursoDB

All tables auto-created by existing _migrate() in database.py on startup.
No Supabase. No external auth service.
```

---

## New Migration: `backend/db/migrations/0002_auth_and_challenge.sql`

Auto-applied on next `database.init()` at backend startup.

```sql
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
```

---

## New Environment Variables

Add to repo-root `.env` and deploy env:

```
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
FRONTEND_URL=http://localhost:5173
```

Add to `backend/config.py` `Settings`:

```python
google_client_id: str = ""
google_client_secret: str = ""
frontend_url: str = "http://localhost:5173"
```

---

## Button Placement

### Desktop / Tablet (≥ 761px) — inside `HudBar.svelte` `.rail`

```
[⚡ Challenge Me]   ← new, above Guide, uses --accent-a colour
[📖 Guide]
[Scramble]
[Reset]
```

### Mobile (≤ 760px) — fixed position, top-right

```css
.challenge-fab-mobile {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  right: 10px;
  z-index: 110;
}
```

Label mobile: **"Challenge Me!"** · Label desktop: **"Challenge Me"**

---

## User Flow

```
Click "Challenge Me"
  ├─ Not logged in → AuthModal Step 1 (Google login)
  │     └─ Step 2 if no username (first login only)
  └─ Logged in → challengeStore.begin()
        └─ cubeStore.scramble(20) fires
        └─ wait isBusy → false → timer starts
        └─ [user solves cube]
        └─ cubeStore.isSolved → challengeStore.finish()
        └─ submitScore(token, elapsedMs, 20)
        └─ ConfettiOverlay mounts (10 s, pointer-events: none, z-index: 150)
        └─ onDone → LeaderboardModal (z-index: 200)
              └─ "Play Again" → reset · "Go Home" → navigate /
```

---

## Todo Checklist

### Phase 1 — Backend Infrastructure

- [ ] **Step 1: Migration + Config**
  - [ ] Create `backend/db/migrations/0002_auth_and_challenge.sql` (members, auth_tokens, challenge_scores + indexes)
  - [ ] Add `google_client_id`, `google_client_secret`, `frontend_url` to `backend/config.py` Settings
  - [ ] _Verify: backend starts; tables exist in Turso after init_

- [ ] **Step 2: Google OAuth Backend**
  - [ ] Create `backend/auth/__init__.py`
  - [ ] Create `backend/auth/google.py`: `build_auth_url()`, `exchange_code(code)`, `get_userinfo(access_token)`
  - [ ] Create `backend/auth/session.py`: `create_token(member_id)`, `require_member()` dependency, `delete_token(token)`
  - [ ] Create `backend/auth/routes.py` (prefix `/auth`):
    - [ ] `GET /auth/google` → redirect to Google authorization URL
    - [ ] `GET /auth/callback` → exchange code → upsert member → create token → redirect to `{frontend_url}/play?token=<UUID>`
    - [ ] `GET /auth/me` → return `{ id, email, username, hasUsername }`
    - [ ] `POST /auth/username` → set username; 409 if taken
    - [ ] `POST /auth/logout` → delete token row
  - [ ] Wire into `backend/main.py`: `app.include_router(auth_router)`
  - [ ] _Verify: `curl /auth/google` redirects; callback creates member + token rows; `/auth/me` returns member_

- [ ] **Step 3: Challenge Score Backend**
  - [ ] Create `backend/challenge/__init__.py`
  - [ ] Create `backend/challenge/service.py`: `record_score()`, `leaderboard(limit)` (GROUP BY member_id, MIN solve_time_ms)
  - [ ] Create `backend/challenge/routes.py` (prefix `/challenge`):
    - [ ] `POST /challenge/score` → authenticated → `{ solveTimeMs, scrambleLength }` → return `{ ok, bestMs }`
    - [ ] `GET /challenge/leaderboard?limit=10` → public → return `{ entries: [{ rank, username, bestMs, at }] }`
  - [ ] Wire into `backend/main.py`
  - [ ] _Verify: POST score appears in Turso; GET leaderboard returns ordered entries_

---

### Phase 2 — Frontend Auth

- [ ] **Step 4: Auth API + Store**
  - [ ] Create `frontend/src/lib/api/auth.ts`: `redirectToGoogle()`, `getMe(token)`, `setUsername(token, username)`, `logout(token)`
  - [ ] Create `frontend/src/lib/auth/store.svelte.ts`: reactive `member`, `isLoaded`, `token`; `init()`, `logout()`
  - [ ] Update `frontend/src/routes/+layout.svelte`:
    - [ ] Read `?token=` from URL after OAuth redirect → store to localStorage → `history.replaceState` to remove it
    - [ ] Call `authStore.init()` on mount
  - [ ] _Verify: login flow stores token; getMe() populates authStore; logout clears; page reload restores session_

- [ ] **Step 5: AuthModal Component**
  - [ ] Create `frontend/src/lib/components/AuthModal.svelte`
    - [ ] Step 1: "Sign in with Google" button → `redirectToGoogle()`; "Cancel" closes modal
    - [ ] Step 2: username input (2–24 chars, `^[a-zA-Z0-9_]+$`) → `setUsername()`; inline error for taken/invalid
    - [ ] Auto-advances to step 2 when `member !== null && !member.username`
  - [ ] _Verify: first login shows step 2; second login skips to game_

---

### Phase 3 — Challenge UI

- [ ] **Step 6: ChallengeButton + Placement**
  - [ ] Create `frontend/src/lib/components/ChallengeButton.svelte` (props: `layout: 'desktop' | 'mobile'`, `onclick`)
  - [ ] Update `frontend/src/lib/components/HudBar.svelte`:
    - [ ] Add `onChallenge` prop
    - [ ] Render `<ChallengeButton layout="desktop" />` above `guide-toggle` in `.rail`
  - [ ] Update `frontend/src/routes/play/+page.svelte`:
    - [ ] Pass `onChallenge` to HudBar (opens AuthModal if not authed, else starts challenge)
    - [ ] Render `<ChallengeButton layout="mobile" />` at fixed top-right (≤ 760px), z-index 110
  - [ ] _Verify: desktop renders above Guide; mobile renders top-right as "Challenge Me!"_

- [ ] **Step 7: ChallengeStore + Timer Display**
  - [ ] Create `frontend/src/lib/stores/challenge.svelte.ts` (`status`, `startMs`, `elapsedMs`, `begin()`, `tick()`, `finish()`, `reset()`)
  - [ ] Update `frontend/src/routes/play/+page.svelte`:
    - [ ] rAF loop when `status === 'running'`
    - [ ] `$effect` on `cubeStore.isSolved` → `challengeStore.finish()`
  - [ ] Update `frontend/src/lib/components/HudBar.svelte`: timer `mm:ss.S` in `--accent-y` when `status !== 'idle'`
  - [ ] _Verify: timer starts after scramble finishes; freezes on solve_

---

### Phase 4 — Score + Celebration

- [ ] **Step 8: Score Submission**
  - [ ] Create `frontend/src/lib/api/challenge.ts`: `submitScore(token, solveTimeMs, scrambleLength)`, `fetchLeaderboard(limit)`
  - [ ] Update `frontend/src/routes/play/+page.svelte`: call `submitScore` on `challengeStore.finish()` (fire-and-forget)
  - [ ] _Verify: score row in Turso after solve; leaderboard endpoint returns it_

- [ ] **Step 9: ConfettiOverlay + LeaderboardModal**
  - [ ] Add `canvas-confetti` to `frontend/package.json` dependencies
  - [ ] Create `frontend/src/lib/components/ConfettiOverlay.svelte` (fixed, `pointer-events: none`, z-index 150; 10s rAF burst → `onDone()`)
  - [ ] Create `frontend/src/lib/components/LeaderboardModal.svelte` (fetches top-10 on mount; shows formatted time, rank, highlighted user row; "Play Again" + "Go Home"; z-index 200)
  - [ ] Update `frontend/src/routes/play/+page.svelte`: mount ConfettiOverlay on solve → `onDone` → mount LeaderboardModal
  - [ ] _Verify: confetti 10s; modal shows user rank; Play Again resets to idle_

---

### Phase 5 — Landing Page

- [ ] **Step 10: LeaderboardSection**
  - [ ] Create `frontend/src/lib/landing/LeaderboardSection.svelte` (fetches top-10, no auth; loading skeleton; silent error hides section; ranked table with formatted time + relative date)
  - [ ] Update `frontend/src/lib/landing/LandingPage.svelte`: insert `<LeaderboardSection />` between `<HeroStage>` and first `<ContentSection>`
  - [ ] _Verify: scores visible on landing page without login; empty/error hides section gracefully_

---

## New Files Summary

```
backend/db/migrations/0002_auth_and_challenge.sql
backend/auth/__init__.py
backend/auth/google.py
backend/auth/session.py
backend/auth/routes.py
backend/challenge/__init__.py
backend/challenge/service.py
backend/challenge/routes.py

frontend/src/lib/api/auth.ts
frontend/src/lib/api/challenge.ts
frontend/src/lib/auth/store.svelte.ts
frontend/src/lib/stores/challenge.svelte.ts
frontend/src/lib/components/AuthModal.svelte
frontend/src/lib/components/ChallengeButton.svelte
frontend/src/lib/components/ConfettiOverlay.svelte
frontend/src/lib/components/LeaderboardModal.svelte
frontend/src/lib/landing/LeaderboardSection.svelte
```

## Modified Files Summary

```
backend/config.py
backend/main.py
frontend/package.json
frontend/src/routes/+layout.svelte
frontend/src/routes/play/+page.svelte
frontend/src/lib/components/HudBar.svelte
frontend/src/lib/landing/LandingPage.svelte
```

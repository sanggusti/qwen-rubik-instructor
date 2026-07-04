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

- [x] **Step 1: Migration + Config**
  - [x] Create `backend/db/migrations/0002_auth_and_challenge.sql` (members, auth_tokens, challenge_scores + indexes)
  - [x] Add `google_client_id`, `google_client_secret`, `frontend_url` to `backend/config.py` Settings
  - [x] _Verify: backend starts; tables exist in Turso after init_

- [x] **Step 2: Google OAuth Backend**
  - [x] Create `backend/auth/__init__.py`
  - [x] Create `backend/auth/google.py`: `build_auth_url()`, `exchange_code(code)`, `get_userinfo(access_token)`
  - [x] Create `backend/auth/session.py`: `create_token(member_id)`, `require_member()` dependency, `delete_token(token)`
  - [x] Create `backend/auth/routes.py` (prefix `/auth`):
    - [x] `GET /auth/google` → redirect to Google authorization URL
    - [x] `GET /auth/callback` → exchange code → upsert member → create token → redirect to `{frontend_url}/play?token=<UUID>`
    - [x] `GET /auth/me` → return `{ id, email, username, hasUsername }`
    - [x] `POST /auth/username` → set username; 409 if taken
    - [x] `POST /auth/logout` → delete token row
  - [x] Wire into `backend/main.py`: `app.include_router(auth_router)`
  - [x] _Verify: `curl /auth/google` redirects; callback creates member + token rows; `/auth/me` returns member_

- [x] **Step 3: Challenge Score Backend**
  - [x] Create `backend/challenge/__init__.py`
  - [x] Create `backend/challenge/service.py`: `record_score()`, `leaderboard(limit)` (GROUP BY member_id, MIN solve_time_ms)
  - [x] Create `backend/challenge/routes.py` (prefix `/challenge`):
    - [x] `POST /challenge/score` → authenticated → `{ solveTimeMs, scrambleLength }` → return `{ ok, bestMs }`
    - [x] `GET /challenge/leaderboard?limit=10` → public → return `{ entries: [{ rank, username, bestMs, at }] }`
  - [x] Wire into `backend/main.py`
  - [x] _Verify: POST score appears in Turso; GET leaderboard returns ordered entries_

---

### Phase 2 — Frontend Auth

- [x] **Step 4: Auth API + Store**
  - [x] Create `frontend/src/lib/api/auth.ts`: `redirectToGoogle()`, `getMe(token)`, `setUsername(token, username)`, `logout(token)`
  - [x] Create `frontend/src/lib/auth/store.svelte.ts`: reactive `member`, `isLoaded`, `token`; `init()`, `logout()`
  - [x] Update `frontend/src/routes/+layout.svelte`:
    - [x] Read `?token=` from URL after OAuth redirect → store to localStorage → `history.replaceState` to remove it
    - [x] Call `authStore.init()` on mount
  - [x] _Verify: login flow stores token; getMe() populates authStore; logout clears; page reload restores session_

- [x] **Step 5: AuthModal Component**
  - [x] Create `frontend/src/lib/components/AuthModal.svelte`
    - [x] Step 1: "Sign in with Google" button → `redirectToGoogle()`; "Cancel" closes modal
    - [x] Step 2: username input (2–24 chars, `^[a-zA-Z0-9_]+$`) → `setUsername()`; inline error for taken/invalid
    - [x] Auto-advances to step 2 when `member !== null && !member.username`
  - [x] _Verify: first login shows step 2; second login skips to game_

---

### Phase 3 — Challenge UI

- [x] **Step 6: ChallengeButton + Placement**
  - [x] Create `frontend/src/lib/components/ChallengeButton.svelte` (props: `layout: 'desktop' | 'mobile'`, `onclick`)
  - [x] Update `frontend/src/lib/components/HudBar.svelte`:
    - [x] Add `onChallenge` prop
    - [x] Render `<ChallengeButton layout="desktop" />` above `guide-toggle` in `.rail`
  - [x] Update `frontend/src/routes/play/+page.svelte`:
    - [x] Pass `onChallenge` to HudBar (opens AuthModal if not authed, else starts challenge)
    - [x] Render `<ChallengeButton layout="mobile" />` at fixed top-right (≤ 760px), z-index 110
  - [x] _Verify: desktop renders above Guide; mobile renders top-right as "Challenge Me!"_

- [x] **Step 7: ChallengeStore + Timer Display**
  - [x] Create `frontend/src/lib/stores/challenge.svelte.ts` (`status`, `startMs`, `elapsedMs`, `begin()`, `tick()`, `finish()`, `reset()`)
  - [x] Update `frontend/src/routes/play/+page.svelte`:
    - [x] rAF loop when `status === 'running'`
    - [x] `$effect` on `cubeStore.isSolved` → `challengeStore.finish()`
  - [x] Update `frontend/src/lib/components/HudBar.svelte`: timer `mm:ss.S` in `--accent-y` when `status !== 'idle'`
  - [x] _Verify: timer starts after scramble finishes; freezes on solve_

---

### Phase 4 — Score + Celebration

- [x] **Step 8: Score Submission**
  - [x] Create `frontend/src/lib/api/challenge.ts`: `submitScore(token, solveTimeMs, scrambleLength)`, `fetchLeaderboard(limit)`
  - [x] Update `frontend/src/routes/play/+page.svelte`: call `submitScore` on `challengeStore.finish()` (fire-and-forget)
  - [x] _Verify: score row in Turso after solve; leaderboard endpoint returns it_

- [x] **Step 9: ConfettiOverlay + LeaderboardModal**
  - [x] Add `canvas-confetti` to `frontend/package.json` dependencies
  - [x] Create `frontend/src/lib/components/ConfettiOverlay.svelte` (fixed, `pointer-events: none`, z-index 150; 10s rAF burst → `onDone()`)
  - [x] Create `frontend/src/lib/components/LeaderboardModal.svelte` (fetches top-10 on mount; shows formatted time, rank, highlighted user row; "Play Again" + "Go Home"; z-index 200)
  - [x] Update `frontend/src/routes/play/+page.svelte`: mount ConfettiOverlay on solve → `onDone` → mount LeaderboardModal
  - [x] _Verify: confetti 10s; modal shows user rank; Play Again resets to idle_

---

### Phase 5 — Landing Page

- [x] **Step 10: LeaderboardSection**
  - [x] Create `frontend/src/lib/landing/LeaderboardSection.svelte` (fetches top-10, no auth; loading skeleton; silent error hides section; ranked table with formatted time + relative date)
  - [x] Update `frontend/src/lib/landing/LandingPage.svelte`: insert `<LeaderboardSection />` between `<HeroStage>` and first `<ContentSection>`
  - [x] _Verify: scores visible on landing page without login; empty/error hides section gracefully_

---

---

### Phase 6 — Playwright E2E Verification

> Prerequisites: backend running on `http://localhost:8000`, frontend dev server on `http://localhost:5173`.  
> All checks use the MCP Playwright tools (`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_fill_form`, `browser_evaluate`, `browser_wait_for`).

- [x] **Check 1: Landing page leaderboard renders**
  - [x] `browser_navigate` to `http://localhost:5173`
  - [x] `browser_wait_for` selector `.leaderboard-section` to appear
  - [x] `browser_take_screenshot` — confirm ranked table or empty/hidden state (no error shown)
  - [x] `browser_snapshot` — check no JS console errors in `browser_console_messages`

- [x] **Check 2: Challenge Me button placement**
  - [x] `browser_navigate` to `http://localhost:5173/play`
  - [x] `browser_snapshot` — confirm "Challenge Me" button appears above the Guide button in the left rail
  - [x] `browser_take_screenshot` — visual confirmation desktop layout
  - [x] `browser_resize` to `390 x 844` (mobile viewport)
  - [x] `browser_snapshot` — confirm "Challenge Me!" FAB appears at top-right
  - [x] `browser_take_screenshot` — visual confirmation mobile layout
  - [x] `browser_resize` back to `1280 x 800`

- [x] **Check 3: AuthModal opens and Google button is present**
  - [x] `browser_navigate` to `http://localhost:5173/play`
  - [x] `browser_click` on "Challenge Me" button
  - [x] `browser_wait_for` selector `.auth-modal` to appear
  - [x] `browser_snapshot` — confirm Step 1 with "Sign in with Google" button visible
  - [x] `browser_take_screenshot`
  - [x] `browser_click` "Cancel" — confirm modal closes
  - [x] `browser_snapshot`

- [x] **Check 4: Username step renders after auth (simulate token)**
  - [x] `browser_evaluate` to inject a mock session: `localStorage.setItem('auth_token', 'test-token')` and seed `authStore` to a state where `username` is null
  - [x] `browser_navigate` to `http://localhost:5173/play?token=<test-token>` (or trigger manually)
  - [x] `browser_wait_for` selector `.auth-modal` step 2 to appear
  - [x] `browser_snapshot` — confirm username input field is shown
  - [x] `browser_fill_form` username field with `testplayer`
  - [x] `browser_take_screenshot`

- [x] **Check 5: Timer appears and runs during challenge**
  - [x] With a valid authenticated session, `browser_click` "Challenge Me"
  - [x] `browser_wait_for` selector `.challenge-timer` to appear in the HUD rail
  - [x] `browser_take_screenshot` — timer shows `00:00.0`
  - [x] Wait a moment; `browser_snapshot` — confirm timer is incrementing
  - [x] `browser_take_screenshot` — timer shows non-zero value

- [x] **Check 6: Confetti fires on solve**
  - [x] `browser_evaluate` to programmatically solve the cube: `window.__cubeStore.reset()` (puts cube in solved state)
  - [x] `browser_wait_for` selector `.confetti-overlay` to appear
  - [x] `browser_take_screenshot` — confetti visible over the cube
  - [x] `browser_snapshot`

- [x] **Check 7: LeaderboardModal appears after confetti**
  - [x] After confetti: `browser_wait_for` selector `.leaderboard-modal` (up to 12 000 ms — 10 s confetti + margin)
  - [x] `browser_snapshot` — confirm time displayed, top-10 table rendered, user row highlighted
  - [x] `browser_take_screenshot`
  - [x] `browser_click` "Play Again" — confirm modal closes and timer resets to `00:00.0`
  - [x] `browser_snapshot`

- [x] **Check 8: Score persists in leaderboard**
  - [x] `browser_navigate` to `http://localhost:5173`
  - [x] `browser_wait_for` selector `.leaderboard-section`
  - [x] `browser_snapshot` — confirm submitted score appears in the landing page table
  - [x] `browser_take_screenshot`
  - [x] `browser_network_requests` — confirm `GET /challenge/leaderboard` returned 200 with correct payload

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

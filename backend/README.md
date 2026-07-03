# Rubik Backend

Principle: Deterministic structure, generative narration.

I imagine the flow would be:

```text
Cube state
  ↓
Sandbox solver / lesson planner
  ↓
Validated move + visual plan
  ↓
LLM generates narration JSON around that plan
  ↓
Backend validates JSON
  ↓
Frontend lesson player executes JSON:
    - highlight corners
    - show text
    - animate R
    - pause
    - continue
```

1. Three.js exposes visual vocabulary internally.
2. Backend defines allowed JSON schema.
3. Solver/planner generates valid cube/move facts.
4. LLM receives the facts + visual frame skeleton.
5. LLM writes narrative JSON only.
6. Backend validates the JSON.
7. Frontend maps JSON actions to Three.js functions.
8. Session memory/tone/metaphor make each run unique.

Keep these stable:

- cube state
- target cubie
- valid move sequence
- highlighted face
- highlighted cubie
- expected result

Let these vary

- wording
- tone
- analogy
- encouragement
- hint style
- question prompts
- pace
- frame titles
- recap text

Backend flow:

1. Validate cube state.
2. Ask solver/planner for next lesson target.
3. Generate visual action skeleton.
4. Send skeleton to LLM.
5. LLM returns narration JSON.
6. Validate LLM JSON.
7. Merge narration with visual skeleton.
8. Return full NarrativeSession to frontend.

Frontend flow (rough, need adjustments):

Frame 1:
  show title
  show narration
  execute highlight action
  wait for user

Frame 2:
  show title
  show narration
  highlight R face
  show arrow
  animate R
  continue

## Running it

The `DASHSCOPE_API_KEY` is read from the repo-root `.env`.

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --port 8000
```

Then start the frontend (`npm run dev`) and use "Solve my cube (Qwen)" in the
Explore panel or "Lesson from my cube (Qwen)" in Lessons. The frontend points at
`http://localhost:8000` by default (override with `VITE_BACKEND_URL`).

Endpoints (both stream Server-Sent Events): `POST /narrate/walkthrough` and
`POST /narrate/lesson`, body `{ "state": <cube state> }` or `{ "topic": "sune" }`.
`GET /topics` lists catalog topics; `GET /health` is a readiness check.

Config (`config.py`, override via env): `QWEN_MODEL` (default `qwen3.7-plus`; set
to `qwen-plus` for ~6x faster, non-reasoning narration), `DASHSCOPE_BASE_URL`,
`CORS_ORIGINS`.

```bash
.venv/bin/pytest            # full suite (LLM mocked)
.venv/bin/pytest -m live    # one live DashScope smoke call
```

The cube engine in `pipeline/cube/facelet.py` is a verbatim port of the
frontend's `core/state.ts`, pinned by a Node↔Python cross-validation test. The
solver wraps the `rubik_cube` (pglass) beginner LBL method; its move/facelet
conventions are mapped to ours empirically (see `pipeline/solver/lbl.py` and
`tests/test_solver.py`).

## Persistence (Turso/libSQL)

Optional: set `TURSO_DATABASE_URL` (a local file path for dev, or a
`libsql://…` URL plus `TURSO_AUTH_TOKEN` for Turso cloud) and the backend
persists learner memory; leave it unset and the backend is exactly as
stateless as before. Setup for Turso cloud:

```bash
turso db create rubik
turso db show rubik --url        # -> TURSO_DATABASE_URL
turso db tokens create rubik     # -> TURSO_AUTH_TOKEN
```

Schema (`db/migrations/NNNN_*.sql`, applied idempotently at startup and
tracked in `schema_migrations`): `users` (anonymous id + handle + level/method),
`sessions` (learning history events), `stage_stats` (per-stage progress and
mastery; due-for-review is derived from `mastered + last_at`, never stored),
`solve_attempts` (every timed drill completion).

Endpoints (all additive; write endpoints answer `persisted: false` with a 200
when persistence is off, so fire-and-forget clients never error):

- `POST /memory/sync` — client-authoritative profile snapshot, replaces the
  user's history and stage stats wholesale. Body: `{userId, handle?, level?,
  method?, history: [...], performance: {...}}`.
- `GET /memory/{userId}` — `{userId, handle, digest, updatedAt}`; the digest is
  a server-computed `MemoryDigest` (port of the frontend's `buildMemoryDigest`
  in `db/service.py::load_digest`). 404 when unknown or persistence is off.
- `POST /attempts` — `{userId, drillId, durationMs, mistakes?, handle?}`;
  returns the user's `bestMs` for the drill. 400 for non-positive durations.
- `GET /leaderboard?drillId=…&limit=10` — best time per user, fastest first.

`POST /narrate/*` and `POST /ask` accept an optional `userId`: a client-sent
`memory` digest always wins, the persisted digest is the fallback when only a
`userId` arrives. No auth: user ids are client-generated UUIDs, so any client
can write any id — a known, accepted hackathon limitation.

Tests point the module at a temp file via `database.init(path)`; the suite's
`conftest.py` disables persistence by default so a configured repo-root `.env`
never leaks into tests.

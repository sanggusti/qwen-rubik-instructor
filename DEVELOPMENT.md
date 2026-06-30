# Developer notes

A practical runbook for working on the Qwen Rubik Instructor. For *what* the
project is, see [`README.md`](./README.md); for the design story, see
[`docs/`](./docs/README.md).

## Prerequisites

- **Node.js 18+** and npm (frontend)
- **Python 3.10+** (backend; optional — the app runs without it)
- A **DashScope API key** (`DASHSCOPE_API_KEY`) only if you want live Qwen
  narration / generation. Without it the app falls back to deterministic text.

## Run the frontend (Vite dev server)

```bash
npm install        # installs the frontend workspace too
npm run dev        # http://localhost:5173
```

The frontend is fully usable on its own: drive the cube, take the hand-authored
lessons and drills, and exercise the client-side learner memory (it lives in
`localStorage` under `rubik-profile` — clear that key to reset your progress).

**Stop the dev server:** `Ctrl-C` in its terminal, or if it's detached:

```bash
lsof -ti tcp:5173 | xargs kill   # kill whatever is serving on :5173
```

## Run the backend (only for the Qwen features)

Powers "Solve my cube (Qwen)", "Lesson from my cube (Qwen)", and "Ask Qwen".

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
DASHSCOPE_API_KEY=sk-... .venv/bin/uvicorn main:app --port 8000
```

- The frontend talks to `http://localhost:8000` by default; override with
  `PUBLIC_BACKEND_URL` (set in `frontend/.env`).
- Default model `qwen-plus` narrates fast (~5s/frame). For ~6× slower but
  deeper *reasoning* narration set `QWEN_MODEL=qwen3.7-plus`.
- DashScope is OpenAI-compatible; the client points at the intl base URL in
  `backend/config.py`.

## Tests

```bash
# Frontend (Vitest)
npm test                       # from repo root (runs the frontend workspace)

# Backend (pytest) — offline; LLM calls are stubbed
cd backend && .venv/bin/pytest -q
# Live smoke test against real DashScope (needs a key):
cd backend && .venv/bin/pytest -q -m live
```

Type-check the frontend without emitting:

```bash
npm --prefix frontend exec tsc -- --noEmit
```

## Layout

- `frontend/src/scene` — Three.js cube, animation, scramble.
- `frontend/src/education` — learner logic: lessons, drills, **profile/memory**
  (`profile.ts`), and the next-step **recommendation** (`recommendation.ts`).
- `frontend/src/ui` — DOM panels (HUD, lessons, practice, explore, "You").
- `backend/narrative` — deterministic plan (`planner.py`) + Qwen narration
  (`llm_narrator.py`) guarded by `validator.py` (no invented moves).
- `backend/pipeline` — cube state (`facelet.py`) and the LBL solver.

## Gotchas

- **The backend dependency `rubik_cube` imports as `rubik`** (`from rubik.cube
  import Cube`). It installs fine from `requirements.txt`; an earlier "module
  missing" scare was wrong.
- **The cube engine is ported twice** — `core/state.ts` (TS) and
  `pipeline/cube/facelet.py` (Python) are kept in lockstep and cross-validated;
  if you change one, change the other.
- **HTML `hidden` loses to the panels' CSS `display` rules.** Toggle visibility
  with inline `style.display`, not the `hidden` attribute (see `lessons_panel.ts`).
- **Learner memory is client-side and stateless on the backend.** The backend
  receives a compact `MemoryDigest` per request and never persists it.

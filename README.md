# Qwen Rubik Instructor

An interactive, browser-based Rubik's Cube tutor. You turn a real 3D cube —
drag, keyboard, or touch — and **Qwen** teaches on top of it: generated
lessons from your live cube state, narrated solve walkthroughs, grounded
mid-lesson Q&A, and a memory that remembers how you're doing across sessions.

**Live at [rubik.suryatresna.asia](https://rubik.suryatresna.asia)** · built for
the Qwen Cloud Hackathon (MemoryAgent track).

![Qwen narrating and solving a scrambled cube](./docs/images/qwen-solve-my-cube.gif)

## Features

- **A real cube** — drag a face or use full notation (`U D L R F B`, slices
  `M E S`, rotations `x y z`, `Shift` for prime). Works entirely offline.
- **Qwen-generated teaching** — "Lesson from my cube" and "Solve my cube"
  stream narrated, animated plans for your exact cube state over SSE. A
  layer-by-layer solver builds the plan; Qwen only writes the words
  (*deterministic skeleton, generative skin* — narration can never invent a
  move the plan doesn't contain).
- **Hints, checkpoints, Ask Qwen** — every lesson step ships hints, keeps a
  cube-state checkpoint you can return to, and takes free-form questions
  answered against your live cube. A "Show me how" reference cube demonstrates
  moves without touching yours.
- **Learner memory with forgetting** — mastery, struggles, and review timing
  tracked in the browser, decayed over time, and injected into every prompt
  under a strict budget. Optionally mirrored to Turso/libSQL so Qwen remembers
  you across devices.
- **Practice drills & leaderboards** — graded against the cube (not your move
  transcript), with timed solves ranked per drill.
- **Challenge Me** — a full-cube race with Google sign-in, a server-side
  clock (the client never reports its own time), anti-cheat handling, and a
  public leaderboard on the landing page.
- **Session review canvas** — every narrated solve is captured as it streams
  and replayed at `/review` as a scroll-scrubbed tour: the scramble, each
  solver checkpoint with Qwen's original narration and full move notation,
  through to solved — designed to be followed on a **real physical cube**.
  Plays hands-free (play/pause/replay), works on the phone, and mirrors to
  Turso so the review follows you across devices.

![The review canvas replaying a captured solve](./docs/images/review-tour.gif)

## Quick start

Requires **Node.js 20.19+** (or 22.12+/24+) and **Python 3.10+**.

```bash
# Frontend — http://localhost:5173
echo 'PUBLIC_BACKEND_URL=http://localhost:8000' > frontend/.env
npm install
npm run dev

# Backend — powers the Qwen features
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DASHSCOPE_API_KEY=sk-... .venv/bin/uvicorn main:app --port 8000
```

The cube and hand-authored lessons work without the backend; Qwen generation
needs it (a DashScope key — Alibaba Cloud, OpenAI-compatible). Everything else
is optional and degrades gracefully:

| Env var (backend `.env`) | Enables |
| --- | --- |
| `DASHSCOPE_API_KEY` | Qwen narration & Q&A (falls back to deterministic text without it) |
| `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN` for cloud) | cross-session learner memory & leaderboards |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Challenge Me sign-in |

## Controls

| Action | Input |
| --- | --- |
| Rotate a layer | Drag a face |
| Face turns / slices / rotations | `U D L R F B` / `M E S` / `x y z` |
| Counter-clockwise (prime) | `Shift` + key |
| Scramble / Reset | `Space` / `Enter` |

## Architecture

SvelteKit + Threlte frontend, FastAPI backend, DashScope (Qwen), Google
OAuth, Turso/libSQL. Deployed as three containers (Caddy TLS → nginx frontend
+ uvicorn backend) on an Alibaba Cloud Simple Application Server via
`docker-compose.yml`.

Diagrams for the whole system — services, narration pipeline, memory system,
challenge/auth, deployment, data model — live in
[`docs/diagrams/`](./docs/diagrams/) and are walked through with screenshots
in [the architecture & feature tour](./docs/16-architecture-and-feature-tour.md).

## Tests

Backend 747 tests · frontend 260 unit tests · 29 Playwright E2E specs
(desktop + mobile), running the real stack with the LLM pinned to its
deterministic fallback — no API bill.

```bash
npm run test                                # frontend unit (Vitest)
cd frontend && npx playwright test          # E2E (desktop + mobile)
cd backend && .venv/bin/pytest              # backend
```

## Engineering notes

How this was built — the memory design, the curriculum, the grading fixes,
the SvelteKit rewrite, the E2E strategy, auth, the deployment, and the review
canvas — is a 17-part blog series in [`docs/`](./docs/README.md).

## License

See [LICENSE](LICENSE).

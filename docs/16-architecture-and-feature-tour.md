# The architecture, drawn — and a tour of everything the app can do

Parts 1–15 tell the story in the order it happened. This post is the opposite:
the whole system as it stands on 2026-07-04, drawn as diagrams and walked as
screenshots. Everything below was captured from a live local run — backend on
`:8000` with a real `DASHSCOPE_API_KEY` and a local libSQL file, frontend on
`:5173` — so the Qwen prose in the screenshots is real narration, not the
deterministic fallback. The diagrams live in [`diagrams/`](./diagrams/) as
editable draw.io sources with exported PNGs.

## The system in one picture

![System context](./diagrams/01-system-context.png)

Three external services, one boundary that matters. The browser owns the
experience — the Three.js cube, the lessons, the drills, and the learner's
profile — and works fully offline. The FastAPI backend adds the generative
layer (Qwen narration and grounded Q&A via DashScope), cross-device memory and
leaderboards (Turso/libSQL), and identity for the challenge mode (Google
OAuth). Every backend dependency has a degradation path; none of them can take
the cube down.

## Backend services: the throughline, drawn

![Backend services](./diagrams/02-backend-services.png)

This is Part 2's and Part 3's "deterministic skeleton, generative skin"
boundary as module boxes. The green column can't be broken by the LLM: the
facelet engine is a bit-for-bit port of the frontend's `state.ts`
(cross-validated Node↔Python), the layer-by-layer solver replays every
solution on that engine and asserts it solved, and the planner turns either a
live cube state or a curated topic into a `VisualPlan` whose frames carry
exact moves. The orange column only writes words over that plan — and the
validator (Part 3) rejects any narration that mentions a move the frame
doesn't contain, swapping in a deterministic template instead.

## The narration pipeline

![Narration sequence](./diagrams/03-narration-sequence.png)

The flow behind "Solve my cube (Qwen)" and "Lesson from my cube (Qwen)".
Two details from earlier posts are visible here: frames narrate concurrently
on a thread pool and stream as they finish (Part 9's `submit`-not-`map` fix —
first beat in ~1s instead of after the whole solve), and the memory digest
rides into every frame prompt under a 240-character budget (Part 6).

What it looks like from the learner's side — a lesson generated from a live
scrambled cube, opening with the memory-aware welcome line:

![Qwen lesson from my cube](./images/qwen-lesson-step1.png)

And the walkthrough player teaching on the reference cube (Part 11), with the
full move sequence and narration pacing the animation:

![Qwen walkthrough](./images/qwen-walkthrough.png)

"Solve my cube" then applies the plan to the learner's cube — this run solved
a 26-move scramble in 176 narrated moves, verified solved by the engine:

![Walkthrough solving the learner's cube](./images/qwen-walkthrough-solving.png)

## The memory system

![Memory system](./diagrams/04-memory-system.png)

Part 6 built the decay/forgetting model client-side; Part 13 gave it a
server-side mirror without moving authority. The browser remains the source of
truth — `/memory/sync` replaces the server copy wholesale, and the digest
logic exists on *both* sides of the mirror (ported twice, deliberately) so a
returning learner on a new device still gets "Welcome back" from the server
copy. The kill switch is an empty `TURSO_DATABASE_URL`: persistence quietly
no-ops and Qwen falls back to the client-sent digest.

## Hints and grounded Q&A

![Hint flow](./diagrams/05-hint-flow.png)

Two paths, both grounded in the same rule — the model can explain, but it
cannot invent moves. Step hints arrive with every streamed lesson step;
"Ask Qwen" sends the live facelets and the current step with the question, so
answers reference the actual cube. Here's the lesson runner mid-step, with the
hint box, the checkpoint controls, and the Ask box in one caption:

![Lesson runner](./images/lesson-runner.png)

"Show me how" opens Part 10's reference cube window, seeded from facelets, so
demonstrations never touch the learner's cube:

![Demo cube window](./images/lesson-demo-window.png)

And a real Ask Qwen exchange, answered from the live state:

![Ask Qwen](./images/ask-qwen-hint.png)

## Challenge mode and auth

![Challenge and auth sequence](./diagrams/06-challenge-auth-sequence.png)

Part 14's design in one sequence: Google's code flow terminates in FastAPI,
tokens are opaque 30-day UUIDs, and — the part that makes the leaderboard
honest — the clock lives on the server. `/challenge/start` issues a
single-use session key with a server timestamp; `/challenge/score` redeems it
atomically and computes the time itself. The client never reports a duration.

The flow as the learner sees it — sign-in gate, username claim, the stripped-
down HUD during a run (only the timer and "Give Up!", because everything else
is anti-cheat surface), and the result modal:

![Challenge sign-in](./images/challenge-auth-modal.png)

![Pick a username](./images/challenge-username-step.png)

![Challenge running](./images/challenge-running.png)

![Solved — leaderboard modal](./images/challenge-solved-leaderboard.png)

The same leaderboard feeds the landing page section:

![Landing leaderboard](./images/landing-leaderboard-live.png)

## Deployment

![Deployment](./diagrams/07-deployment.png)

Part 15's "one box, three containers", drawn. Caddy owns the only published
ports and its own TLS; the frontend is static nginx; the backend talks to
DashScope and Turso. The yellow box is the honest part: the auth env vars
still aren't wired into compose, so challenge mode 503s in prod until they
are, and the root Caddyfile is dead config.

## The data model

![Data model](./diagrams/08-data-model.png)

Eight tables across four migrations, in two deliberately separate families:
anonymous learner memory keyed by a client-generated UUID (Parts 2/13), and
the Google-authenticated challenge identity (Part 14). They are never merged —
drill memory doesn't need a name, and a leaderboard name doesn't need your
learning history.

## The tour, end to end

The rest of the app, as screenshots from the same live session.

**Landing** — the scroll-scrubbed cube (it plays a real solver sequence as
you scroll, and parks itself beside each section):

![Landing hero](./images/landing-hero.png)

![Landing content section](./images/landing-content-section.png)

**The play surface** — cube, first-visit controls hint, and the rail
(Challenge Me, Guide, Scramble, Reset):

![Play default](./images/play-default.png)

**The Guide dock** — five tabs, one experience at a time:

![Lessons panel](./images/panel-lessons.png)

![Practice panel](./images/panel-practice.png)

![Explore panel](./images/panel-explore.png)

![State panel](./images/panel-state.png)

![Level panel](./images/panel-level.png)

**Practice drills** — live evaluation against the cube (Part 7's fix: graded
on cube state, not the move transcript), with scoring and a per-drill summary:

![Drill complete](./images/drill-complete.png)

![Practice drill summary](./images/practice-drill-summary.png)

## Reference tables

### Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/health` | liveness | — |
| GET | `/topics` | walkthrough + lesson topic ids | — |
| POST | `/narrate/walkthrough` | stream a narrated solve plan (SSE) | — |
| POST | `/narrate/lesson` | stream a generated lesson (SSE) | — |
| POST | `/solve` | flat move list for the current cube | — |
| POST | `/ask` | grounded mid-lesson Q&A | — |
| POST | `/memory/sync` | client-authoritative profile snapshot | — |
| GET | `/memory/{user_id}` | persisted memory + digest | — |
| POST | `/attempts` | log a timed drill solve | — |
| GET | `/leaderboard` | per-drill anonymous leaderboard | — |
| GET | `/auth/google` → `/auth/callback` | Google code flow | — |
| GET | `/auth/me` · POST `/auth/username` · POST `/auth/logout` | member session | Bearer |
| POST | `/challenge/start` · `/challenge/score` | server-timed challenge run | Bearer |
| GET | `/challenge/leaderboard` | public challenge leaderboard | — |

### Environment and degradation

| Variable | Without it |
|---|---|
| `DASHSCOPE_API_KEY` | narration/Q&A fall back to deterministic templates; app stays fully usable |
| `QWEN_MODEL` (default `qwen-plus`) | default holds; `qwen3.7-plus` is the slow deep-reasoning option (Part 9) |
| `TURSO_DATABASE_URL` | kill switch: persistence no-ops, `/auth/*` + `/challenge/*` return 503, memory stays browser-local |
| `TURSO_AUTH_TOKEN` | only needed for `libsql://` cloud URLs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | auth + challenge 503; everything else unaffected |
| `PUBLIC_BACKEND_URL` (frontend, build-time) | required — the SvelteKit build fails without it (Part 8) |

## How this post was made

The screenshots are a scripted Playwright pass over the running app; the
challenge-mode shots use Part 14's E2E trick (a member row and a minted token
in the local dev DB) rather than a real Google round-trip, which also means
the `docs_demo` leaderboard entry you see is seeded demo data. The diagrams
are hand-authored draw.io XML — sources next to the PNGs in
[`diagrams/`](./diagrams/), so they can be edited instead of redrawn.

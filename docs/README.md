# Engineering notes — turning a Rubik's cube prototype into a learn-with-LLM tutor

These are working notes written to become technical blog posts. They cover a
single, real piece of work: taking the Qwen Rubik Instructor from a polished
*interaction prototype* (a 3D cube you can play with, plus a Qwen narration
backend) into something a human can actually **learn to solve a cube with** —
where the LLM remembers how you're doing and adapts.

The work landed in five incremental phases on 2026-06-29, followed by two
focused fixes (Parts 4–5) on the same headline feature, a pivot (Part 6) to make
the memory good enough for the **Qwen Cloud Hackathon → MemoryAgent track**, and a
cynical QA pass (Part 7) that caught the grader scoring the wrong thing. On
2026-06-30 the front end was rewritten onto SvelteKit (Part 8) and a QA pass on
the live app found and fixed why narration felt slow (Part 9). On 2026-07-01 the
hint surface grew a **reference cube** — a "Show me how" window seeded from
facelets (Part 10) — and two rounds of live-UI feedback rebuilt the walkthrough
player to teach on that cube and leave the learner's alone (Part 11). On
2026-07-02 the whole learner journey finally got browser-level coverage: a
Playwright E2E suite that runs the real backend with the LLM pinned to its
deterministic fallback, a human QA pass on top of it, and a phone-emulation
pass — together surfacing (and fixing) bugs no unit test could see (Part 12).
On 2026-07-03 learner memory grew a server-side home: an optional Turso/libSQL
mirror behind a single env var, with the browser staying authoritative and a
timed-solve leaderboard on top (Part 13). On 2026-07-04 the app got its first
real identity: a "Challenge Me" full-cube timed mode with Google sign-in,
opaque bearer tokens, an anti-cheat state machine, and a public leaderboard on
the landing page (Part 14). Alongside it, the stack left the laptop: multi-stage
Docker images, a tag-triggered build-and-push pipeline, and a `v1.0.0`
docker-compose deployment onto an Alibaba Cloud VPS behind Caddy-managed HTTPS,
live at rubik.suryatresna.asia (Part 15). The promised architecture post then
landed as Part 16: eight draw.io diagrams and a screenshot tour captured from
a live run. Every phase shipped with tests; the current state
is backend 739 tests, frontend 238 unit tests plus 25 E2E specs (desktop +
mobile projects), all green, plus live model calls and in-browser checks
confirming the end-to-end loop.

## The posts

1. **[The critique: verify before you build](./01-the-critique-verify-before-you-build.md)**
   How a confident "the backend is broken" finding turned out to be wrong, why
   that matters, and the three problems that were *actually* worth fixing.

2. **[Giving Qwen a memory](./02-giving-qwen-a-memory.md)**
   The system was stateless: it received a learner's history and used only its
   *length*. How we captured real performance signals client-side and fed a
   compact digest to the model so it could remember and adapt — without adding a
   database.

3. **[Teaching correctness: a verified curriculum and grounded Q&A](./03-teaching-correctness-curriculum-and-grounded-qa.md)**
   A beginner couldn't actually learn to solve from the static catalog. How we
   authored a full layer-by-layer curriculum whose every algorithm is
   machine-verified, and a mid-lesson "ask Qwen" that can't hallucinate moves.

4. **[De-bloating the solve: making a correct solver human-followable](./04-debloating-the-solve-human-followable-moves.md)**
   The "Solve my cube" feature was provably correct and completely unfollowable —
   246 moves and 32 whole-cube rotations for a 13-move scramble. Eliminating the
   rotations by conjugation, verifying it against the engine, and being honest
   about the half of the problem it didn't fix.

5. **[The stuck lesson: the bug is rarely where the survey says](./05-the-stuck-lesson-reproduce-in-the-real-ui.md)**
   "Lesson from my cube has no Next button." A code-survey confidently blamed a
   backend crash that didn't exist; the real defect was three layout decisions and
   a CSS-specificity quirk that only the browser could reveal.

6. **[The MemoryAgent pivot: teaching the tutor to forget](./06-the-memoryagent-pivot-forgetting-and-mastery.md)**
   Held against the MemoryAgent track's rubric — efficient retrieval, *timely
   forgetting*, budgeted recall — our memory was a log, not a memory. Adding a
   decay curve (finally using the `lastAt` we'd ignored), relevance-ranked
   retrieval, a budgeted injection, a *mastery-before-progression* next-step
   decision, and a "What I remember" view that makes it all legible.

7. **[The tutor that lied: grading against the cube, not the move log](./07-the-tutor-that-lied-grading-against-the-cube.md)**
   A cynical QA pass found the grader checking the learner's *transcript* instead
   of their cube: a wrong move then "Apply moves" scored as "correct," and the
   flagship solve lesson couldn't grade or hint at all. Gating completion on cube
   state, a `cubeState` validator that carries each stage's target, and a
   "run it and look" verification that hit a frozen-`requestAnimationFrame` wall.

8. **[From a Vite SPA to SvelteKit: a rewrite the engines made safe](./08-from-vite-spa-to-sveltekit-a-rewrite-the-engines-made-safe.md)**
   The vanilla-TS front end was rewritten onto SvelteKit + Threlte. Why it was
   cheap — the framework-agnostic cube model and learning engines ported verbatim,
   so only the *skin* changed — and the three rocks the post-merge bring-up tripped
   on: a ghost `node_modules`, Node in the unsupported version gap, and a strict
   `$env/static/public` import with no value.

9. **[The narration that felt slow: measure before you fix](./09-the-narration-that-felt-slow-measure-before-you-fix.md)**
   "Qwen narration takes too long," with no instrument to confirm it. Adding
   per-call latency + token logging surfaced two unrelated causes — a reasoning
   model defaulted-on (~33s/frame), and an SSE stream that `list(pool.map(...))`
   quietly turned into a wait-for-everything barrier. A model default and `submit`
   instead of `map`; first beat now lands in ~1s.

10. **[Show, don't tell: a reference cube seeded from facelets](./10-show-dont-tell-a-reference-cube-seeded-from-facelets.md)**
    Hints were words about moves you couldn't see. A dimmed "Show me how" cube in
    a floating window fixes that — but only if you can put an *arbitrary* state on
    a fresh cube. Painting stickers instead of solving, a coordinate→facelet-index
    map derived from the engine's own move cycles, and a test that proves the map
    against the animator's geometry rather than itself.

11. **[The feedback that rebuilt the player: teach on the reference cube, not the learner's](./11-the-feedback-that-rebuilt-the-player.md)**
    Two rounds of "watch it in the real UI" took the first cut apart: a "self-
    contained" solve plan made the learner wait ~13s to rebuild a scramble they
    already had (fixed with `startFromCurrent`), and a stuck highlight on the
    learner's cube exposed the wrong default — the walkthrough should drive the
    *reference* cube, not theirs. Re-pointing the engine's cube API at the window,
    moving highlights with it, and gating the learner's cube behind "Solve my cube"
    / "Reset to checkpoint."

12. **[Playable and learnable: an E2E suite that plays the whole game (without the API bill)](./12-playable-and-learnable-e2e-without-the-api-bill.md)**
    The learner journey had 948 unit tests and zero browser coverage. Running
    the real stack with the LLM pinned to its deterministic fallback (a dummy
    key and an unroutable base URL), a 3-line window hook instead of thirty
    test-ids, and a "money test" that scrambles, streams a narrated solve, and
    asserts the cube actually ends solved. The browser found what units
    couldn't: a 500 wearing a CORS mask, a typewriter frozen by its own effect
    teardown, a backdrop eating visible clicks — then a human pass and real
    phone emulation each found what the green suite couldn't.

13. **[Memory that outlives the browser: a Turso mirror with a kill switch](./13-memory-that-outlives-the-browser-turso-with-a-kill-switch.md)**
    The client-side memory was a guarantee worth keeping, so the database is a
    *mirror*: whole-profile snapshot sync keyed by an identity that was already
    there, an empty env var as the kill switch (the same emergent-fallback
    pattern the LLM uses), a client-digest-always-wins precedence rule that left
    the narrator untouched, and a timed-solve leaderboard. Plus two finds: an
    upsert that `COALESCE(excluded.x, x)` quietly broke, and a stage stat the
    mirror revealed had never been written at all.

14. **[Challenge Me: Google auth and a leaderboard with a clock](./14-challenge-me-google-auth-and-a-leaderboard-with-a-clock.md)**
    Part 13's leaderboard was honest about being spoofable; a public, raceable
    one needs names that belong to someone. Google's code flow terminated in
    FastAPI, opaque 30-day tokens (no JWTs, no refresh), a members table kept
    deliberately separate from the anonymous learner id — and the cheat almost
    shipped: `isSolved` doesn't know Reset restored the solved state, so
    anything the challenge didn't initiate cancels the run. Plus the landing
    scene's parked cube flying through the new section, and an E2E pass that
    verifies the whole login flow without ever touching Google.

15. **[One box, three containers: deploying the stack to Alibaba Cloud](./15-one-box-three-containers-deploying-to-alibaba-cloud.md)**
    The hackathon requires the stack to run on Alibaba infrastructure, not a
    laptop. Two multi-stage Docker images, a three-service compose file where
    Caddy owns the only published ports and provisions its own TLS, and a
    tag-to-deploy pipeline that ends in `docker compose pull` over SSH — onto a
    2-vCPU Simple Application Server idling at a quarter of its RAM. Plus the
    `api${DOMAIN}` no-dot quirk that shipped as a decision, and the gaps: a
    dead Caddyfile, `:latest` deploys, and Part 14's auth vars not yet in
    compose.

16. **[The architecture, drawn — and a tour of everything the app can do](./16-architecture-and-feature-tour.md)**
    The whole system as it stands, as eight draw.io diagrams (system context,
    services, narration pipeline, memory system, hints, challenge/auth,
    deployment, data model — sources in [`diagrams/`](./diagrams/)) and a
    screenshot tour captured from a live run with real Qwen narration: lessons,
    hints, checkpoints, drills, and the full challenge-mode loop through to the
    leaderboard.

## Still to come (intentions, not yet code)

The MemoryAgent submission also requires infrastructure and storytelling that
lives outside the app, tracked as the next posts:

17. **The 3-minute demo** — the cross-session memory loop, end to end.

## Research (design notes)

- **[Turso (libSQL) as the persistent-memory layer](./research/turso-persistent-memory.md)**
  The design note that became Part 13: the case for Turso and a low-blast-radius
  design to persist learner memory server-side while keeping the browser-local
  path working as a fallback. The core (schema, optional config, digest
  fallback) shipped; the *semantic recall* layer it sketches remains future
  work.

## The throughline

If there's one theme: **deterministic skeleton, generative skin.** The cube
math, the solve, the curriculum algorithms, and the move-grounding are all
deterministic and tested. The LLM only ever writes *words* over a structure it
cannot break. That boundary is what makes an LLM tutor trustworthy instead of
plausibly wrong.

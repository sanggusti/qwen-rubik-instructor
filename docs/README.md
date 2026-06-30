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
the live app found and fixed why narration felt slow (Part 9). Every phase shipped
with tests; the current state is backend 709 tests, frontend 202 tests, all green,
plus live model calls and in-browser checks confirming the end-to-end loop.

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

## Still to come (intentions, not yet code)

The MemoryAgent submission also requires infrastructure and storytelling that
lives outside the app, tracked as the next posts:

10. **Deploying the backend to Alibaba Cloud** — moving the local `uvicorn`
    service onto Alibaba Cloud (Function Compute / ECS) with proof of the Alibaba
    services in use. Today the only Alibaba usage is the DashScope call to Qwen.
11. **The architecture diagram** — Qwen Cloud → backend → frontend, and where the
    client-side memory lives.
12. **The 3-minute demo** — the cross-session memory loop, end to end.

## The throughline

If there's one theme: **deterministic skeleton, generative skin.** The cube
math, the solve, the curriculum algorithms, and the move-grounding are all
deterministic and tested. The LLM only ever writes *words* over a structure it
cannot break. That boundary is what makes an LLM tutor trustworthy instead of
plausibly wrong.

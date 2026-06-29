# Engineering notes — turning a Rubik's cube prototype into a learn-with-LLM tutor

These are working notes written to become technical blog posts. They cover a
single, real piece of work: taking the Qwen Rubik Instructor from a polished
*interaction prototype* (a 3D cube you can play with, plus a Qwen narration
backend) into something a human can actually **learn to solve a cube with** —
where the LLM remembers how you're doing and adapts.

The work landed in five incremental phases on 2026-06-29, followed by two
focused fixes (Parts 4–5) on the same headline feature. Every phase shipped with
tests; the current state is backend 698 tests, frontend 162 tests, all green,
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

## The throughline

If there's one theme: **deterministic skeleton, generative skin.** The cube
math, the solve, the curriculum algorithms, and the move-grounding are all
deterministic and tested. The LLM only ever writes *words* over a structure it
cannot break. That boundary is what makes an LLM tutor trustworthy instead of
plausibly wrong.

# The MemoryAgent pivot: teaching the tutor to forget

*Part 6 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The frame changes

Parts 1–5 built a tutor that *remembers* how you're doing and adapts. Part 2,
["Giving Qwen a memory"](./02-giving-qwen-a-memory.md), captured per-stage
performance client-side and fed a compact digest to the model. Good enough to
personalise narration — not good enough for what we're entering it into.

The target is the **Qwen Cloud Hackathon → MemoryAgent track**. That track doesn't
reward "has a memory." It rewards three specific properties:

1. **Efficient storage and retrieval** — recall the *relevant* memories, not all of them.
2. **Timely forgetting of outdated information** — let stale memory decay and drop.
3. **Recalling critical memories within a limited context window** — budget what you inject.

…while making **increasingly accurate decisions across sessions.**

Held against that rubric, our memory scored poorly — and the gap was instructive.

## The critique: ingredients, not a memory

We had the *ingredients* and almost none of the behaviour:

- `buildMemoryDigest` dumped the top-3 struggles by raw cumulative mistake count
  **plus every mastered label**. No relevance ranking, no notion of "retrieval."
- There was **no forgetting**. The `StageStat.lastAt` timestamp was written on
  every attempt and *never read*. `mastered` was permanent. A struggle from six
  months ago looked identical to yesterday's.
- The memory block was injected into the prompt **whole** — narration text was
  word-budgeted, but the memory itself had no cap.
- And the agent never actually *decided* anything from memory. Lesson gating was
  by "prereq attempted," not by what the learner was weak at.

A memory that never forgets and never chooses isn't a memory. It's a log.

## What we built

All client-side — the backend stays stateless, no database — keyed on the
timestamp we were already storing and ignoring.

**Forgetting, finally using `lastAt`.** A struggle's weight now decays on a
14-day half-life: `decayedWeight = mistakes × 0.5^(age / halfLife)`. Recent pain
stays sharp; old pain fades. Struggles whose faded weight drops below a threshold
are **forgotten** — dropped from the digest entirely. The other direction of
forgetting is spaced repetition: a *mastered* skill left idle past 21 days
resurfaces as **due for review** (mastery itself stays sticky — we flag staleness,
we don't un-teach).

**Retrieval, not a dump.** `buildMemoryDigest(profile, { now, context })` ranks
unmastered struggles by faded weight, with a large bonus when a stage matches what
the learner is doing *right now* (`context`), so the relevant memory surfaces
first. The mastered list is bounded; a new `dueForReview` list is emitted.

**A budgeted injection.** The backend caps the per-frame memory block to a small
character budget and orders it stage-specific-note-first, so the most relevant
memory survives truncation instead of being crowded out by a generic welcome.

**A decision.** A new `recommendation.ts` turns all of this into one next-step
choice, surfaced as a ★ Recommended item atop the lesson list and in the learner's
profile panel.

## The decision that mattered: mastery before progression

The recommender had a fork, and it's the pedagogically loaded one. Among a
learner's unmastered lessons, which do you point them at?

- **Biggest weakness first** — the lesson with the most mistakes.
- **Earliest on the path first** — master the foundations in order before advancing.

For a layer-by-layer method these aren't equivalent. Practising the last-layer
permutation while your *cross* is still shaky is exactly the trap beginners fall
into. So the policy is explicit and deliberate:

> **Mastery before progression.** The tutor never sends a learner to new material
> while an earlier lesson on the path is still unmastered. It walks the path in
> order and recommends the *first* unmastered lesson. Only once everything
> attempted is mastered does it refresh a stale skill (review), and only then
> move forward to the next new lesson.

A learner who slipped on lesson 1 and raced ahead gets pulled back to lesson 1 —
on purpose. Two regression tests pin this so a future "improvement" can't quietly
reorder it: the earliest unmastered lesson wins over a later higher-mistake one,
and `continue` is never recommended while any earlier lesson is unmastered.

But priority is not a wall. Beginners need small wins, and a hard lock breeds
frustration — so progression stays *possible*, just deliberate. Clicking a lesson
that skips past an unmastered one pops a nudge: *"Mastery first: you haven't
mastered 'Learn the notation' yet. Finishing it cleanly makes 'Your first
sequence' much easier. Continue anyway?"* — with **Master "Learn the notation"
first** as the emphasised choice and a plain **Continue anyway** beside it
(`masteryBlocker` in `recommendation.ts` computes the lesson being skipped). The
tutor states its opinion; the learner keeps the wheel.

## Making the memory legible

A memory the learner can't see is a hard thing to demo and a harder thing to
trust. The old "Level" tab — a persona toggle most people missed — became a
**"You"** panel with a *What I remember* view: sessions, mastered skills, the
struggles still being tracked (with their slip counts), skills due for review, and
the recommendation. A client-side **welcome-back** banner greets returning learners
from the digest alone, so cross-session continuity shows even with the Qwen backend
absent. And a completed lesson now opens with a plain **"You finished this lesson —
Start over"** banner, fixing the Part-5-adjacent confusion of landing on a
"complete" screen with no way to practise again.

## The throughline holds

The series' theme — **deterministic skeleton, generative skin** — extends cleanly.
The forgetting curve, the retrieval ranking, the budget, and the next-step decision
are all deterministic and tested; the model still only ever writes *words* over a
structure it cannot break. The memory got smarter without giving the LLM anything
new to hallucinate.

Verified the usual way: `tsc` clean, frontend Vitest and backend pytest green, and
the loop driven live in the browser — welcome-back banner, the *What I remember*
panel, the ★ recommendation, and start-over all rendering with no console errors.

## What's next (and not in the code yet)

Three submission requirements are deliberately *not* implemented here — they're
infrastructure and storytelling, tracked as intentions:

- **Backend on Alibaba Cloud, with proof.** Today the only Alibaba Cloud usage is
  the DashScope call to Qwen (`backend/config.py`, `backend/narrative/llm_narrator.py`);
  the service still runs as a local `uvicorn`. The submission needs the backend
  deployed on Alibaba Cloud (Function Compute or ECS) plus a short recording and a
  code file demonstrating the Alibaba services it uses.
- **An architecture diagram** — Qwen Cloud → backend → frontend, and where the
  client-side memory lives.
- **A ~3-minute demo video** walking the cross-session memory loop end to end.

Each of these is its own post in this series-as-it-becomes-a-blog: the deployment
write-up, the diagram, and the demo are the natural Parts 7–9.

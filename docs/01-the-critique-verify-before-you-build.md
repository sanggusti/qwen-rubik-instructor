# The critique: verify before you build

*Part 1 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The setup

The Qwen Rubik Instructor started life as an interaction prototype: a live
Three.js cube you can drag and turn, a deterministic layer-by-layer (LBL) solver
on a FastAPI backend, and Qwen (via DashScope) narrating each move as it streams
to the browser over Server-Sent Events. It looked the part. The README's stated
ambition was to make it a place where a human *learns* to solve a cube with an
LLM as the guide.

The task: critique it, run it end to end, and plan the work to deliver on that
ambition.

So before writing a line of feature code, I sent three exploration agents to map
the backend, the frontend learning loop, and the runnability. They came back with
a sharp, well-organized critique. One headline finding:

> **The backend won't run.** `rubik_cube` is listed in `requirements.txt` but not
> installed in the venv — `ModuleNotFoundError: No module named 'rubik_cube'`. The
> solver, and therefore every narration endpoint, fails at runtime.

That's a great find. The headline feature would be dead on a fresh clone. It went
straight into the plan as Phase 0, problem #1.

## The finding was wrong

Before fixing it, I tried to reproduce it. The dependency *was* installed:

```bash
$ .venv/bin/pip install rubik_cube
Requirement already satisfied: rubik_cube ... (0.0.2)

$ .venv/bin/python -c "import rubik_cube"
ModuleNotFoundError: No module named 'rubik_cube'
```

Both true at once. The package installs under the distribution name
`rubik_cube`, but it *imports* as `rubik`:

```python
# pipeline/solver/lbl.py
from rubik.cube import Cube
from rubik.solve import Solver
```

```bash
$ .venv/bin/python -c "import rubik; print('ok')"
ok
```

The original check tested `import rubik_cube` — the wrong module name — saw an
error, and reasonably concluded the package was missing. It wasn't. Running the
actual suite settled it:

```
691 passed, 1 deselected in 7.73s
```

The backend was never broken. A fresh `pip install -r requirements.txt` works.

## Why this is the most important part of the story

It would have been easy to "fix" a non-problem: reinstall a package that was
already there, write a triumphant note about unblocking the build, and move on.
The plan, the tests, even the commit message would all have looked fine. Nothing
would have actually changed, and the real lesson — *the verification step you
trusted had a typo in it* — would have been buried.

A few principles fell out of this that shaped the rest of the project:

- **Reproduce a claimed failure before fixing it.** A `ModuleNotFoundError` is
  not the same as a missing dependency; it's a failed import, which has several
  causes. The distribution-name-vs-import-name gap is a classic one in Python.
- **Run the thing.** A single `pytest` run was worth more than a paragraph of
  inferred breakage. The cheapest source of truth is the one you keep skipping.
- **Report the correction loudly.** I told the user plainly: the "broken" finding
  was wrong, here's the proof, here's what's *actually* left to do. A critique you
  can't correct in public isn't a critique, it's a press release.

What remained of "Phase 0" was real but small: pin the dependency versions for
reproducibility, and fix a genuinely stale README that still said *"no API keys
or backend needed yet"* — a line left over from before the Qwen backend existed,
which would strand any human trying to run the headline feature.

## The three problems that actually mattered

With the phantom problem dismissed, the real gaps were about *learning*, not
*running*. The architecture was excellent at generating narration and terrible at
teaching, because it had no concept of a learner who persists across time.

**1. No memory.** The backend was fully stateless. The client stored a learner
"profile" (level, method, last-10 completion records) and sent its `history` with
each request — but the backend used only its *length*:

```python
# the old continuity logic — note what it does with `history`
history_count = len(req.history or [])
continuity = (
    f"This returning learner has done {history_count} recent session(s); "
    "a brief welcome-back nod is welcome on this first frame only."
    if history_count > 0 else ""
)
```

The actual contents — what you practiced, where you struggled, how long it
took — were never read by anything. The LLM could say "welcome back" but had no
idea what to welcome you back *to*. There was no mistake tracking, no mastery, no
adaptivity. It was content delivery wearing a tutor's clothes.

**2. No method to learn.** The static lesson catalog had four lessons: notation,
one trigger (`R U R' U'`), and two speed drills for people who can already solve.
There was no path from "I just learned what `R` means" to "I solved a scramble."
A beginner following the catalog to the end still couldn't solve a cube.

**3. No rescue.** Coaching could detect when you drifted off a sequence, but it
said the same thing forever and offered no escape hatch — no "show me just the
next move," no way to ask a question. A stuck learner stayed stuck.

## The plan

The user chose a full overhaul, with memory kept **client-side** (extend the
existing `localStorage` pattern; keep the backend stateless and feed it a
structured digest per request). That became five incremental, independently
shippable phases:

- **Phase 0** — make it run (the small, real remainder of the phantom problem).
- **Phase 1** — capture real performance signals, client-side.
- **Phase 2** — feed a compact memory digest to Qwen so it adapts.
- **Phase 3** — mistake detection and rescue.
- **Phase 4** — a full, verified LBL curriculum.
- **Phase 5** — ask Qwen mid-lesson, grounded so it can't hallucinate.

The next two posts cover the interesting engineering: how the memory works
without a database (Part 2), and how the curriculum and Q&A stay correct when an
LLM is in the loop (Part 3).

The meta-lesson from Part 1, though, is the one I'd attach to any AI-assisted
engineering: **the tools that survey your codebase are fast and usually right,
which is exactly why the occasional confident-but-wrong finding is dangerous.**
Reproduce, run, and be willing to delete a problem from your own plan.

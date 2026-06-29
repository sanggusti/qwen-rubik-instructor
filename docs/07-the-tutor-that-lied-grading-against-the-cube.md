# The tutor that lied: grading against the cube, not the move log

*Part 7 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The QA pass that went looking for lies

By Part 6 the tutor remembered you, adapted, recommended a next step, and could
narrate your exact cube layer by layer. Time to be cynical about it. The brief was
a human-perspective, end-to-end QA pass with one pointed question:

> Could a learner actually follow this? If they make a wrong move, do the hints
> still help? And if they fumble and then just mash "Apply moves" — does it still
> say they got it right?

That last question is the one that matters, because the failure mode it describes
isn't a crash. It's a tutor that smiles and tells you "correct" while your cube is
a mess. A crash you'd notice. A lie you'd *learn from*.

Three exploration agents traced the lesson flow, the practice flow, and the
move/state-tracking logic. They converged on the same answer, and it was the bad
one: **yes, the tutor lies.**

## Bug one: graded the move log, never the cube

Every move-sequence step decided completion the same way — did the recent moves
*end with* the expected sequence?

```ts
// lesson_validator.ts (before)
case 'moveSequence':
    return endsWithMoves(moveHistory, step.validator.moves);
```

`endsWithMoves` is a pure suffix check. It never looks at the cube. So:

1. The lesson wants `R U R' U'`.
2. You do a stray `L` — the cube is now scrambled wrong.
3. You do `R U R' U'` anyway.
4. History is `[L, R, U, R', U']`, which *ends with* the expected four → **complete.**

And it's worse than a manual fumble, because "Apply example moves" literally
appends the expected sequence to your history:

```ts
applyExampleMoves(): void {
    const step = this.getCurrentStep();
    if (!step?.expectedMoves?.length) return;
    this.api.applyMoves(step.expectedMoves);  // history now ends with them
}
```

So the exact thing a stuck beginner does — make a mess, then click "Apply
moves" — guarantees a false "correct." The cube is unsolved; the tutor congratulates
you. And because a clean completion is what the Part-6 memory treats as *mastery*,
the lie doesn't just mislead the learner — it poisons the model's record of them.

This is the series' Part-3 doctrine — **let the deterministic engine grade the
homework** — except here it had quietly *not* been applied. The grader was reading
the transcript, not the work.

## The fix, with one load-bearing nuance

The obvious patch is "also require the cube to be solved." But not every
move-sequence step is a return-to-solved drill. The notation lessons (`do an R`)
and the trigger drills deliberately leave the cube scrambled — they're graded on
execution, not on solving. The discriminator is **setup**: a drill that scrambles
with `setupMoves` (the inverse of the algorithm) is the one that must end solved.

```ts
// lesson_validator.ts (after)
case 'moveSequence':
    if (!endsWithMoves(moveHistory, step.validator.moves)) return false;
    // A setup-based drill scrambles with the inverse of the algorithm, so
    // performing it must also return the cube to solved. Gate on cube state too,
    // or a stray move (or "Apply example moves" onto an off-track cube) would
    // complete the step on an unsolved cube.
    return step.setupMoves?.length ? isSolved(state) : true;
```

The same gate went into the practice evaluator. And to keep the gate honest, the
lesson engine now **auto-applies a step's setup on entry** (the practice engine
already did), so the drill starts from a known position instead of relying on the
learner to press "Set up step" first. The coaching got a new line for the case the
gate newly catches — right moves, wrong cube — so the learner isn't silently
stuck:

> *Right moves, but the cube isn't solved — an earlier move knocked it off.
> Reset the cube, run "Set up step", then do the sequence again.*

Three regression tests pin the lie shut, including the literal one from the brief:
a wrong move, then "Apply example moves," must **not** complete.

## Bug two: the flagship lesson couldn't grade at all

The headline feature — "Solve your cube, step by step (Qwen)" — was worse off,
and in a quieter way. Its stages were all `manual` validators. A `manual` step
never auto-completes; it waits for a **Mark complete** button. Which meant:

- You could click Mark-complete → Mark-complete → … straight through a fully
  scrambled cube and the lesson would declare itself finished.
- `nextExpectedMove()` returned `null` for non-sequence steps, so **"Show next
  move" never rendered** on the one feature most likely to leave a beginner stuck.
- `countMistake()` early-returned for non-sequence steps, so the stage recorded
  **`mistakes: 0` no matter how badly you flailed** — and the entire Part-6
  MemoryAgent story (forgetting, mastery, recommendation) ran on a number that was
  always zero for the flagship flow.

The cause was upstream, in how a solve frame became a lesson step:

```python
# merge.py (before): a solve stage has no setup → falls through to manual
if frame.setup_moves:
    validator = MoveSequenceValidator(moves=frame.moves)
elif frame.moves:
    validator = ManualValidator()   # ← every solve stage landed here
```

A solve stage *can't* be graded as a sequence — performing it doesn't return to
solved, it advances to a partial state. What it needs is the one thing the backend
already computes and threw away: **the exact cube state that stage should reach.**

## The fix: a state-target validator

The deterministic skeleton already knows everything. The solver applies each
stage's moves; we just had to snapshot the cube after each one and carry it
through. A new validator type holds that target:

```python
# schema.py
class CubeStateValidator(CamelModel):
    type: Literal["cubeState"] = "cubeState"
    expected: dict[str, list[str]]   # the cube state after this stage's moves
```

```python
# planner.py — track the cube as each stage's moves are performed
cursor = clone_state(state)
for stage in stages:
    if not stage.moves:
        continue
    apply_moves(cursor, stage.moves)
    frames.append(VisualFrame(..., expected_state=clone_state(cursor)))
```

```python
# merge.py (after): a solve stage grades against the state it should reach
if frame.setup_moves:
    validator = MoveSequenceValidator(moves=frame.moves)
elif frame.expected_state is not None:
    validator = CubeStateValidator(expected=frame.expected_state)
else:
    validator = ManualValidator()   # only the intro frame now
```

The frontend mirrors the type (the two schemas are kept in lockstep), grades with
a plain state comparison, and — because the stage still carries its moves in
`expectedMoves` — `nextExpectedMove` and `countMistake` were generalized to cover
it. So the flagship lesson now **auto-grades each stage against the cube**, reveals
the next move on demand, and feeds *real* mistake counts into the memory it spent
Part 6 learning to trust.

The backend `State` is a verbatim port of the frontend's, so the target serializes
as the same `{face: [stickers]}` dict the frontend already speaks. No new cube
math — the same primitives (`applyMove`, `isSolved`, a tiny `statesEqual`) that
Part 3 used to grade the curriculum.

## Verified — and a new wrinkle on "run it and look"

The deterministic claims are pinned by tests against the real engine: frontend
went 181 → **193** (the new regressions encode the exact cheat scenarios),
backend holds at **703**. An in-process drive of `/narrate/lesson` confirmed the
wire: the flagship lesson now emits one `manual` intro plus **six `cubeState`
stages**, each stage's `expected` matches the cumulative cube, and performing every
stage in order solves it.

Then, per Part 5's lesson — *a bug in what the user sees won't be found by reading
what the code does* — I drove the real app in a browser. Scramble, generate the
Qwen lesson, watch it stream in with live narration, land on Step 1. Advance to
Step 2, the first solve stage, and there it was: an **"Apply example moves"** and a
**"Show next move"** button, and crucially **no "Mark complete."** The stage is
state-graded now, visibly, in the running UI. Exactly the structural change, made
real.

And then the sequel-wrinkle. The one thing I wanted to film — fumble a move, click
"Apply moves," watch it *refuse* to complete — wouldn't run. The cube froze
mid-test; moves enqueued and never animated. The cause wasn't the app:

```js
document.visibilityState  // "hidden"
```

The automation tab renders for screenshots but reports itself *hidden*, so Chrome
pauses `requestAnimationFrame` — and the app's move animation, like every
well-behaved web animation, is driven by rAF. No frames, no move completions, no
grading to observe. Part 5 said the cheapest source of truth is to run it and
look. Part 7's footnote: sometimes the browser won't *run* it, and the truth falls
back to the real-engine unit tests and the wire-level integration check — which is
exactly why those exist. (One loose end for a real browser: a transient stray `L`
in the move history on first entry to a stage, cleared by Reset; the frozen tab
made it impossible to pin down live.)

## The throughline

Three posts in this series are about the same thing from different angles —
**correct is not the same as honest, or followable, or trustworthy.** Part 4: a
solve that was provably correct and completely unfollowable. Part 5: a lesson that
worked and looked broken. Part 7: a grader that was *checking the wrong thing* —
the learner's transcript instead of their cube — and so handed out passing grades
on failing work, and zero-mistake records on disasters.

The fix wasn't new machinery. It was applying the doctrine the project already
believed — *deterministic skeleton, generative skin; let the engine grade the
homework* — to the two places it had quietly been skipped. The LLM still only ever
writes words. Now everything it writes them over is graded against the cube.

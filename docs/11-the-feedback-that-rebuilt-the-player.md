# The feedback that rebuilt the player: teach on the reference cube, not the learner's

*Part 11 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

Part 10 built a reference cube that mirrors the learner and plays a hint. The
first cut kept the old wiring: the walkthrough still animated the **learner's**
cube, and the window mirrored it. Two rounds of "watch it in the real UI"
feedback took that apart and rebuilt it — and each round was a reminder that the
survey (or the first design) is not the measurement.

## Round one: "the Qwen solve made me wait, with an ugly scramble"

The "Solve my cube (Qwen)" walkthrough solves the *learner's current* cube. But
the walkthrough player resets to solved before playing. So the backend made the
plan self-contained by stuffing the intro beat with the inverse of the whole
solution:

```python
# planner.build_solve_walkthrough (before)
frames[0] = frames[0].model_copy(update={"moves": invert(solution), "pace": "fast"})
```

On select, the player did `reset()` (cube snaps to solved) then animated that
`invert(solution)` — a ~60-move, ugly reconstruction of the scramble — at the
default 220ms/move. That's the "wait too long": up to ~13 seconds of the learner
watching their cube get *un-solved* into a scramble it was already in.

The cube already holds the scramble. So don't rebuild it. A `startFromCurrent`
flag (plumbed backend → `schema.py` → meta → `narrate.ts` → the frontend
`Walkthrough`) tells the player: the cube is already at the start, sit on the
intro without touching it.

```ts
// walkthrough.ts — select()
if (found.startFromCurrent) this.settleAtIntro(found); // no reset, no re-scramble
else this.seek(0);
```

The intro's `invert(solution)` stays in the plan **as data** (the reference cube
still reconstructs the pre-solve position from it) but the live cube never
replays it. Backward navigation can't reset-and-rebuild either, so
`seekFromCurrent` works relative to the scramble instead of from solved: it
diffs the *solution* moves currently applied against those the target beat needs,
then undoes the surplus with inverse turns and applies the remainder. Navigation
only ever adds or removes solution moves on top of the scramble — it never
rebuilds the scramble — so stepping back never shows a rescramble.

Verified end to end against the debugger's own state read: after generate-and-
select, the cube's facelets are **byte-identical to the scramble** (no reset, no
wait), and playing the solve from there still ends solved.

## Round two: "put the teaching in the window; leave my cube alone"

The sharper feedback came watching a Qwen walkthrough: a corner highlight fired
on the *learner's* cube and never faded, and — more fundamentally — "since we have
the hint window now, the animation should happen there. My cube doesn't need to
be moved or highlighted." Followed by the product instinct that made it click:
add a button to *solve my cube* and one to *reset it to checkpoint* so I can try
myself.

That's not a tweak; it's an inversion. The walkthrough had always driven the
learner's cube (`cubeStore`) and pushed highlights to its view. The new model:
**the walkthrough drives the reference cube; the learner's cube is touched only
when the learner asks.**

The engine didn't have to change — it drives a cube through a narrow API. We just
bound that API to the reference cube instead:

```ts
// walkthrough.svelte.ts — the engine's cube is now the window's cube
const walkthroughApi = {
  applyMoves: (m) => demoStore.applyMoves(m),
  reset:      () => demoStore.reset(),
  isBusy:     () => demoStore.isBusy(),
  setMoveDuration: (ms) => demoStore.setMoveDuration(ms)
};
new WalkthroughEngine(walkthroughApi, WALKTHROUGHS,
  (type, opts) => demoStore.highlight(type, opts)); // highlights → reference cube
```

`DemoCubeController` grew the matching surface — `applyMoves`, `reset`,
`setMoveDuration`, and a `highlight` backed by its own `CubeView` — and
`DemoScene.svelte` binds it into `demoStore` on mount (the same bind pattern the
main cube already uses). The per-beat mirror (`syncDemo`) is gone; there's one
driven cube now, not two.

Three consequences fell out cleanly:

- **The stuck highlight vanished at the source.** The learner's cube is never
  handed a highlight, so it can never get stuck with one. On the reference cube
  the fade is pumped every frame and cleared on close.
- **No more cube-shift for walkthroughs.** The left-nudge that made room for the
  window is now gated to the lesson demo only; a walkthrough leaves the learner's
  cube exactly where it is.
- **One headless snag.** `CubeView` draws its labels with `document`, which the
  node test environment doesn't have — and the controller now creates a view. A
  three-line guard in `makeTextSprite` returns a bare sprite when there's no DOM,
  so the opacity/highlight logic stays unit-testable without a browser.

### The opt-in buttons

The learner's cube is now driven by exactly two buttons in the window: **"Solve
my cube"** applies the solution and records it; **"Reset to checkpoint"** replays
the inverse to land back on the *exact* scramble. Tracked-undo, not
reconstruct-from-solved, so it's robust and needs no captured snapshot:

```ts
solveUserCube() { const m = this.solutionMoves(); cubeStore.applyMoves(m); this.userApplied = m; }
resetUserCubeToCheckpoint() {
  cubeStore.applyMoves(this.userApplied.slice().reverse().map(invertMove)); // undo == back to scramble
}
```

Verified with a full cycle in the live app against the debugger's state:
Solve → "Solved: yes"; Reset → the fingerprint matches the original scramble
once the queue drains. A built-in demo (Sune) proved the other half — played to
the end, the learner's cube stayed *solved and untouched*, because the whole
performance happened on the reference cube.

One bug this surfaced: generated walkthroughs load via `engine.loadGenerated`,
which selects *internally* and so bypassed the store's select — the window never
opened. The store's `loadGenerated` now runs its own select after, so the window
opens and seeds for generated content too.

## Placement, honestly

The buttons act on the learner's cube but live in the window. "Under the cube"
was the ask; the window is where they actually fit on both desktop and mobile
(the phone's bottom is already the sheet and the quick-actions), so the labels
carry the meaning — *Solve **my cube*** — and the placement follows the platform.
Called out here because it's a real deviation from the literal request, made for
cross-platform proportionality.

## The throughline

Both rounds are Part 1 and Part 9's lesson in UI form: **the first design is not
the measurement.** The window worked; watching it in the real app showed that
mirroring the learner's cube was the wrong default and that a "self-contained"
plan was making a learner wait to rebuild a scramble they already had. The engine
never changed — it was always a deterministic player over a narrow cube API — so
re-pointing it at a second cube and gating the learner's cube behind two buttons
was rewiring, not rework. The teaching moved to where the learner was already
looking; their cube became theirs to try on.

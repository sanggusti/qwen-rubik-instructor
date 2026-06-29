# De-bloating the solve: making a correct solver human-followable

*Part 4 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The flagship feature was unusable

"Solve my cube (Qwen)" is the headline: scramble the cube, and the tutor walks
you through solving *your* exact cube, layer by layer, narrated by Qwen. The
backend was correct — every solution provably solves the cube — and the narration
was warm and grounded. And yet, watching it as a learner, it was unfollowable.

I captured the real output from the live backend for a 13-move scramble. The
solution was **246 moves**, and it contained things no human would ever do:

```
… "x", "x", "x'", "x'", "F'", "R", "F", "F", "R'", … "z", "L'", "B'", "L", "B", …
```

Counting precisely:

- **246 moves** to undo a 13-move scramble.
- **32 whole-cube rotations** (`x`/`y`/`z`) sprinkled throughout.
- **8 slice moves**, plus 36 collapsible quarter-turn pairs (`F' F'` where a human
  reads `F2`).

The rotations are the real killer. Each `x`/`y`/`z` means "now physically pick up
the whole cube and reorient it" — mid-stage, repeatedly. A beginner trying to
mirror the animation loses the thread instantly. The narration said "let's solve
it together, layer by layer," and underneath was a 246-move salad.

## Why it was like this

The solver (`backend/pipeline/solver/lbl.py`) is built on the `rubik_cube`
(pglass) library — a genuine beginner layer-by-layer method, which is exactly why
it was chosen: it produces *teachable stages*, not an opaque 20-move machine
solution. The trade-off is that its solutions are long and lean heavily on
reorientation.

There was already a cleanup helper in `notation.py`:

```python
def cleanup(moves):
    """Cancel adjacent inverse pairs (R R'), collapse runs mod 4. Never reorders
    across faces, so it never changes the net result."""
```

But it had two limits that mattered: it ran **per stage**, never across the whole
solution, and it had **no concept of rotations** — it could cancel `R R'` but
never remove an `x` that was disorienting the entire solve.

## The fix: push the rotations out

A whole-cube rotation doesn't *do* anything to the solved state — it just changes
the frame you're describing the next moves in. So instead of rotating the cube and
then turning a face, you can rewrite that face turn into the original frame and
drop the rotation entirely. The algebra is conjugation: a move `m` performed after
a rotation `r` is equivalent, in the fixed frame, to

```
r · m · r⁻¹
```

which, for a quarter-turn, is always *another single quarter-turn*. Track the
rotations you're dropping as a prefix `Prot`, and every following face/slice move
becomes its fixed-frame equivalent:

```python
def _to_fixed_frame(move, dropped):
    t = move
    for r in reversed(dropped):   # innermost rotation first
        t = _CONJ[r][t]
    return t
```

The only thing I needed was `_CONJ` — how each generator rotation relabels the 18
face/slice tokens. I refused to hand-derive it (sign errors in cube notation are
endless). Instead I derived it **empirically against the engine itself**: fingerprint
a labeled cube under `r · m · r⁻¹`, match it to the single token with the same
fingerprint, and print the table. Then I pinned that table into the source with a
comment — the same "derived empirically, guarded by tests" pattern the solver
already uses for its library-notation mapping. The new optimizer then:

1. eliminates every rotation by rewriting following moves (carrying a per-move
   stage tag, so stage boundaries survive),
2. runs `cleanup` **globally** across the whole sequence, and
3. re-splits into per-stage move lists.

It drops into `solve()` in three lines and leaves the planner and narrator
untouched:

```python
for stage, moves in zip(stages, optimize_solution([s.moves for s in stages])):
    stage.moves = moves
```

## Proving it before trusting it

This is a cube; "it looks shorter" is not evidence. Two guards, both leaning on
the engine as ground truth:

**Net effect, exactly.** Dropping rotations changes the cube's final *orientation*
(a solved cube is solved in any orientation, so solving still works — but the
states aren't identical). The precise identity is that the optimizer *pushes the
rotations to the end*:

```
original  ==  rewritten + [dropped rotations, in original order]
```

I verified that empirically before writing it into a test, and the unit test now
asserts exactly that equivalence on a crafted sequence.

**Still solves, no rotations left.** The existing 300-random-scramble replay test
gained two assertions: the solution still solves, and **no `x`/`y`/`z` survives in
any stage**. All 698 backend tests pass.

On the live backend, the same 13-move scramble that produced 246 moves with 32
rotations now produces **210 moves and 0 rotations** — every stage rotation-free.
The cube never flips in your hands mid-solve.

## The honest part: what this did *not* fix

Rotation elimination only cut ~15% of the length (246 → 210; 216 → 184; 201 →
177 across three scrambles). I tried to do better with a stronger but still-safe
optimizer — grouping same-axis moves (which commute) and netting them — and it
gave *nothing*: 210 → 210. That null result is the finding. The remaining length
isn't local redundancy; it's **intrinsic algorithmic repetition** in the pglass
method (it'll happily repeat `R' D' R D` many times to twist one corner). No safe
local pass can shorten that. A genuinely short, human-length solve (~60–100 moves)
needs a different solver — a deferred, larger change.

So I shipped the win that was real, safe, and fully tested (the cube stops
reorienting, and the move list reads like notation), and wrote down plainly that
the *length* problem is only half-solved and why.

## The throughline

This is the series' "deterministic skeleton" theme from a new angle. The solver's
correctness was never in question — but *correct* and *learnable* are different
properties, and the gap between them was 32 cube-flips. The fix stayed entirely in
the deterministic layer, was validated by replaying on the real engine rather than
by reasoning about cube algebra, and came with an honest scope: removing rotations
made it followable; it did not make it short. Name the win you actually shipped,
and the one you didn't.

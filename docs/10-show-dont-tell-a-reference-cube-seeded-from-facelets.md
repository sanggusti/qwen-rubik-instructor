# Show, don't tell: a reference cube seeded from facelets

*Part 10 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The gap: hints were words about moves you couldn't see

By Part 9 the tutor could narrate a solve in ~1s per beat and grade against the
cube. But the *hint* surface was still text-only: a caption streamed a sentence
("Turn the right face clockwise…") and the lesson panel listed the moves. The
learner never got to **watch** the moves happen before attempting them. For a
spatial skill, that's the whole game — you learn `R U R' U'` by seeing a cube do
it, not by reading four tokens.

The fix is a second, dimmed **reference cube** in a floating "Show me how"
window: it mirrors the learner's current cube, plays the hint's move sequence
once, and holds. The learner watches, then does it on their own cube. This post
is about the one genuinely hard part of building that — putting an *arbitrary*
cube state onto a fresh cube — and the small pieces around it.

## The hard part: seeding a cube from a facelet state

The 3D cube (Three.js) is only ever built one way: **solved**, then moves animate
it. There was no "set the cube to this state" path. The reference cube, though,
has to *start* wherever the learner currently is — a scrambled facelet `State`.

Two options:

1. **Replay moves.** Find a move sequence that turns solved into the target and
   apply it. But we don't always have such a sequence, and computing one is
   solving the cube.
2. **Paint the stickers.** Build a solved cube and recolour each sticker to match
   the target state's facelets. Because moves animate *geometrically* on the
   meshes, painting the visible colours is enough — no logical reconstruction
   needed. Subsequent turns carry the painted stickers correctly.

Painting wins. It's `O(stickers)`, needs no solver, and works for any state. The
whole primitive is `paintCubeFromState(cube, state)` in
`frontend/src/lib/scene/paint-from-state.ts`.

### The linchpin: a coordinate→facelet-index map that matches the engine

Each sticker mesh knows its outward face (`userData.face`) and its cubie's
lattice coordinate `(x, y, z) ∈ {-1,0,1}³`. To paint it, we need the sticker's
**index 0–8 within that face**, in the *exact* convention the logical engine
(`cube/state.ts`) uses — otherwise the painted cube and the real cube disagree.

That convention isn't written as a formula anywhere; it's implicit in the
engine's move `CYCLES` (which sticker indices a turn permutes). So we derive it.
Cross-referencing every face against the cycles that touch it yields six closed
forms:

```ts
// paint-from-state.ts — solved-geometry cubie at (x,y,z), sticker on face F
switch (face) {
  case 'U': return (z + 1) * 3 + (x + 1);
  case 'D': return (1 - z) * 3 + (x + 1);
  case 'F': return (1 - y) * 3 + (x + 1);
  case 'B': return (1 - y) * 3 + (1 - x);
  case 'L': return (1 - y) * 3 + (z + 1);
  case 'R': return (1 - y) * 3 + (1 - z);
}
```

A hand-derived mapping is exactly the kind of thing that's *plausibly* right and
subtly wrong. So the test doesn't trust it.

### Testing the map against an independent oracle

The naive test — paint from a state, read it back with the same map, assert equal
— is circular: a wrong-but-consistent convention passes. The map has to be
checked against something that doesn't use it.

That something is the animator itself. The property we actually want is: *a cube
painted from `state` looks identical to a cube the animator drove into `state`.*
So the test builds both and compares them by pure world geometry — for every
sticker, key on `(which lattice cell, which way its world-normal points) → colour`
— a fingerprint that never mentions `faceIndex`:

```ts
// paint-from-state.test.ts
const oracle = appearance(animatedCube(moves));          // moves driven through the animator
const painted = new CubeMesh();
paintCubeFromState(painted, stateAfter(moves));          // solved cube painted from the same facelets
expect(appearance(painted)).toEqual(oracle);
```

Run across single turns of all six faces, primes, and a scramble, this fails
loudly if the derivation is off on even one face. It passed — and caught a real
bug on the way: the first cut keyed the fingerprint on the *sticker's* world
position, whose depth offset lands some coordinates on a `.5` rounding boundary,
so the painted and animated cubes rounded differently. Keying on the cubie
*centre* fixed the oracle, not the map. Worth the paranoia: the map is now the
one thing the whole feature stands on, and it's pinned to the engine's own
geometry.

## The scene: a self-contained second cube

`DemoCubeController` (`scene/demo-cube.ts`) owns its own `CubeMesh`,
`MoveAnimator`, and view, and exposes a tiny surface: `seedFromState(state)`
(rebuild solved, then paint), `seedAndPlay(state, moves)` for the lesson demo,
and an `update(now)` the render loop pumps. `rebuild()` clears and refills the
*same* root `Group` so the Threlte `<T is={root}>` binding stays valid across
reseeds — the reference cube can jump to a new state without remounting.

A thin store (`demoStore`) is the reactive façade the rest of the app talks to,
and `DemoCubeWindow.svelte` is the floating card: its own transparent `<Canvas>`,
the reference cube, a move-chip bar on top, and a Replay button. Docked right on
desktop, a bottom sheet on mobile. `MoveAnimator` gained one method,
`cancel()`, so a reseed mid-play drops the in-flight quarter-turn instead of
re-attaching now-discarded meshes.

## Two smaller UX rocks

**The caption collided with the window.** The streaming narration caption sat at
`left: 57%`; the new window docks right — they overlapped. Rather than duplicate
the streaming text into the window, the caption gets a `demo-open` modifier that
relocates it only while the window is open: bottom-left of the free space on
desktop, top-right (clear of the sheet and the guide rail) on mobile. Measured
rects confirm no overlap on either.

**Long stages dumped every move at once.** A solve stage can be 20–30 moves; the
chip bar rendered all of them, overflowing the card. A pure helper `moveWindow`
returns at most ten chips centred on the active move, pinned to the ends, and the
bar shows "…" on the clipped sides. As playback advances the window slides
forward, so it reads progressively:

```ts
// move-window.ts
export function moveWindow(total, activeIndex, max) {
  if (total <= max) return { start: 0, end: total };
  const focus = activeIndex < 0 ? 0 : Math.min(activeIndex, total - 1);
  let start = Math.max(0, focus - Math.floor(max / 2));
  const end = Math.min(total, start + max);
  start = Math.max(0, end - max); // pin to the tail so we always show `max`
  return { start, end };
}
```

Extracting it to a pure function is what makes it testable at all — five node
tests cover fits-in-full, anchor-to-start, mid-list centring, pin-to-tail, and
the no-active-move case, none of which need a browser.

## The throughline

The series theme is **deterministic skeleton, generative skin.** The reference
cube is more of the same: painting is a deterministic re-colouring pinned to the
engine's own indexing, and its correctness is proven against the animator, not
asserted. The window shows the learner exactly what the engine knows — no new
source of truth, just a second view of the one we already trust. Part 11 is what
happened when real UX feedback pushed the *entire* walkthrough player onto this
cube.

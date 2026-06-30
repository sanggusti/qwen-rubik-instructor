# Frontend Revamp: SvelteKit + Threlte

Status: **implemented — all 6 phases done** ([§12](#12-phased-rollout))
Scope: `frontend/` only. No changes to `backend/`.

## 1. Goals

- Replace the vanilla TypeScript + Vite + raw DOM frontend with **SvelteKit +
  [Threlte](https://threlte.xyz)** (the Svelte renderer for Three.js).
- Make the experience **mobile-friendly**: touch controls, responsive layout,
  safe-area awareness, sane tap targets.
- Apply a **retro visual style** — confirmed direction: **synthwave / outrun
  neon** (magenta-cyan glow on near-black, neon-edged glass panels, grid
  horizon cues). See [§8](#8-design-system-synthwave-retro--mobile).
- Reorganize the source tree into **domain-grouped, route-agnostic modules**
  (`src/lib/...`) so a future page (e.g. a profile/stats page, an about page,
  a leaderboard) can be added as a new SvelteKit route without restructuring
  shared code.

## 2. Non-goals

- No backend changes. The `/narrate/walkthrough` and `/narrate/lesson` SSE
  contract in [backend/main.py](../../backend/main.py) stays as-is.
- No new lesson/practice/walkthrough content — same catalog, ported as-is.
- No redesign of the cube-solving logic, move notation, or learning engines —
  this is a rendering + framework + UI-shell migration, not a product
  rewrite. Engine modules (`education/*`) are intended to move with minimal
  changes.
- The Qwen-driven dynamic content roadmap in the root [README](../../README.md)
  is unaffected and out of scope here.

## 3. Assumptions (flag if any are wrong)

1. **Static SPA, not SSR.** The cube needs `window`/WebGL and has no SEO
   need, and the current build already ships as static assets (Vite's
   `base: '/cube-assets/'` build path suggests embedding under a host).
   Plan: `@sveltejs/adapter-static`, `export const ssr = false` and
   `prerender = true` in the root layout — functionally an SPA, same
   "no backend required to play with the cube" dev experience as today.
2. **Svelte 5 (runes) + Threlte 8.** Both are the current default for new
   projects; no reason to start on the older Svelte 4 / Threlte 7 stores API.
3. **The cube stays visible during lessons/practice/explore** (current
   product property, called out in the README roadmap: "the learner can
   interrupt and experiment mid-lesson"). So Lessons/Practice/Explore/State
   remain **overlay panels on one main route**, not separate pages with their
   own URLs. The directory rework is about making the *code* modular for
   future pages, not about turning every existing panel into a route.
4. **Engines stay framework-agnostic.** `education/*` (lesson/practice/
   walkthrough engines, validators, evaluation) are plain TypeScript with no
   DOM/Three dependency today — they move into `src/lib/education/` largely
   unchanged. Only the UI wiring (currently hand-rolled DOM in `ui/*` and
   `main.ts`) gets rewritten as Svelte components/stores.
5. **Dev port stays 5173.** `backend/config.py` hardcodes
   `cors_origins = ["http://localhost:5173"]`; SvelteKit's Vite dev server
   defaults to the same port, so no backend change needed — just confirm
   after scaffolding.

## 4. Current architecture (for reference)

```
frontend/src/                  (~4.5k LOC, vanilla TS, no framework)
├── core/        state.ts, events.ts          — cube state model
├── scene/       scene.ts, cube/*             — Three.js scene + cube mesh + animator + drag
├── education/   lesson_*, practice_*, walkthrough*, coaching, profile, remote_content (SSE client)
├── ui/          hud.ts, *_panel.ts, debugger.ts, stage_caption.ts, controls/*  — hand-rolled DOM
├── configs/     scene/light/debug/sounds config objects
└── main.ts      (423 lines) — boots scene, wires every engine + panel + idle animation by hand
```

`main.ts` is the pain point: it's a single imperative file that constructs
the scene, the cube, the animator, every engine, every panel, the idle/breathing
animation, and the keyboard/drag controls, then wires them together with
manual subscriptions. This is exactly what SvelteKit + component-local state
replaces.

## 5. Target stack

| Concern | Today | Target |
| --- | --- | --- |
| Framework | none (vanilla TS) | SvelteKit (Svelte 5, runes) |
| 3D renderer | raw `three` | `@threlte/core` + `@threlte/extras` (wraps the same `three`) |
| Build | Vite (`vite.config.ts`) | SvelteKit's Vite integration, `@sveltejs/adapter-static` |
| Animation tweening | `@tweenjs/tween.js` | keep — Threlte doesn't replace tweening, only scene-graph declaration |
| Styling | one global `style.css` | component-scoped Svelte styles + shared `src/lib/styles/tokens.css` |
| Tests | Vitest | Vitest (unchanged) + `@testing-library/svelte` for new components |

## 6. New directory structure

> **Staging note (added during Phase 1, resolved at Phase 6):** this tree was
> built incrementally in a sibling directory, `frontend-sveltekit/`, so the
> working vanilla app in `frontend/` kept running untouched until the Phase 6
> cutover swapped it in (`git rm -r frontend && git mv frontend-sveltekit
> frontend`). Paths below were written as their final `frontend/...` form
> throughout; that form is now literal — `frontend-sveltekit/` no longer
> exists.

```
frontend/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte        # retro shell: fonts, scanline/grid overlay, viewport chrome
│   │   ├── +layout.ts            # export const ssr = false; export const prerender = true;
│   │   └── +page.svelte          # the cube experience (today's whole app) — composes lib/panels + lib/scene
│   │
│   └── lib/
│       ├── cube/                 # pure TS, no Svelte/Three imports
│       │   ├── state.ts          # was core/state.ts
│       │   ├── events.ts         # was core/events.ts
│       │   ├── scramble.ts       # was scene/cube/scramble.ts
│       │   └── moves.ts          # NEW: shared axis/slice → move-name table
│       │                         #   (today duplicated between animator.ts and drag-controls.ts)
│       │
│       ├── scene/                # Threlte components + the imperative Three.js controllers
│       │   ├── CubeCanvas.svelte # <Canvas>, camera, lights — was scene/scene.ts
│       │   ├── CubeMesh.svelte   # builds cubies — was scene/cube/cube.ts + cubelets.ts
│       │   ├── animator.ts       # was scene/cube/animator.ts — unchanged, imperative
│       │   ├── drag-controls.ts  # was ui/controls/drag-controls.ts — unchanged, Pointer Events
│       │   ├── cube-view.ts      # was scene/cube/cube_view.ts
│       │   └── idle-drift.ts     # NEW: standby breathing animation, extracted from main.ts
│       │
│       ├── education/            # was education/* minus remote_content — ported as-is
│       │   ├── lesson_engine.ts, lesson_catalog.ts, lesson_types.ts
│       │   ├── lesson_validator.ts, lesson_progress.ts
│       │   ├── practice_engine.ts, practice_drills.ts, practice_types.ts
│       │   ├── drill_generator.ts, evaluation.ts
│       │   ├── walkthrough.ts, walkthroughs.ts
│       │   └── coaching.ts, profile.ts
│       │
│       ├── api/
│       │   └── narrate.ts        # was education/remote_content.ts (SSE client, unchanged logic)
│       │
│       ├── stores/                # Svelte runes glue between engines and components
│       │   ├── cube.svelte.ts     # reactive state/isBusy/isSolved, replaces window.rubikInstructor
│       │   ├── lesson.svelte.ts
│       │   ├── practice.svelte.ts
│       │   ├── walkthrough.svelte.ts
│       │   └── profile.svelte.ts
│       │
│       ├── components/            # generic retro UI atoms — reusable by ANY future page/route
│       │   ├── HudBar.svelte, HudTab.svelte       # was ui/hud.ts
│       │   ├── Panel.svelte                       # shared glass/neon panel chrome (was repeated CSS)
│       │   ├── StageCaption.svelte                # was ui/stage_caption.ts
│       │   └── TouchMovePad.svelte                 # NEW — on-screen move pad for touch (§8.3)
│       │
│       ├── panels/                 # one file per existing experience's panel content
│       │   ├── LessonsPanel.svelte   # was ui/lessons_panel.ts
│       │   ├── PracticePanel.svelte  # was ui/practice_panel.ts
│       │   ├── ExplorePanel.svelte   # was ui/explore_panel.ts
│       │   ├── DebuggerPanel.svelte  # was ui/debugger.ts
│       │   └── LevelPanel.svelte     # was the buildLevelPanel() helper in main.ts
│       │
│       ├── config/                 # was configs/* — unchanged content, moved
│       │   ├── debug-config.ts, scene-config.ts, sounds-config.ts, global-light-config.ts
│       │
│       └── styles/
│           ├── tokens.css          # retro design tokens (color, glow, font-family)
│           └── retro.css           # scanline/grid/neon utility classes shared by any route
│
├── static/                          # favicon, retro pixel/display font files
├── svelte.config.js                 # adapter-static, paths.base for /cube-assets/ parity
├── vite.config.ts
└── package.json
```

This satisfies the "modular, extendable with other pages" ask two ways:

- **`routes/`** is where new pages go (`routes/about/+page.svelte`, etc.) —
  SvelteKit's file-based routing means a new page is just a new folder.
- **`lib/`** is grouped by *domain*, not by *current screen*, and nothing in
  it assumes there's only one page. A new route can import `lib/components/Panel.svelte`
  or `lib/stores/profile.svelte.ts` the same way `routes/+page.svelte` does.

## 7. Threlte integration notes

Threlte is declarative (components describe the scene graph), but this
codebase's hardest logic — quarter-turn tweening (`animator.ts`), drag-to-move
raycasting (`drag-controls.ts`), and the idle breathing animation — is
inherently imperative (mutates `THREE.Object3D` transforms frame-by-frame).
**Don't fight that.** Plan:

- `CubeCanvas.svelte` wraps `@threlte/core`'s `<Canvas>`, declares the camera
  and lights declaratively (from `config/global-light-config.ts`), and uses
  `@threlte/extras`'s `<OrbitControls>` in place of the manual
  `three/examples/jsm/controls/OrbitControls.js` import — same
  `DEBUG_CONFIG.orbitControls` gate as today.
- `CubeMesh.svelte` builds the 26 cubies once (port of `cube.ts` +
  `cubelets.ts`) and exposes the resulting `THREE.Group` via `bind:ref`, so
  the existing `MoveAnimator` and `attachDragControls` classes can be handed
  that ref in `onMount` and run exactly as they do today — no rewrite of the
  tweening or raycasting math.
- Threlte's `useTask` (its `useFrame` equivalent) replaces the manual
  `requestAnimationFrame` loop in `main.ts`'s `tick()` for
  `animator.update()`, `cubeView.update()`, and the idle-drift easing.
- Net effect: `scene/` keeps its current files almost verbatim; only the
  scene *bootstrap* (`createScene`) becomes a `.svelte` component.

## 8. Design system: synthwave retro + mobile

### 8.1 Visual direction (confirmed: synthwave / outrun)

- Palette: near-black background (`#07030d`), neon magenta (`#ff2bd6`) and
  cyan (`#00f0ff`) accents, replacing the current cool-blue glass palette in
  `style.css`.
- Panel chrome keeps the existing glass/blur language (`backdrop-filter`,
  translucent panel background) but swaps the border/glow color to the neon
  accents and adds a subtle outer glow (`box-shadow` bloom) — this is the
  least disruptive retro path since the current UI is already
  glow/blur-based.
- Add a faint animated grid-horizon background layer (CSS gradient + a few
  horizontal lines receding via `perspective`/`transform`), replacing or
  layering with the current `#app::before` aurora-drift blob.
- Typography: keep the existing monospace stack for body/data (it already
  reads as "console/HUD"), add one display font with a neon-sign feel for
  titles/headings only (e.g. a condensed/outline face) — avoid going full
  pixel-font, which would clash with the smooth 3D cube.
- Centralize all of this in `lib/styles/tokens.css` as CSS custom properties,
  so panels/components consume `var(--accent-a)` / `var(--accent-b)` instead
  of hardcoded hex (today's `style.css` already does this with `--accent`,
  so it's a rename + new values, not a new pattern).

### 8.2 Mobile layout

- The bottom HUD bar (`#hud-bar`) and the `@media (max-width: 760px)` bottom-sheet
  behavior for the stage caption already exist in `style.css` — port the
  *behavior*, refresh the *skin*.
- Tap targets: current HUD tabs are `padding: 7px 12px` at `font-size: 11px`
  — under the ~44px recommended touch target on small screens. Bump padding/
  font-size at the mobile breakpoint.
- Safe-area insets: add `padding-bottom: env(safe-area-inset-bottom)` to the
  HUD bar and bottom-sheet stage caption (not present today) for notched
  phones.
- Viewport: add `viewport-fit=cover` to the viewport meta and disable
  pinch/double-tap browser zoom on the canvas area (`touch-action: none` on
  the canvas container) so dragging a cube face doesn't fight the browser's
  own zoom/scroll gestures.

### 8.3 Touch controls

- Good news: `drag-controls.ts` already uses **Pointer Events**
  (`pointerdown`/`pointerup`/`pointercancel`), so face-drag-to-turn already
  works on touch with no logic changes.
- Gap: there's no touch equivalent for the **keyboard-only** controls
  (`U D L R F B M E S x y z`, `Shift` for prime, `Space` scramble, `Enter`
  reset) — `ui/controls/keyboard.ts` has no mobile counterpart today.
  Add `TouchMovePad.svelte`: a compact on-screen button grid (shown via
  `matchMedia('(pointer: coarse)')`) covering the same move set, calling the
  same `applyMoves`/`scramble`/`reset` API the keyboard handler calls.
- `SCENE_CONFIG.isMobile` exists in `config/scene-config.ts` but is currently
  unused dead config — wire it up to actually lower `maxPixelRatio` (e.g. to
  1.5) and disable `antialias` on coarse-pointer/small-viewport devices for
  performance.

## 9. State management

- `lib/stores/cube.svelte.ts` replaces the `window.rubikInstructor` global
  and the closure-based `state`/`moveSubscribers` in `main.ts` with a runes
  class (`$state`, `$derived`) exposing `applyMoves`, `scramble`, `reset`,
  `state`, `isBusy`, `isSolved` — same shape as today's `RubikInstructorApi`,
  just reactive instead of a manually-dispatched callback set.
- `lib/stores/lesson|practice|walkthrough.svelte.ts` each wrap their
  existing engine (`LessonEngine`, `PracticeEngine`, `WalkthroughEngine`) and
  re-expose the engine's existing `.subscribe()` as a rune, so
  `LessonsPanel.svelte` etc. just read `lessonStore.current` reactively
  instead of manually re-rendering on a callback (today's `lessonEngine.subscribe(s => ...)`
  pattern in `main.ts`).
- `profile.svelte.ts` wraps `education/profile.ts` (already localStorage-backed)
  — no storage format change.
- The "only one experience owns the stage caption" rule (`closeOthers` in
  `main.ts`) becomes a single `activeExperience` rune read by `+page.svelte`,
  rather than three independent engines each manually told to close.

## 10. Backend integration

- `lib/api/narrate.ts` ports `education/remote_content.ts` verbatim — the
  manual SSE frame parser (`fetch` + `ReadableStream` reader, since
  `EventSource` is GET-only) has no framework dependency and doesn't need to
  change.
- Swap `import.meta.env.VITE_BACKEND_URL` for SvelteKit's `$env/static/public`
  (`PUBLIC_BACKEND_URL`) — note the env var name changes from
  `VITE_BACKEND_URL` to `PUBLIC_BACKEND_URL` (SvelteKit's public-env prefix),
  update any `.env`/deployment docs that set it (none currently checked in).
- No `backend/` changes. Confirm `backend/config.py`'s
  `cors_origins = ["http://localhost:5173"]` still matches the SvelteKit dev
  port after scaffolding (§3.5).

## 11. Testing

- Existing Vitest suites for pure logic (`core/state.test.ts`,
  `education/*.test.ts`, `scene/cube/*.test.ts`, `ui/controls/drag-controls.test.ts`)
  move with their source files and should pass with little/no edit, since
  that logic isn't changing.
- New `.svelte` components (panels, HUD, touch pad) get
  `@testing-library/svelte` tests for the interaction surface that mattered
  in the old DOM code (e.g. "only one panel open at a time," "closing a
  panel ends its experience").
- Manual mobile pass required: type-checks/unit tests don't verify touch
  drag feel, tap target sizing, or safe-area insets on a real/emulated
  device — call this out explicitly when reporting Phase 4 done (per repo's
  CLAUDE.md: simulated checks aren't a substitute for in-browser testing).

## 12. Phased rollout

### Phase 1 — Scaffold ✅ done
- [x] `npx sv create` (SvelteKit, Svelte 5, TS) — scaffolded into sibling dir
      `frontend-sveltekit/` instead of in-place, so the working vanilla
      `frontend/` isn't clobbered by config-file conflicts (`package.json`,
      `vite.config.ts`, `tsconfig.json`). Swap-in happens at Phase 6 cutover.
- [x] Add `@threlte/core` (8.5), `@threlte/extras` (9.21), `three` (0.185),
      `@tweenjs/tween.js` (25), `@types/three`
- [x] Set up `@sveltejs/adapter-static` — wired automatically by the `sv create`
      `sveltekit-adapter=adapter:static` add-on, configured in `vite.config.ts`'s
      `sveltekit()` plugin (this SvelteKit version has no separate `svelte.config.js`)
- [x] Added `src/routes/+layout.ts` with `ssr = false` / `prerender = true`
      (SPA shell, per plan §3.1) so Threlte's `<Canvas>` never tries to run
      Three.js server-side
- [x] **Verify:** `npm run dev` renders an empty `<Canvas>` at `/` — confirmed
      with a headless-browser check: one `<canvas>` element, full-viewport
      size, zero console/page errors; `npm run check` (svelte-check) is clean

### Phase 2 — Core + scene ✅ done
- [x] Port `lib/cube/*` (`state.ts`, `events.ts`, `scramble.ts`, new shared `moves.ts`)
      — `moves.ts` is the new canonical axis/slice → move-name table; `animator.ts`
      now imports `parseMove`/`MoveSpec` from it instead of defining its own copy
      (the `drag-controls.ts` reverse lookup will switch over in Phase 3).
- [x] Ported `lib/scene/cubelets.ts` + `cube.ts` (logical/visual cubie model,
      unchanged besides import paths) — not explicitly itemized above but
      required by `CubeMesh.svelte`; both keep their existing test coverage
      (`cubelets.test.ts`, `state.test.ts`, `animator.test.ts`, 48 tests passing).
- [x] Build `CubeCanvas.svelte` (camera/lights, was `scene/scene.ts`) — uses
      `@threlte/core`'s `<Canvas>` with a custom `createRenderer` (alpha,
      antialias) and `dpr={[1, SCENE_CONFIG.maxPixelRatio]}`, `<T.PerspectiveCamera makeDefault>`
      for the camera, and `@threlte/extras`'s `<OrbitControls>` gated by
      `DEBUG_CONFIG.orbitControls`.
- [x] Build `CubeMesh.svelte` (was `scene/cube/cube.ts` + `cubelets.ts`) — builds
      the existing imperative `CubeMesh` class once and attaches its `root` Group
      via `<T is={cube.root} />`, per §7's "don't fight the imperative parts" plan.
- [x] Wire `animator.ts` via `useTask` (no `bind:ref` needed — the cube instance
      is constructed directly in `CubeMesh.svelte`'s script, not passed in from a parent)
- [x] Built `lib/scene/idle-drift.ts` (NEW, extracted from `main.ts`'s
      `updateIdle`/`markActivity`) so the Phase 2 verify step has something to verify
- [x] **Verify:** solved cube renders, idle drift runs, `OrbitControls` works in
      debug mode — confirmed via headless Playwright: 1 canvas, zero console
      errors, screenshot unchanged within the 2.5s idle delay then visibly
      drifting after it, and OrbitControls visibly rotates the view on drag when
      `DEBUG_CONFIG.orbitControls` is temporarily set `true` (reverted to `false` after).
      **Found and fixed a pre-existing Phase 1 bug** blocking `npm run dev` entirely:
      `+layout.svelte` imported `$lib/assets/favicon.svg`, which was never created
      during scaffolding. Added a placeholder favicon using the synthwave palette
      (a real one is still planned for Phase 5's retro skin pass).

### Phase 3 — Interaction ✅ done
- [x] Ported `lib/scene/drag-controls.ts` (Pointer Events, unchanged logic) — its
      reverse `moveFromAxisSlice` lookup now imports the canonical one from
      `lib/cube/moves.ts` instead of keeping its own copy, per the Phase 2 note.
      `lib/scene/drag-controls.test.ts` ported alongside it (12 tests).
- [x] Ported `lib/scene/keyboard.ts` (unchanged logic, import paths updated).
- [x] Wired both into `CubeMesh.svelte`'s `onMount` (it already owns `cube`/
      `animator` per Phase 2's deviation from the original `bind:ref` plan), using
      `useThrelte()` for the live camera/canvas `attachDragControls` needs. Added a
      local `resetCube`/`scramble` (port of `main.ts`'s `resetCube`/`api.scramble`,
      minus the `state`/engine wiring that doesn't exist until Phase 4).
- [x] Added `lib/scene/cube-controls.ts` — a minimal `CubeControls` interface
      (`applyMove`/`scramble`/`reset`) `CubeMesh.svelte` hands to its parent via an
      `onReady` prop, so DOM UI outside the `<Canvas>` (TouchMovePad) can drive the
      cube without reaching into Three.js internals. Phase 4's `stores/cube.svelte.ts`
      will grow a richer, reactive version of this same shape.
- [x] Built `lib/components/TouchMovePad.svelte` — a 4×4 grid of the 12 move
      buttons plus prime-toggle/Scramble/Reset, shown only behind
      `matchMedia('(pointer: coarse)')`, calling the `CubeControls` API above.
- [x] **Verify:** confirmed via headless Playwright with real CDP-level input
      (not just JS-dispatched events) — mouse drag turns a face on desktop;
      keyboard U/Shift+U, Space (scramble), and Enter (reset) all work; the pad
      renders under a coarse-pointer emulated viewport and its taps/prime-toggle/
      scramble/reset all work.
      **Found and fixed a real touch-drag bug surfaced by this verify pass:**
      a CDP touch-event drag on the canvas produced `pointerdown` →
      `pointermove` → `pointercancel` instead of `pointerup` — the browser's
      native pan/scroll gesture was winning and cancelling the pointer sequence
      before `attachDragControls` ever saw the release, exactly the conflict
      flagged in §8.2/§13. Fixed by adding `touch-action: none` to
      `CubeCanvas.svelte`'s `.stage` wrapper; re-ran the same CDP touch sequence
      afterward and confirmed `pointerup` now fires with zero `pointercancel`s.

#### Phase 3 addendum — view-rotation, layer guidance, no idle drift

Follow-up scope added after the initial Phase 3 verify, on direct request: the
cube should never move on its own, the user should be able to rotate the *view*
by touch/drag on empty space, and a drag-in-progress should show which layer it
will turn.

- [x] **Removed `lib/scene/idle-drift.ts` entirely** (and its `CubeMesh.svelte`
      usage) — the standby "breathing" animation from Phase 2 is gone; the cube
      now only ever moves in response to direct input. Confirmed via Playwright by
      reading the live camera/`cube.root` transform: both stayed bit-for-bit
      identical (`[5, 5, 7]` / zero rotation) across an 8s+ idle window.
- [x] **Un-gated `<OrbitControls>` in `CubeCanvas.svelte`** — previously only
      active behind `DEBUG_CONFIG.orbitControls` (removed that now-dead flag from
      `config/debug-config.ts`), now always on, so dragging *empty* canvas space
      rotates the camera around the cube on both mouse and touch.
- [x] **Made the two drag interpretations mutually exclusive**: `drag-controls.ts`
      calls `ev.stopPropagation()` in `onPointerDown` once a sticker hit is found,
      which stops the event from reaching `OrbitControls`' listener on the
      Threlte canvas-wrapper ancestor. Verified by reading the camera transform
      through a full sticker-drag gesture (start/mid/end) — position never moved —
      while a drag on empty space moved it substantially; in neither case did the
      other interpretation also fire.
- [x] **Layer-preview guidance while dragging a sticker**: refactored
      `resolveDragToMove` to extract `resolveAxisSlice` (axis+slice only, no turn
      direction — that part can't be known until enough drag direction is read,
      but axis/slice can, slightly earlier); a new `pointermove` handler reports
      it through a `DragOptions.onPreviewLayer` callback once the drag passes a
      small 6px intent threshold (separate from the existing 14px move-commit
      threshold), de-duped so it only fires when the candidate layer changes.
      `CubeMesh.svelte` feeds this into the new `lib/scene/layer-highlight.ts`
      (`LayerHighlight`), which adds a translucent cyan overlay mesh — sharing the
      sticker's own geometry, parented to it — on every sticker of the previewed
      layer, removed on release/cancel. `resolveAxisSlice` is unit-tested directly
      (3 new tests; 63 total now); the highlight itself was verified by counting
      overlay meshes mid-drag (21, exactly matching a 9-cubie face layer's sticker
      count: 4 corners×3 + 4 edges×2 + 1 center×1) and confirming the count drops
      to 0 after release.
- [x] **Verify:** all of the above checked together via Playwright with real
      CDP touch input — idle window produces zero camera/cube change; empty-space
      drag orbits the camera only; sticker drag turns the layer, leaves the camera
      untouched, and shows/clears the highlight at the right times; `npm run check`
      and `npm run test:unit` (63 tests) both clean throughout.

### Phase 4 — Panels + engines ✅ done
- [x] Ported `education/*` engines unchanged (lesson, practice, walkthrough, coaching,
      profile, validators, lesson_progress, lesson_catalog, practice_drills,
      drill_generator, evaluation, walkthroughs) plus their existing test suites —
      only `../core/state` → `../cube/state` / `../core/events` → `../cube/events` /
      `../scene/cube/cubelets` → `../scene/cubelets` import-path edits, logic untouched.
      `education/remote_content.ts` (Qwen SSE client) is **not** ported — still Phase 6
      scope — so the "Lesson/Solve from my cube (Qwen)" generate buttons are deferred
      along with it; the catalog-backed lessons/practice/walkthroughs are fully wired.
- [x] Also ported `scene/cube/cube_view.ts` → `lib/scene/cube-view.ts` (highlight/
      face-label/number-label overlay), needed by `ExplorePanel` and the walkthrough
      engine's per-beat emphasis callback — not itemized in §6 originally but required,
      same kind of emergent addition as Phase 3's `cube-controls.ts`.
- [x] Built `lib/stores/cube.svelte.ts` — a singleton reactive store (`state`, `isBusy`,
      `isSolved` via runes) replacing `window.rubikInstructor`; `CubeMesh.svelte` binds
      the live `MoveAnimator`/rebuild-cube functions into it via a `bind()` call in
      `onMount` (same pattern Phase 3's `cube-controls.ts` used) instead of the
      originally-planned `bind:ref`. **Deviation:** `lib/scene/cube-controls.ts` is
      retired — its `CubeControls` shape was absorbed into `cube.svelte.ts`, which is
      the "richer, reactive version of this same shape" its own code comment predicted.
- [x] Added `lib/stores/cube-view.svelte.ts` (not itemized in §6, same rationale as
      `cube-view.ts` above) — reactive bridge over `CubeView` so `ExplorePanel`'s
      highlight/label buttons and the walkthrough engine's emphasis pulses share one
      `highlightType`/`facesOn`/`numbersOn` state instead of manual DOM re-renders.
- [x] Built `lib/stores/lesson.svelte.ts`, `practice.svelte.ts`, `walkthrough.svelte.ts`,
      `profile.svelte.ts` — each wraps its engine's existing `.subscribe()` into a
      `snapshot` rune, per §9.
- [x] Built `lib/components/Panel.svelte` (shared glass chrome), `LessonsPanel.svelte`,
      `PracticePanel.svelte`, `ExplorePanel.svelte`, `DebuggerPanel.svelte`,
      `LevelPanel.svelte`, `StageCaption.svelte` — ports of the corresponding
      `ui/*.ts` classes' rendering logic into reactive Svelte templates. `HelpPanel`
      (the old Help HUD tab) was **not** ported — not itemized in this phase's
      checklist, left out under "don't add features beyond what was asked."
- [x] Built `HudBar.svelte` + `HudTab.svelte` — **deviation from the original bottom
      dropdown-bar design, per direct request**: a single left-edge "Guide" icon
      toggles a left-docked vertical tab rail (Lessons/Practice/Explore/State/Level);
      picking a tab opens its panel as a **centered modal** (high z-index, dimmed
      backdrop, explicit × close button, Escape/backdrop-click also close) rather
      than a side dropdown. Scramble/Reset live as their own always-visible buttons
      next to the Guide icon (not gated behind the drawer). On narrow viewports
      (`max-width: 760px`) the Guide icon moves to top-left, Scramble/Reset relocate
      to a fixed bottom-center row (clearing `TouchMovePad`), and the tab rail drops
      down from the Guide icon instead of sitting beside it. Opening any tab still
      calls the same `closeOthers`-style callback as the legacy `Hud`, and selecting
      a lesson/drill/walkthrough/level still collapses the whole rail — same
      single-owner rule as before, just relaid-out.
- [x] **Verify:** confirmed via headless Playwright (in-page DOM `element.click()`
      driving, since this session's real pointer-event simulation was too slow against
      the continuous Threlte render loop to be reliable) — a lesson can be selected,
      its step stepped through and marked complete (step counter advances, status
      flips to "In progress"/"complete"), and opening Practice while a lesson is
      active closes the lesson (and vice versa), matching `closeOthers`. `npm run
      check` (0 errors) and `npm run test:unit` (145 tests, 14 files — the 63 from
      Phase 3 plus the freshly-ported education suites) both clean throughout.
      Visual layout (left rail, centered modal, mobile rearrangement) confirmed via
      screenshots at desktop (1280×800) and mobile (390×844) viewports.

### Phase 5 — Retro skin + mobile pass ✅ done
- [x] Built `lib/styles/tokens.css` — synthwave palette (`#07030d` bg, `#ff2bd6`
      magenta / `#00f0ff` cyan accents, matching the placeholder favicon's
      palette from Phase 2). Two-accent rule used consistently everywhere:
      `--accent-a` (magenta) for titles/section labels/resting chrome,
      `--accent-b` (cyan) for active/selected/hover "lit up" feedback. Also
      added `--font-display` (Orbitron via Google Fonts, loaded in
      `+layout.svelte`'s `<svelte:head>`) for the one neon-sign display font
      called for in §8.1, with `--font-mono` as its fallback.
- [x] Built `lib/styles/retro.css` — global `html body` reset/background
      (ported from the legacy `#app` gradient, retinted), an animated
      grid-horizon (`body::before`, `perspective`/`rotateX` receding lines,
      `prefers-reduced-motion` respected) sitting at `z-index: -1` behind
      everything via `isolation: isolate` on `body`, and shared `.glass-panel`
      / `.neon-heading` utility classes. Imported once, globally, in
      `+layout.svelte`.
- [x] Retinted every component that had Phase 1–4's placeholder cool-blue
      hardcoded hex/rgba (`Panel`, `HudBar`, `HudTab`, `StageCaption`,
      `TouchMovePad`, `DebuggerPanel`, `LessonsPanel`, `PracticePanel`,
      `ExplorePanel`, `LevelPanel`) to consume the new tokens — no layout/
      structure changes, color-only swap plus `Panel.svelte` now applies the
      shared `.glass-panel` class instead of its own duplicate chrome rules.
- [x] Added safe-area insets: `HudBar`'s mobile guide position
      (`env(safe-area-inset-top)`) and `StageCaption`'s mobile bottom-sheet
      (`env(safe-area-inset-bottom)`) — `TouchMovePad` already had this from
      Phase 3. Added `viewport-fit=cover` to `app.html`'s viewport meta, since
      `env(safe-area-inset-*)` resolves to `0` on iOS without it (the safe-area
      work would otherwise be a no-op).
- [x] Bumped HUD tap targets at the existing 760px breakpoint: `HudTab` to
      44px min-height/12px padding, `HudBar`'s `.guide-toggle`/`.dock-action`
      to 44×44px minimum.
- [x] Disable page pinch/double-tap zoom on the canvas (`touch-action: none`) —
      done early, in Phase 3, since it was required to make touch dragging work
      at all (see Phase 3's verify note); applied to `CubeCanvas.svelte`'s `.stage`.
- [x] Wired up the previously-dead `SCENE_CONFIG.isMobile` flag in
      `CubeCanvas.svelte`: detected once via `matchMedia('(pointer: coarse)')`
      OR `(max-width: 760px)`, then used to cap `dpr` at 1.5 (instead of the
      configured 2) and pass `antialias: false` to the renderer on those
      devices.
- [x] **Verify:** `npm run check` (0 errors) and `npm run test` (145 tests, 14
      files) clean throughout. Visually confirmed via headless Playwright at
      1280×800 and 390×844 — synthwave background/grid-horizon renders behind
      the cube, `Lessons` modal shows the intended magenta-resting/cyan-active
      duotone on the shared glass chrome, HUD buttons meet the 44px target and
      sit thumb-reachable at the mobile breakpoint, and `touch-action: none`
      (from Phase 3) still prevents page-zoom while dragging.
      **Found and fixed one session-blocking issue along the way:** a stale
      Playwright Chrome-for-Testing process from an earlier session was
      holding the shared automation browser-profile lock; killed it (user
      confirmed) and relaunched fresh to complete the visual check.

#### Phase 5 addendum — on-demand touch keypad

Follow-up scope added after the initial Phase 5 verify, on direct request: the
touch move-pad's button grid was always visible on any coarse-pointer device,
permanently covering part of the cube; it should be hidden by default and
opened on demand, and the always-visible Scramble/Reset row needed to sit
flush at the bottom on mobile rather than floating mid-screen.

- [x] Lifted a `keypadOpen` boolean into `+page.svelte` (hidden by default),
      passed as `open` to `TouchMovePad` (gating its render alongside the
      existing `isCoarsePointer` check) and as `keypadOpen`/`onToggleKeypad`
      to `HudBar`, which now renders a third quick-action button, **Keypad**,
      beside Scramble/Reset — shown only on coarse-pointer devices, with the
      same cyan "is-active" glow as the Guide toggle when open.
- [x] Removed the redundant Scramble/Reset buttons that lived *inside*
      `TouchMovePad`'s own actions row — they duplicated the ones now always
      visible directly below in `HudBar`, and at the pad's narrow grid width
      their labels overlapped (`ScrambleReset`, no gap). The pad's actions row
      is now just the prime (`'`) toggle, centered.
- [x] Changed `HudBar`'s mobile `.quick-actions` rule from
      `bottom: calc(230px + env(safe-area-inset-bottom))` (a fixed offset that
      existed to clear the formerly-always-on keypad) to
      `bottom: max(12px, env(safe-area-inset-bottom))` — flush bottom-center,
      per direct request. `TouchMovePad` gained a matching mobile-only
      `bottom: calc(72px + max(12px, env(safe-area-inset-bottom)))` so that
      when it *is* opened, it stacks cleanly above the quick-actions row
      instead of overlapping it.
- [x] **Verify:** confirmed via Playwright with `matchMedia` mocked to report
      a coarse pointer (real touch/device emulation wasn't available in this
      session) at a 390×844 viewport — Scramble/Reset/Keypad sit centered at
      the very bottom by default with the grid hidden; tapping Keypad reveals
      the 4×4 move grid plus a centered prime toggle directly above that row
      with no overlap and no text overflow. `npm run check` and `npm run
      test` stayed clean throughout.

### Phase 6 — Backend wiring + cutover ✅ done
- [x] Ported `lib/api/narrate.ts` (SSE client, unchanged parsing/streaming logic) —
      same manual `fetch` + `ReadableStream` frame parser as the legacy
      `education/remote_content.ts`, only the import paths and the env-var
      source changed.
- [x] Switched `VITE_BACKEND_URL` → `PUBLIC_BACKEND_URL` via `$env/static/public`
      (per §10) — added `frontend/.env.example` (committed) and a local
      `frontend/.env` (gitignored), both setting
      `PUBLIC_BACKEND_URL=http://localhost:8000`, since `$env/static/public`
      requires the named export to exist at build time (unlike the old
      `import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'` runtime
      fallback).
- [x] Wired the previously-deferred "Lesson/Solve from my cube (Qwen)" buttons
      (flagged as Phase 6 scope by Phase 4's note) into `LessonsPanel.svelte`
      and `ExplorePanel.svelte`, ported from the legacy `ui/lessons_panel.ts` /
      `ui/explore_panel.ts` button+status-text pattern: `cubeStore.getState()`
      + `profileStore.profile` (level/method/history) feed `generateLesson`/
      `generateWalkthrough`, progress streams into a status paragraph, and on
      success the result is handed to `lessonStore.loadGenerated` /
      `walkthroughStore.loadGenerated` (both pre-existing pass-throughs to the
      ported engines' `loadGenerated`, unused until now) plus
      `profileStore.appendHistory`. Matching the legacy `hud.close()`-only-on-success
      timing, the panel calls its existing `onSelect`/`onPlay` collapse
      callback only after a successful generate, not on error — no new prop
      needed since opening either tab already runs `onOpenExperience` and closes
      other experiences. Practice was intentionally left alone — the legacy
      `ui/practice_panel.ts` never had Qwen wiring either.
- [x] Confirmed `backend/config.py`'s `cors_origins = ["http://localhost:5173"]`
      still matches: SvelteKit's Vite dev server defaults to 5173, confirmed
      live during the verify step below.
- [x] Root `package.json`'s `dev`/`build`/`preview`/`test` scripts needed no
      changes — `frontend-sveltekit/package.json` already used the same script
      names (`npm --prefix frontend run X` resolves the same either way); only
      its `name` field (`frontend-sveltekit` → `frontend`) was updated for
      cleanliness post-rename.
- [x] Removed the old vanilla `frontend/` tree (`git rm -r frontend`, tree was
      committed/clean so fully recoverable from history) and renamed
      `frontend-sveltekit/` → `frontend/` via `git mv` (user confirmed this
      naming over keeping the `frontend-sveltekit` name, to match §6's final
      path layout). Also deleted `frontend/src/lib/vitest-examples/` (unused
      `sv create`/vitest scaffold boilerplate, never referenced by app code).
- [x] Updated the root [README](../../README.md)'s "How it works" section/tree
      to the SvelteKit `routes/` + `lib/*` layout (§6), noted the cube API now
      lives at `lib/stores/cube.svelte.ts`, and documented the new Qwen
      generate entry points (`lib/api/narrate.ts` streaming from
      `/narrate/lesson` / `/narrate/walkthrough`). Also lightly updated the
      "What you can do today" bullets and the Roadmap's first bullet to reflect
      that cube-driven Qwen generation now ships (catalog/practice/topic-based
      generation remain future work).
- [x] **Verify:** `npm run check` (0 errors) and `npm run test` (145 tests, 14
      files) clean in the renamed `frontend/`. Stood up a real backend
      (`python3 -m venv backend/.venv && pip install -r requirements.txt`,
      `uvicorn main:app --port 8000`, repo-root `.env` holding a real
      `DASHSCOPE_API_KEY`) alongside the SvelteKit dev server, then drove the
      actual UI with Playwright end-to-end: clicked "Lesson from my cube
      (Qwen)" in the Lessons modal, watched the status text progress
      ("step 1 of 6" → "step 6 of 6") as the backend streamed real Qwen-narrated
      `/narrate/lesson` SSE frames, confirmed the generated lesson
      ("Solve your cube, step by step") appeared in the catalog list, became
      the selected/active lesson with real narration and a coaching hint, and
      the Stage Caption updated live. Repeated the same flow for "Solve my
      cube (Qwen)" in the Explore modal against `/narrate/walkthrough`
      (6 beats, ~30s/beat), confirming the generated walkthrough
      ("Watch the full solve") loaded and the Stage Caption updated. Both
      flows matched the legacy main.ts's exact behavior: the generate button
      disables and shows live progress text during streaming, and the modal
      only auto-collapses after a successful load.

## 13. Risks / open questions

- **Threlte version churn**: Threlte ships fast; pin a version and check its
  changelog against Svelte 5 runes compatibility before scaffolding.
- **iOS Safari WebGL quirks**: pixel ratio / context-loss handling on iOS
  sometimes needs extra care (e.g. handling `webglcontextlost`) — not present
  in the current code; add if real-device testing surfaces it.
- **Bundle size on mobile**: `three` + `@threlte/core` + `@threlte/extras` is
  heavier than raw `three`; consider route-level code-splitting (lazy-load
  panels) if first-paint time on mobile is a concern post-migration.
- **Landscape phone layout**: the bottom HUD bar may be cramped in landscape
  on small phones — not addressed in this plan; flag as a follow-up rather
  than blocking the migration.

## 14. Out of scope (explicitly deferred)

- Any backend/Qwen content-generation changes (see root README roadmap).
- New lesson/practice/walkthrough content.
- Multiplayer/leaderboard/profile pages — only the *capability* to add them
  easily is in scope, not the pages themselves.

# Frontend Revamp: SvelteKit + Threlte

Status: **proposal — not yet implemented**
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

> **Staging note (added during Phase 1):** this tree is built incrementally
> in a sibling directory, `frontend-sveltekit/`, so the working vanilla app
> in `frontend/` keeps running untouched until the Phase 6 cutover swaps it
> in. Paths below are written as their final `frontend/...` form; during
> Phases 1–5 read every `frontend/` path as `frontend-sveltekit/`.

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

### Phase 2 — Core + scene
- [ ] Port `lib/cube/*` (`state.ts`, `events.ts`, `scramble.ts`, new shared `moves.ts`)
- [ ] Build `CubeCanvas.svelte` (camera/lights, was `scene/scene.ts`)
- [ ] Build `CubeMesh.svelte` (was `scene/cube/cube.ts` + `cubelets.ts`)
- [ ] Wire `animator.ts` via `bind:ref` + `useTask`
- [ ] **Verify:** solved cube renders, idle drift runs, `OrbitControls` works in debug mode

### Phase 3 — Interaction
- [ ] Port `drag-controls.ts` (Pointer Events, unchanged logic)
- [ ] Port `keyboard.ts`
- [ ] Build `TouchMovePad.svelte` (on-screen move pad for touch)
- [ ] **Verify:** face drag turns layers on desktop and a touch-emulated viewport; keyboard shortcuts still work

### Phase 4 — Panels + engines
- [ ] Port `education/*` engines unchanged (lesson, practice, walkthrough, coaching, profile, validators)
- [ ] Build `lib/stores/*.svelte.ts` (cube, lesson, practice, walkthrough, profile)
- [ ] Build `LessonsPanel.svelte`, `PracticePanel.svelte`, `ExplorePanel.svelte`
- [ ] Build `DebuggerPanel.svelte`, `LevelPanel.svelte`, `StageCaption.svelte`, `HudBar.svelte`
- [ ] **Verify:** a full lesson can be started, stepped through, and completed; only one panel/caption owner at a time, matching today's `closeOthers` rule

### Phase 5 — Retro skin + mobile pass
- [ ] Build `tokens.css` (synthwave palette: `#07030d` bg, `#ff2bd6`/`#00f0ff` accents)
- [ ] Build `retro.css` (grid-horizon background, neon panel glow)
- [ ] Add safe-area insets (`env(safe-area-inset-bottom)`) to HUD bar + stage caption
- [ ] Bump HUD tap-target sizing for mobile (padding/font-size at the 760px breakpoint)
- [ ] Disable page pinch/double-tap zoom on the canvas (`touch-action: none`)
- [ ] Wire up the currently-dead `SCENE_CONFIG.isMobile` flag (lower pixel ratio, disable antialias)
- [ ] **Verify:** manual check in a real mobile viewport (or device emulation) — legibility of neon-on-black text, no accidental browser zoom while dragging, HUD reachable with a thumb

### Phase 6 — Backend wiring + cutover
- [ ] Port `narrate.ts` (SSE client, unchanged parsing logic)
- [ ] Switch `VITE_BACKEND_URL` → `PUBLIC_BACKEND_URL` (`$env/static/public`)
- [ ] Confirm `backend/config.py`'s `cors_origins` still matches the SvelteKit dev port
- [ ] Update root `package.json` scripts if SvelteKit's script names differ from today's `dev`/`build`/`preview`/`test`
- [ ] Remove the old vanilla `frontend/src/*` tree
- [ ] Update the root [README](../../README.md)'s "How it works" section/tree
- [ ] **Verify:** lesson/walkthrough generation streams end-to-end against the existing FastAPI backend with no backend changes

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

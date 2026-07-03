# Plan: /play Guide Interactivity Revamp

## Context

The `/play` page (`frontend/src/routes/play/+page.svelte`) composes:
- `CubeCanvas` / `CubeMesh` — Three.js scene (full-screen WebGL canvas, behind all HUD)
- `HudBar` — Guide button, tab rail, modal backdrop (`z-index: 200`)
- `StageCaption` — floating overlay showing active lesson/drill/walkthrough step (`z-index: 15`)
- `TouchMovePad` — keypad overlay

Key stores involved: `lessonStore`, `cubeStore`, `demoStore`, `walkthroughStore`.

---

## Issue 1 — Cube hidden behind Guide modal

**Problem:** When Guide is open and any tab's modal is showing (`z-index: 200` backdrop in `HudBar`), the 3D cube is behind it. The user can't see the cube while reading a lesson list or the lesson detail.

**Root cause:** The WebGL canvas fills the viewport behind all DOM overlays. There is no mechanism to push the cube into the upper portion of the screen when the modal is open.

**Approach:** Reuse the existing `demoStore.mainCubeShift` / `cube.root.position.x` pattern in `CubeMesh.svelte`. Add a new reactive signal (e.g. `demoStore.modalOpen: boolean`) or a standalone writable rune that `HudBar` sets `true` when `activeId !== null`. In `CubeMesh.svelte`'s `useTask`, animate `cube.root.position.y` up toward a target offset (e.g. `+1.2`) when the modal is open, back to `0` when closed.

**Files to change:**
- `src/lib/stores/demo.svelte.ts` — add `modalOpen` flag (or create a tiny `uiStore.svelte.ts`)
- `src/lib/scene/CubeMesh.svelte` — read the flag, animate Y position in `useTask`
- `src/lib/components/HudBar.svelte` — set flag when `activeId` changes

**Verify:** Open Guide → Lessons; cube should slide upward and remain visible above the modal.

---

## Issue 2 — Three.js direction arrow overlay

**Problem:** There is no visual cue in the 3D scene showing which direction a face will turn.

**Approach:** Create `src/lib/scene/DirectionArrow.ts` — a Three.js `ArrowHelper` (or a custom curved-arc mesh built from `THREE.TorusGeometry` + `THREE.ConeGeometry`) attached to the cube's root `THREE.Group`. The arrow renders inside the same WebGL canvas so it composites naturally over the cube without any z-index issues.

API design:
```ts
class DirectionArrow {
  constructor(scene: THREE.Object3D);
  // Show arrow: origin at face centre, pointing in rotation direction
  show(face: FaceKey, direction: 1 | -1, opacity?: number): void;
  // Animate opacity toward 0 then hide
  fadeOut(): void;
  // Called each frame to drive fade animation
  update(dt: number): void;
}
```

Placement: `CubeMesh.svelte` instantiates one `DirectionArrow` and calls `update()` inside `useTask`.

**Files to change:**
- `src/lib/scene/direction-arrow.ts` (new)
- `src/lib/scene/CubeMesh.svelte` — instantiate, wire `update()`, expose via store or callback

---

## Issue 3 — Arrow fade-in on swipe, fade-out on release

**Problem:** No visual feedback during a drag gesture showing the about-to-execute move direction.

**Approach:** Extend `DragOptions` in `drag-controls.ts`:
```ts
interface DragOptions {
  // existing
  onMove?: (move: string) => void;
  onPreviewLayer?: (cubies: Cubie[] | null) => void;
  // new
  onDragStart?: (face: FaceKey) => void;
  onDragDirection?: (face: FaceKey, direction: 1 | -1) => void;
  onDragEnd?: () => void;
}
```

- `onDragStart` fires in `onPointerDown` after a sticker is hit.
- `onDragDirection` fires in `onPointerMove` once `resolveAxisSlice` resolves a direction (replaces or extends the existing layer preview).
- `onDragEnd` fires in `onPointerUp` and `onPointerCancel`.

In `CubeMesh.svelte`, pass these callbacks to `attachDragControls`:
- `onDragStart` → `directionArrow.show(face, 0)` (dim, no direction yet)
- `onDragDirection` → `directionArrow.show(face, direction, 1.0)` (full opacity, fade-in via lerp)
- `onDragEnd` → `directionArrow.fadeOut()`
- `onMove` (existing, fires on pointer-up) → no arrow change (fadeOut already triggered)

The `DirectionArrow.update(dt)` method lerps opacity toward its target each frame for smooth fade.

**Files to change:**
- `src/lib/scene/drag-controls.ts` — add three callbacks to `DragOptions`
- `src/lib/scene/CubeMesh.svelte` — wire callbacks to `DirectionArrow`

---

## Issue 4 — Direction arrow driven by lesson/stage expected moves

**Problem:** When a lesson step has `expectedMoves`, the arrow should proactively hint the next move rather than waiting for the user to start dragging.

**Approach:** In `CubeMesh.svelte`, subscribe to `lessonStore.snapshot` reactively (`$effect`). When `snapshot.step.expectedMoves[0]` changes, parse the move string with `moveFromAxisSlice` in reverse (or build a small helper `moveToFaceDirection(move): { face, direction }`) and call `directionArrow.show(face, direction, 0.45)` at reduced opacity so it acts as a hint rather than a command. When the user drags, the swipe-driven logic in Issue 3 takes over at full opacity. When `expectedMoves` is empty or the step changes, call `directionArrow.fadeOut()`.

The arrow shown for walkthrough steps (which already expose `walkthrough.currentMove` in `StageCaption`) should follow the same logic — the `walkthroughStore` already provides `currentMove`.

**New helper needed:**
```ts
// src/lib/scene/direction-arrow.ts
export function moveToFaceDirection(move: string): { face: FaceKey; direction: 1 | -1 } | null
```

**Files to change:**
- `src/lib/scene/direction-arrow.ts` — add `moveToFaceDirection`
- `src/lib/scene/CubeMesh.svelte` — `$effect` on `lessonStore` + `walkthroughStore`

---

## Issue 5 — Lesson detail (`lsn-detail`) moves to StageCaption modal

**Problem:** After selecting a lesson in the Lessons panel, the `lsn-detail` block in `LessonsPanel.svelte` is hidden because `onSelect()` → `collapse()` closes the whole modal. The lesson detail is only visible inside the panel, which closes immediately. The `StageCaption` component shows a trimmed version (`step.title — step.body`) but not the full detail (step counter, action buttons, coaching messages, expected moves pill, etc.).

**Goal:** After lesson selection, the `StageCaption` becomes the primary interactive surface for the lesson — rich enough to replace `lsn-detail` so the user can follow along without reopening the Guide modal.

**Approach:**

1. **Expand `StageCaption` for lesson owner:** The lesson branch of the `active` derived value already has access to the full `lessonStore.snapshot`. Extend the template to show all `lsn-detail` fields: step counter, step title + body, expected moves pill, coaching messages, action buttons (Set up step, Show me how, Apply example moves, Back to checkpoint, Mark complete, Previous, Next, Reset lesson).

2. **Remove `lsn-detail` from `LessonsPanel`:** Once StageCaption renders this, `LessonsPanel` no longer needs `.lsn-detail`. The panel's only job becomes the lesson list picker and the AI generate button. After `selectLesson()`, `onSelect()` → `collapse()` closes the modal — the user lands on the cube + StageCaption lesson view.

3. **Layout:** `StageCaption` is currently `width: min(32%, 340px)` on desktop and a bottom sheet on mobile. With the extra buttons it will need more vertical space — raise `max-height` to `80vh` for the lesson owner and add internal scroll. On mobile, adjust the bottom offset so the action buttons remain tappable.

**Files to change:**
- `src/lib/components/StageCaption.svelte` — expand lesson branch with full lsn-detail content + action buttons; import `lessonStore` methods directly (already imported); add styles for the new sections
- `src/lib/panels/LessonsPanel.svelte` — remove `.lsn-detail` block and its styles

**Verify:** Select a lesson → modal closes → StageCaption shows step counter, step body, expected moves, coaching messages, and all action buttons. Clicking "Next" advances the step and StageCaption updates. Clicking "Show me how" opens DemoWindow as before.

---

## Implementation Order

```
1. Issue 5 (lsn-detail → StageCaption)
   → verify: lesson flow is complete in StageCaption alone

2. Issue 1 (cube moves up on modal open)
   → verify: cube visible above Guide modal

3. Issue 2 (DirectionArrow Three.js class)
   → verify: show/fadeOut renders correctly at known face/direction

4. Issue 3 (arrow on swipe gesture)
   → verify: drag on U-face fades arrow in, release fades out

5. Issue 4 (arrow from lesson/walkthrough expected move)
   → verify: starting a lesson step with expectedMoves shows hint arrow at low opacity
```

---

## Checklist

### Phase 1 — Lesson detail into StageCaption (Issue 5) ✅

> Goal: selecting a lesson closes the modal and the full lesson UI lives in StageCaption.

- [x] Expand `StageCaption.svelte` lesson branch
  - [x] Add step counter (`Step N of M`)
  - [x] Add expected moves pill (monospace badge, same style as `.lsn-moves`)
  - [x] Add coaching messages section (hint / mistake / recommendation)
  - [x] Add action buttons row: Set up step, Show me how, Apply example moves, Back to checkpoint
  - [x] Add nav buttons row: Previous, Next, Reset lesson
  - [x] Add Mark complete button (only for `manual` validator when step not yet done)
  - [x] Raise `max-height` to `80vh` for lesson owner on desktop; ensure internal scroll works
  - [x] Adjust mobile bottom offset so action buttons are above the quick-actions bar
- [x] Remove `.lsn-detail` block from `LessonsPanel.svelte` (markup + styles)
- [ ] Verify: select a lesson → modal closes → StageCaption shows full detail
- [ ] Verify: Next/Previous advance steps and StageCaption updates live
- [ ] Verify: "Show me how" still opens DemoWindow correctly
- [ ] Verify: coaching messages appear after a wrong move

### Phase 2 — Cube moves up on modal open (Issue 1) ✅

> Goal: the 3D cube is visible in the upper region of the viewport while the Guide modal is open.

- [x] Add `modalOpen: boolean` to `demoStore.svelte.ts` (writable rune, default `false`)
- [x] In `HudBar.svelte`, set `demoStore.modalOpen = activeId !== null` whenever `activeId` changes (`$effect`)
- [x] In `CubeMesh.svelte` `useTask`, lerp `cube.root.position.y` toward `+1.2` when `demoStore.modalOpen`, back to `0` otherwise (same coefficient as the existing X-shift: `0.15`)
- [ ] Verify: open Guide → Lessons; cube animates upward and stays visible
- [ ] Verify: close modal; cube animates back to centre
- [ ] Verify: existing demo-window left-shift is unaffected

### Phase 3 — DirectionArrow Three.js class (Issue 2) ✅

> Goal: a reusable 3D arrow class that can be shown/faded inside the WebGL scene.

- [x] Create `src/lib/scene/direction-arrow.ts`
  - [x] Define `DirectionArrow` class with `show(face, direction, opacity)`, `fadeOut()`, `update()` methods
  - [x] Arc (LineBasicMaterial) + cone (MeshBasicMaterial) parented to a `THREE.Group` inside `cube.root`
  - [x] Position arrow at the face centre (offset 1.75 units from cube origin along face normal)
  - [x] `update()` lerps `material.opacity` toward target; hides group when opacity reaches `~0.005`
  - [x] Export `moveToFaceDirection(move: string): { face: FaceKey; direction: 1 | -1 } | null` helper
- [x] In `CubeMesh.svelte`, instantiate `DirectionArrow` and call `directionArrow.update()` in `useTask`
- [ ] Verify: call `show('U', 1, 1.0)` manually via browser console; arrow appears on top face pointing clockwise
- [ ] Verify: `fadeOut()` smoothly fades the arrow over ~300 ms

### Phase 4 — Arrow fade-in/out on swipe gesture (Issue 3) ✅

> Goal: dragging a face fades the direction arrow in; releasing fades it out.

- [x] Add `onDragStart?: (face: FaceKey) => void` to `DragOptions` in `drag-controls.ts`
- [x] Add `onDragDirection?: (face: FaceKey, direction: 1 | -1) => void` to `DragOptions`
- [x] Add `onDragEnd?: () => void` to `DragOptions`
- [x] Fire `onDragStart` in `onPointerDown` after sticker hit is confirmed
- [x] Fire `onDragDirection` in `onPointerMove` when `resolveDragToMove` resolves a move (uses `parseMove` for correct direction)
- [x] Fire `onDragEnd` in both `onPointerUp` and `onPointerCancel`
- [x] In `CubeMesh.svelte`, pass callbacks to `attachDragControls`:
  - [x] `onDragDirection` → `directionArrow.show(face, direction, 1.0)`
  - [x] `onDragEnd` → `applyHint()` (restores hint arrow if active, else fades out)
- [ ] Verify: drag on U face → arrow fades in at full opacity showing correct direction
- [ ] Verify: release → arrow fades out smoothly (or restores lesson hint)
- [ ] Verify: cancelled gesture (pointer leaves window) also fades arrow out

### Phase 5 — Arrow hint from lesson / walkthrough expected move (Issue 4) ✅

> Goal: when a lesson step or walkthrough beat specifies a move, show a low-opacity hint arrow before the user drags.

- [x] Implement `moveToFaceDirection` in `direction-arrow.ts` — parse standard WCA move notation (e.g. `U`, `R'`, `F2`) into `{ face, direction }`; return `null` for slice moves or whole-cube rotations
- [x] In `CubeMesh.svelte`, single `$effect` watching both `lessonStore.snapshot.step.expectedMoves[0]` and `walkthroughStore.snapshot.currentMove`
  - [x] On change: call `directionArrow.show(face, direction, 0.45)` for hint opacity; store as `hintMove`
  - [x] On null / empty: `hintMove = null` + `directionArrow.fadeOut()`
- [x] Swipe gesture overrides hint — `onDragDirection` at `1.0` supersedes the hint; `onDragEnd` calls `applyHint()` which restores the `0.45` hint if `hintMove` is set, or fades out
- [ ] Verify: start a lesson step with `expectedMoves: ['U']` → hint arrow appears at low opacity on U face
- [ ] Verify: drag in the correct direction → arrow brightens to full opacity
- [ ] Verify: step completes → hint arrow fades out; next step's expected move shows new hint

---

## Files Summary

| File | Change type |
|---|---|
| `src/lib/components/StageCaption.svelte` | Expand lesson branch, add full lsn-detail UI |
| `src/lib/panels/LessonsPanel.svelte` | Remove lsn-detail block |
| `src/lib/scene/direction-arrow.ts` | New — Three.js arrow class + `moveToFaceDirection` |
| `src/lib/scene/drag-controls.ts` | Add `onDragStart`, `onDragDirection`, `onDragEnd` to `DragOptions` |
| `src/lib/scene/CubeMesh.svelte` | Wire arrow, subscribe to lesson/walkthrough for hint arrows |
| `src/lib/stores/demo.svelte.ts` | Add `modalOpen` flag (or new `uiStore`) |
| `src/lib/components/HudBar.svelte` | Set `modalOpen` when `activeId` is non-null |
